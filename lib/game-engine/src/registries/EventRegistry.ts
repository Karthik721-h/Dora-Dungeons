import { RoomEvent, EventType, Player, Item } from "../types/index.js";
import { NarrationEngine } from "../narration/NarrationEngine.js";

export interface EventResult {
  narration: string[];
  combatTriggered: boolean;
  goldGained: number;
  itemFound?: Item;
  damageDealt: number;
  mpRestored?: number;
}

type EventHandler = (event: RoomEvent, player: Player) => EventResult;

const handlers = new Map<string, EventHandler>();

/**
 * EventRegistry
 *
 * Maps event type strings to handler functions.
 * Adding a new event type = call register() once.
 * No existing code needs to change.
 *
 * Built-ins: COMBAT | TREASURE | TRAP | STORY | SHRINE | EMPTY
 * Custom:    register("MY_EVENT", handler)
 */
export const EventRegistry = {
  register(type: EventType | string, handler: EventHandler): void {
    handlers.set(type, handler);
  },

  trigger(event: RoomEvent, player: Player): EventResult {
    if (event.triggered) {
      return { narration: [], combatTriggered: false, goldGained: 0, damageDealt: 0 };
    }

    event.triggered = true;

    const handler = handlers.get(event.type);
    if (!handler) {
      return { narration: [], combatTriggered: false, goldGained: 0, damageDealt: 0 };
    }

    return handler(event, player);
  },

  has(type: string): boolean {
    return handlers.has(type);
  },

  registeredTypes(): string[] {
    return [...handlers.keys()];
  },
};

EventRegistry.register(EventType.COMBAT, (event) => {
  const enemies = (event.enemies ?? []).filter((e) => !e.isDefeated);
  if (enemies.length === 0) {
    return { narration: [], combatTriggered: false, goldGained: 0, damageDealt: 0 };
  }
  return {
    narration: [NarrationEngine.combatStart(enemies)],
    combatTriggered: true,
    goldGained: 0,
    damageDealt: 0,
  };
});

EventRegistry.register(EventType.TREASURE, (event) => {
  const gold = event.goldReward ?? 0;
  const item = event.itemReward;
  const narration: string[] = [];

  if (item) {
    narration.push(NarrationEngine.treasureFound(item.name, gold));
  } else if (event.storyText) {
    narration.push(event.storyText);
    if (gold > 0) narration.push(NarrationEngine.goldGained(gold));
  }

  return { narration, combatTriggered: false, goldGained: gold, itemFound: item, damageDealt: 0 };
});

EventRegistry.register(EventType.TRAP, (event, player) => {
  const damage = event.trapDamage ?? 0;
  const dodgeChance = player.speed >= 12 ? 0.4 : 0.2;

  if (Math.random() < dodgeChance) {
    return {
      narration: [NarrationEngine.trapAvoided()],
      combatTriggered: false,
      goldGained: 0,
      damageDealt: 0,
    };
  }

  player.hp = Math.max(0, player.hp - damage);
  return {
    narration: [
      NarrationEngine.trapTriggered(damage),
      `You now have ${player.hp}/${player.maxHp} HP.`,
    ],
    combatTriggered: false,
    goldGained: 0,
    damageDealt: damage,
  };
});

EventRegistry.register(EventType.STORY, (event) => ({
  narration: event.storyText ? [event.storyText] : [],
  combatTriggered: false,
  goldGained: 0,
  damageDealt: 0,
}));

/**
 * VALIDATION DEMO: SHRINE event — registered here, independently.
 * Zero changes to any existing handler or engine logic.
 *
 * Shrine types: "health" (restore 30 HP) | "mana" (restore 20 MP) | "fortune" (10 gold)
 */
EventRegistry.register(EventType.SHRINE, (event, player) => {
  const shrineType = event.shrineType ?? "health";
  const narration: string[] = [];
  let goldGained = 0;
  let mpRestored = 0;

  if (shrineType === "health") {
    const amount = Math.min(30, player.maxHp - player.hp);
    player.hp = Math.min(player.hp + amount, player.maxHp);
    narration.push(
      `A shrine of healing glows before you. Soft light washes over your wounds — ${amount} HP restored. (${player.hp}/${player.maxHp})`
    );
  } else if (shrineType === "mana") {
    const amount = Math.min(20, player.maxMp - player.mp);
    player.mp = Math.min(player.mp + amount, player.maxMp);
    mpRestored = amount;
    narration.push(
      `A shrine of arcane power pulses with violet light. ${amount} MP flows back into you. (${player.mp}/${player.maxMp})`
    );
  } else if (shrineType === "fortune") {
    goldGained = 15;
    narration.push(
      `A fortune shrine shimmers. Coins materialize from thin air — you pocket ${goldGained} gold.`
    );
  }

  return { narration, combatTriggered: false, goldGained, damageDealt: 0, mpRestored };
});

EventRegistry.register(EventType.EMPTY, () => ({
  narration: [],
  combatTriggered: false,
  goldGained: 0,
  damageDealt: 0,
}));
