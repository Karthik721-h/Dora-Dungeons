import { Dungeon, Room, Direction, EventType, RoomEvent, Item } from "../types/index.js";
import { RoomTemplate, ROOM_TEMPLATES, getTemplatesByDifficulty, getTemplateById } from "./roomTemplates.js";
import { ITEM_DEFINITIONS } from "../data/items.js";
import { ENEMY_TEMPLATES } from "../data/enemies.js";
import { scaleEnemy, shouldSpawnBonusEnemy, scaleGoldReward, scaleTrapDamage } from "../scaling/LevelScaling.js";
import crypto from "crypto";

/**
 * DungeonGenerator
 *
 * Generates a complete Dungeon from a seed string.
 * Same seed → same dungeon (reproducible).
 * Different seed → different layout, rooms, enemies, events.
 *
 * Architecture:
 *  - Room templates are pure data (generators/roomTemplates.ts)
 *  - Generator picks templates, connects them, instantiates events
 *  - GameEngine calls generateDungeon() — no hardcoded room flows
 */

function seededRng(seed: string): () => number {
  let h = 1779033703;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h ^= h >>> 16;
    h = Math.imul(h, 0x45d9f3b);
    h ^= h >>> 16;
    return (h >>> 0) / 0x100000000;
  };
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function pickIndex<T>(arr: T[], rng: () => number): number {
  return Math.floor(rng() * arr.length);
}

function randInt(min: number, max: number, rng: () => number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function cloneItem(item: Item): Item {
  return { ...item };
}

function createEnemy(templateKey: string): import("../types/index.js").Enemy {
  const template = ENEMY_TEMPLATES[templateKey];
  if (!template) throw new Error(`Unknown enemy template: ${templateKey}`);
  return {
    id: `${templateKey}-${Math.random().toString(36).slice(2, 8)}`,
    ...template,
    statusEffects: [],
    isDefeated: false,
  };
}

function makeEvent(template: RoomTemplate, rng: () => number, dungeonLevel = 1): RoomEvent {
  const eventType = pick(template.preferredEvents, rng);

  const base: RoomEvent = { type: eventType, triggered: false };

  switch (eventType) {
    case EventType.COMBAT: {
      const groups = template.enemyGroups ?? [];
      const group = groups.length > 0 ? pick(groups, rng) : [];
      base.enemies = group.map((k) => createEnemy(k));

      // At higher dungeon levels, non-boss combat rooms may spawn a bonus enemy.
      // Uses the seeded RNG so the result is deterministic for a given seed+level.
      const isBossRoom = template.tags.includes("boss");
      if (!isBossRoom && base.enemies && base.enemies.length > 0) {
        const bonusRoll = rng();
        if (shouldSpawnBonusEnemy(dungeonLevel, bonusRoll) && groups.length > 0) {
          const bonusGroup = pick(groups, rng);
          const bonusKey   = bonusGroup[0]; // pick the first (weakest) enemy from a group
          if (bonusKey) base.enemies.push(createEnemy(bonusKey));
        }
      }
      break;
    }

    case EventType.TREASURE: {
      const items = template.treasureItems ?? [];
      if (items.length > 0) {
        const itemId = pick(items, rng);
        const def = ITEM_DEFINITIONS[itemId];
        if (def) base.itemReward = cloneItem(def);
      }
      const [min, max] = template.goldRange ?? [5, 20];
      const baseGold   = randInt(min, max, rng);
      base.goldReward  = scaleGoldReward(baseGold, dungeonLevel);
      break;
    }

    case EventType.TRAP: {
      const baseDmg    = template.trapDamage ?? randInt(10, 25, rng);
      base.trapDamage  = scaleTrapDamage(baseDmg, dungeonLevel);
      break;
    }

    case EventType.STORY: {
      base.storyText = pick(template.descriptionCandidates, rng);
      break;
    }

    case EventType.SHRINE: {
      base.shrineType = template.shrineType ?? "health";
      break;
    }

    default:
      break;
  }

  return base;
}

/**
 * Layout generation:
 *  Entrance ──N──▶ [chain of 3-5 rooms] ──N──▶ Boss Room
 *                         │
 *                         └──E──▶ [optional branch 1-2 rooms]
 */
interface LayoutNode {
  id: string;
  templateId: string;
  exits: Partial<Record<Direction, string>>;
}

function buildLayout(rng: () => number): LayoutNode[] {
  const nodes: LayoutNode[] = [];

  const entrance: LayoutNode = {
    id: "room-entrance",
    templateId: "entrance",
    exits: {},
  };
  nodes.push(entrance);

  const chainLength = randInt(3, 5, rng);
  const availableTemplates = getTemplatesByDifficulty(4);

  const usedTemplateIds = new Set<string>(["entrance", "boss_throne"]);
  const chainIds: string[] = ["room-entrance"];

  for (let i = 0; i < chainLength; i++) {
    const eligible = availableTemplates.filter((t) => !usedTemplateIds.has(t.id));
    const template = eligible.length > 0 ? pick(eligible, rng) : pick(availableTemplates, rng);
    usedTemplateIds.add(template.id);

    const id = `room-${template.id}-${i + 1}`;
    const node: LayoutNode = { id, templateId: template.id, exits: {} };
    nodes.push(node);
    chainIds.push(id);
  }

  for (let i = 0; i < chainIds.length - 1; i++) {
    const current = nodes.find((n) => n.id === chainIds[i])!;
    const next = nodes.find((n) => n.id === chainIds[i + 1])!;
    current.exits[Direction.NORTH] = next.id;
    next.exits[Direction.SOUTH] = current.id;
  }

  const hasBranch = rng() > 0.3;
  if (hasBranch) {
    const branchCount = randInt(1, 2, rng);
    const branchParentIdx = randInt(1, Math.max(1, chainIds.length - 2), rng);
    const branchParent = nodes.find((n) => n.id === chainIds[branchParentIdx])!;

    const branchTemplates = availableTemplates.filter((t) => !usedTemplateIds.has(t.id));
    let branchParentId = branchParent.id;

    for (let b = 0; b < branchCount && branchTemplates.length > 0; b++) {
      const idx = pickIndex(branchTemplates, rng);
      const template = branchTemplates.splice(idx, 1)[0]!;
      usedTemplateIds.add(template.id);

      const id = `room-branch-${template.id}`;
      const node: LayoutNode = {
        id,
        templateId: template.id,
        exits: { [Direction.WEST]: branchParentId },
      };

      const parent = nodes.find((n) => n.id === branchParentId)!;
      parent.exits[Direction.EAST] = id;

      nodes.push(node);
      branchParentId = id;
    }
  }

  const lastChainId = chainIds[chainIds.length - 1]!;
  const bossNode: LayoutNode = {
    id: "room-boss",
    templateId: "boss_throne",
    exits: { [Direction.SOUTH]: lastChainId },
  };
  const lastChainNode = nodes.find((n) => n.id === lastChainId)!;
  lastChainNode.exits[Direction.NORTH] = "room-boss";
  nodes.push(bossNode);

  return nodes;
}

function instantiateRoom(node: LayoutNode, rng: () => number, dungeonLevel = 1): Room {
  const template = ROOM_TEMPLATES.find((t) => t.id === node.templateId)!;

  const name = pick(template.nameCandidates, rng);
  const description = pick(template.descriptionCandidates, rng);
  const ambient = pick(template.ambientCandidates, rng);
  const event = makeEvent(template, rng, dungeonLevel);

  const groundItems: Item[] = [];
  if (template.treasureItems && template.preferredEvents.includes(EventType.COMBAT)) {
    if (rng() > 0.6) {
      const itemId = pick(template.treasureItems, rng);
      const def = ITEM_DEFINITIONS[itemId];
      if (def) groundItems.push(cloneItem(def));
    }
  }

  if (
    template.tags.includes("combat") ||
    template.tags.includes("early")
  ) {
    if (rng() > 0.5) {
      const def = ITEM_DEFINITIONS["health_potion"];
      if (def) groundItems.push(cloneItem(def));
    }
  }

  return {
    id: node.id,
    name,
    description,
    exits: node.exits,
    event,
    items: groundItems,
    isExplored: false,
    ambientDescription: ambient,
  };
}

export function generateDungeon(seed?: string, dungeonLevel = 1): Dungeon {
  const resolvedSeed = seed ?? crypto.randomUUID();
  const rng = seededRng(resolvedSeed);

  const entranceTemplate = getTemplateById("entrance")!;
  const entranceStoryText = pick(entranceTemplate.descriptionCandidates, rng);

  const layout = buildLayout(rng);
  const rooms = new Map<string, Room>();

  for (const node of layout) {
    const room = instantiateRoom(node, rng, dungeonLevel);

    if (node.id === "room-entrance") {
      room.event = {
        type: EventType.STORY,
        triggered: false,
        storyText: entranceStoryText,
      };
    }

    rooms.set(room.id, room);
  }

  // ── Post-generation: scale all enemy stats for the current dungeon level ──
  // Scaling happens here (after instantiation) so:
  //   a) it is always applied regardless of which template spawned the enemy
  //   b) restartLevel() re-reads the already-scaled maxHp when restoring HP
  if (dungeonLevel > 1) {
    for (const room of rooms.values()) {
      if (room.event.enemies) {
        for (const enemy of room.event.enemies) {
          scaleEnemy(enemy, dungeonLevel);
        }
      }
    }
  }

  return {
    rooms,
    startRoomId: "room-entrance",
    bossRoomId: "room-boss",
    seed: resolvedSeed,
  };
}
