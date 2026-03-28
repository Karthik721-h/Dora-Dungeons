import { Dungeon, Room, Direction, EventType, RoomEvent } from "../types/index.js";
import { createEnemy } from "../entities/Enemy.js";
import { ITEMS, cloneItem } from "../systems/ItemSystem.js";

function makeEvent(type: EventType, opts: Partial<RoomEvent> = {}): RoomEvent {
  return { type, triggered: false, ...opts };
}

function buildRoom(
  id: string,
  name: string,
  description: string,
  exits: Partial<Record<Direction, string>>,
  event: RoomEvent,
  items: RoomEvent["itemReward"][] = [],
  ambientDescription?: string
): Room {
  return {
    id,
    name,
    description,
    exits,
    event,
    items: items.filter((i): i is NonNullable<typeof i> => !!i).map((i) => ({ ...i })),
    isExplored: false,
    ambientDescription,
  };
}

export function createDefaultDungeon(): Dungeon {
  const rooms = new Map<string, Room>();

  rooms.set(
    "room-entrance",
    buildRoom(
      "room-entrance",
      "The Dungeon Entrance",
      "You stand at the threshold of darkness. A damp chill seeps from the stone walls. Torches flicker and cast long shadows. Scratches on the wall read: 'Turn back.' You won't.",
      { [Direction.NORTH]: "room-hall", [Direction.EAST]: "room-armory" },
      makeEvent(EventType.STORY, {
        storyText: "An ancient inscription on the archway reads: 'Only the worthy shall pass — the weak shall feed the dark.' Your quest begins.",
      }),
      [],
      "The air is cold and smells of rot and old stone."
    )
  );

  rooms.set(
    "room-hall",
    buildRoom(
      "room-hall",
      "The Main Hall",
      "A vast corridor of crumbling stone columns. Bones crunch underfoot. Two goblins patrol the far end — a wiry scout and a brutish grunt. Their yellow eyes snap toward you.",
      {
        [Direction.SOUTH]: "room-entrance",
        [Direction.EAST]: "room-storage",
        [Direction.NORTH]: "room-crypts",
      },
      makeEvent(EventType.COMBAT, {
        enemies: [createEnemy("goblin_scout"), createEnemy("goblin_grunt")],
      }),
      [],
      "The distant dripping of water echoes in the dark."
    )
  );

  rooms.set(
    "room-armory",
    buildRoom(
      "room-armory",
      "The Abandoned Armory",
      "Weapon racks line the walls, most rusted and broken. But a gleaming iron sword catches your eye — still sharp. A suit of leather armor hangs nearby. No enemies here, for now.",
      { [Direction.WEST]: "room-entrance" },
      makeEvent(EventType.TREASURE, {
        storyText: "You rummage through the armory and find usable equipment!",
        itemReward: cloneItem(ITEMS.iron_sword!),
        goldReward: 10,
      }),
      [cloneItem(ITEMS.leather_armor!), cloneItem(ITEMS.health_potion!)],
      "The smell of oil and rust fills the air."
    )
  );

  rooms.set(
    "room-storage",
    buildRoom(
      "room-storage",
      "The Storage Room",
      "Rotting crates and cracked barrels fill this room. A skeletal warrior rises from behind a collapsed shelf — its jaw clicks open in a silent scream.",
      { [Direction.WEST]: "room-hall", [Direction.NORTH]: "room-library" },
      makeEvent(EventType.COMBAT, {
        enemies: [createEnemy("skeleton")],
      }),
      [cloneItem(ITEMS.health_potion!), cloneItem(ITEMS.mana_potion!)],
      "The floorboards creak underfoot. Something skitters in the dark corners."
    )
  );

  rooms.set(
    "room-library",
    buildRoom(
      "room-library",
      "The Forgotten Library",
      "Towering shelves of crumbling tomes reach the vaulted ceiling. A robed Dark Mage turns from a glowing lectern, eyes blazing with violet fire. This one won't let you read in peace.",
      { [Direction.SOUTH]: "room-storage", [Direction.NORTH]: "room-crypts" },
      makeEvent(EventType.COMBAT, {
        enemies: [createEnemy("dark_mage")],
      }),
      [cloneItem(ITEMS.enchanted_ring!), cloneItem(ITEMS.mana_potion!)],
      "Whispering pages drift through the air. Knowledge and danger hang equally heavy."
    )
  );

  rooms.set(
    "room-crypts",
    buildRoom(
      "room-crypts",
      "The Ancient Crypts",
      "Low-hanging burial niches line the walls. Two skeleton warriors animate as you enter — their empty sockets glowing faint red. A pressure plate glints in the moonlight ahead.",
      {
        [Direction.SOUTH]: "room-hall",
        [Direction.WEST]: "room-library",
        [Direction.NORTH]: "room-throne",
      },
      makeEvent(EventType.COMBAT, {
        enemies: [createEnemy("skeleton"), createEnemy("skeleton")],
      }),
      [],
      "The silence here has a weight to it. You are not alone."
    )
  );

  rooms.set(
    "room-trap",
    buildRoom(
      "room-trap",
      "The Pressure Chamber",
      "This narrow passage is unnervingly clean — no dust, no bones. Something is wrong.",
      { [Direction.EAST]: "room-crypts", [Direction.NORTH]: "room-throne" },
      makeEvent(EventType.TRAP, { trapDamage: 18 }),
      [cloneItem(ITEMS.health_potion!)],
      "The air hums with tension."
    )
  );

  rooms.set(
    "room-throne",
    buildRoom(
      "room-throne",
      "The Dark Throne Room",
      "A vast, vaulted chamber dominated by an obsidian throne. On it sits the Orc Warlord — massive, scarred, armored in black iron. Two Orc Guards flank him. The warlord's eye opens. 'Another fool has come to die.'",
      { [Direction.SOUTH]: "room-crypts" },
      makeEvent(EventType.COMBAT, {
        enemies: [
          createEnemy("orc_guard"),
          createEnemy("orc_guard"),
          createEnemy("orc_warlord"),
        ],
      }),
      [],
      "The torches burn black here. The air tastes of iron and dread."
    )
  );

  return {
    rooms,
    startRoomId: "room-entrance",
    bossRoomId: "room-throne",
  };
}

export class DungeonManager {
  private dungeon: Dungeon;

  constructor(dungeon: Dungeon) {
    this.dungeon = dungeon;
  }

  getRoom(roomId: string): Room | undefined {
    return this.dungeon.rooms.get(roomId);
  }

  canMove(fromRoomId: string, direction: Direction): string | null {
    const room = this.getRoom(fromRoomId);
    if (!room) return null;
    return room.exits[direction] ?? null;
  }

  markExplored(roomId: string): void {
    const room = this.dungeon.rooms.get(roomId);
    if (room) room.isExplored = true;
  }

  getActiveEnemies(roomId: string): import("../types/index.js").Enemy[] {
    const room = this.getRoom(roomId);
    if (!room) return [];
    return (room.event.enemies ?? []).filter((e) => !e.isDefeated);
  }

  isAllClear(roomId: string): boolean {
    return this.getActiveEnemies(roomId).length === 0;
  }

  isBossRoom(roomId: string): boolean {
    return roomId === this.dungeon.bossRoomId;
  }

  hasUntriggeredEvent(roomId: string): boolean {
    const room = this.getRoom(roomId);
    return !!room && !room.event.triggered;
  }
}
