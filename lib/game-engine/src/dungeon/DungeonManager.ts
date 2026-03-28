import { Dungeon, Room, Enemy, Direction } from "../types/index.js";

function createEnemy(id: string, name: string, hp: number, attack: number, defense: number, xpReward: number): Enemy {
  return { id, name, hp, maxHp: hp, attack, defense, xpReward, isDefeated: false };
}

function createRoom(
  id: string,
  name: string,
  description: string,
  exits: Partial<Record<Direction, string>>,
  enemies: Enemy[] = [],
  items: string[] = []
): Room {
  return {
    id,
    name,
    description,
    exits,
    enemies,
    items: items.map((name) => ({ id: `item-${name}`, name, description: `A ${name}`, type: "misc" })),
    isExplored: false,
  };
}

export function createDefaultDungeon(): Dungeon {
  const rooms = new Map<string, Room>();

  const entranceRoom = createRoom(
    "room-entrance",
    "Dungeon Entrance",
    "You stand at the entrance of a dark, damp dungeon. The smell of mold and danger fills the air. Flickering torches cast eerie shadows on the stone walls. You can hear distant growls to the north.",
    { [Direction.NORTH]: "room-hall", [Direction.EAST]: "room-armory" }
  );

  const hallRoom = createRoom(
    "room-hall",
    "The Main Hall",
    "A vast hall stretches before you. Cracked pillars line the walls and bones litter the floor. Two goblins patrol the far end. Exits lead south back to the entrance, east to a storage room, and north toward the throne room.",
    { [Direction.SOUTH]: "room-entrance", [Direction.EAST]: "room-storage", [Direction.NORTH]: "room-throne" },
    [
      createEnemy("goblin-1", "Goblin Scout", 20, 8, 3, 30),
      createEnemy("goblin-2", "Goblin Grunt", 25, 10, 4, 40),
    ]
  );

  const armoryRoom = createRoom(
    "room-armory",
    "The Armory",
    "Rusty weapons hang on the walls. Most are broken but you spot a usable sword. The room is empty of enemies for now. Exit leads west back to the entrance.",
    { [Direction.WEST]: "room-entrance" },
    [],
    ["Iron Sword", "Leather Gloves"]
  );

  const storageRoom = createRoom(
    "room-storage",
    "Storage Room",
    "Old crates and barrels fill this dusty room. A wounded skeleton lurches toward you. You spot a healing potion on a shelf. Exit leads west back to the main hall.",
    { [Direction.WEST]: "room-hall" },
    [createEnemy("skeleton-1", "Wounded Skeleton", 15, 6, 2, 25)],
    ["Health Potion"]
  );

  const throneRoom = createRoom(
    "room-throne",
    "The Dark Throne Room",
    "A massive chamber with a decaying throne at its center. The Dungeon Boss — the Orc Warlord — sits upon it, flanked by two orc guards. This is the final battle. Exit leads south back to the main hall.",
    { [Direction.SOUTH]: "room-hall" },
    [
      createEnemy("orc-guard-1", "Orc Guard", 40, 14, 8, 80),
      createEnemy("orc-guard-2", "Orc Guard", 40, 14, 8, 80),
      createEnemy("orc-boss", "Orc Warlord (Boss)", 80, 20, 12, 200),
    ]
  );

  rooms.set(entranceRoom.id, entranceRoom);
  rooms.set(hallRoom.id, hallRoom);
  rooms.set(armoryRoom.id, armoryRoom);
  rooms.set(storageRoom.id, storageRoom);
  rooms.set(throneRoom.id, throneRoom);

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

  getActiveEnemies(roomId: string): Enemy[] {
    const room = this.getRoom(roomId);
    if (!room) return [];
    return room.enemies.filter((e) => !e.isDefeated);
  }

  isAllClear(roomId: string): boolean {
    return this.getActiveEnemies(roomId).length === 0;
  }

  isBossRoom(roomId: string): boolean {
    return roomId === this.dungeon.bossRoomId;
  }
}
