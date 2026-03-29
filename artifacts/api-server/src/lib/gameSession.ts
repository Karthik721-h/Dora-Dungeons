/**
 * Per-user game session: load, save, and state hydration.
 *
 * The game engine stores Dungeon.rooms as a Map<string, Room>.
 * JSON.stringify collapses Maps to {}, so we convert Map ↔ entries[]
 * on the way out/in. No game engine files are touched.
 */
import { db, gameSessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GameEngine, GameState, Room } from "@workspace/game-engine";

// ── Serialization ─────────────────────────────────────────────────────────────

type StoredState = Omit<GameState, "dungeon"> & {
  dungeon: Omit<GameState["dungeon"], "rooms"> & {
    rooms: [string, Room][];
  };
};

function toStorable(state: GameState): StoredState {
  return {
    ...state,
    dungeon: {
      ...state.dungeon,
      rooms: Array.from(state.dungeon.rooms.entries()),
    },
  };
}

function fromStorable(stored: StoredState): GameState {
  return {
    ...stored,
    dungeon: {
      ...stored.dungeon,
      rooms: new Map(stored.dungeon.rooms),
    },
  } as GameState;
}

// ── Engine hydration ──────────────────────────────────────────────────────────

/**
 * Create a GameEngine with an existing GameState injected.
 * We bypass the private field because the engine has no loadState() method,
 * and we must not modify the game engine package.
 */
export function hydrateEngine(state: GameState): GameEngine {
  const engine = new GameEngine();
  (engine as unknown as { state: GameState }).state = state;
  return engine;
}

// ── DB helpers ────────────────────────────────────────────────────────────────

export async function loadSession(
  userId: string,
): Promise<{ engine: GameEngine; state: GameState } | null> {
  const [row] = await db
    .select()
    .from(gameSessionsTable)
    .where(eq(gameSessionsTable.userId, userId))
    .limit(1);

  if (!row) return null;

  const state = fromStorable(row.state as unknown as StoredState);
  const engine = hydrateEngine(state);
  return { engine, state };
}

export async function saveSession(
  userId: string,
  state: GameState,
): Promise<void> {
  const stored = toStorable(state) as unknown as Record<string, unknown>;

  await db
    .insert(gameSessionsTable)
    .values({ userId, state: stored })
    .onConflictDoUpdate({
      target: gameSessionsTable.userId,
      set: { state: stored, updatedAt: new Date() },
    });
}

export async function deleteSession(userId: string): Promise<void> {
  await db.delete(gameSessionsTable).where(eq(gameSessionsTable.userId, userId));
}
