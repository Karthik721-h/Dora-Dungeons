import { Dungeon, Room, Direction } from "../types/index.js";

/**
 * DungeonManager
 *
 * Read-only query layer over a generated Dungeon.
 * Does not create or define rooms — that is DungeonGenerator's responsibility.
 */
export class DungeonManager {
  constructor(private dungeon: Dungeon) {}

  getRoom(roomId: string): Room | undefined {
    return this.dungeon.rooms.get(roomId);
  }

  canMove(fromRoomId: string, direction: Direction): string | null {
    return this.getRoom(fromRoomId)?.exits[direction] ?? null;
  }

  markExplored(roomId: string): void {
    const room = this.dungeon.rooms.get(roomId);
    if (room) room.isExplored = true;
  }

  getActiveEnemies(roomId: string): import("../types/index.js").Enemy[] {
    return (this.getRoom(roomId)?.event.enemies ?? []).filter((e) => !e.isDefeated);
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

  getRoomCount(): number {
    return this.dungeon.rooms.size;
  }

  getAllRoomIds(): string[] {
    return [...this.dungeon.rooms.keys()];
  }

  getSeed(): string {
    return this.dungeon.seed;
  }
}
