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

/**
 * Fill in any Player fields that may be absent in sessions persisted before
 * the current schema version.  Safe to call on both old and new sessions.
 * Every field has a safe default so no undefined leaks into live state.
 */
function migratePlayer(player: GameState["player"]): GameState["player"] {
  const maxHp = Number(player.maxHp) || 100;
  const maxMp = Number(player.maxMp) || 50;
  return {
    ...player,
    // Core stats
    level:              player.level              ?? 1,
    xp:                 player.xp                ?? 0,
    xpToNextLevel:      player.xpToNextLevel      ?? 100,
    hp:                 player.hp                 ?? maxHp,
    maxHp,
    mp:                 player.mp                 ?? maxMp,
    maxMp,
    attack:             player.attack             ?? 10,
    defense:            player.defense            ?? 5,
    speed:              (player as any).speed     ?? 5,
    baseAttack:         player.baseAttack         ?? player.attack ?? 10,
    baseDefense:        player.baseDefense        ?? player.defense ?? 5,
    // Combat flags
    isDefending:        player.isDefending        ?? false,
    statusEffects:      player.statusEffects      ?? [],
    // Inventory
    abilities:          player.abilities          ?? [],
    inventory:          player.inventory          ?? [],
    gold:               player.gold               ?? 0,
    weapons:            player.weapons            ?? [],
    armors:             player.armors             ?? [],
    // Dungeon progression
    dungeonLevel:          player.dungeonLevel          ?? 1,
    dungeonLevelCompleted: player.dungeonLevelCompleted ?? false,
  };
}

/**
 * Clamp numeric values that must never be invalid in a live session.
 * Runs after migratePlayer — all fields are guaranteed to be present by then.
 *
 * Guards:  HP/MP never go below 0 or above their max
 *          Gold/turnCount never go negative
 *          Dungeon levels always ≥ 1
 */
function validateState(state: GameState): GameState {
  const p = state.player;

  const clamp = (v: number, lo: number, hi: number) =>
    isNaN(v) ? lo : Math.min(Math.max(v, lo), hi);

  p.maxHp = clamp(p.maxHp, 1, 99999);
  p.maxMp = clamp(p.maxMp, 0, 99999);
  p.hp    = clamp(p.hp,    0, p.maxHp);
  p.mp    = clamp(p.mp,    0, p.maxMp);

  p.gold  = clamp(p.gold,  0, 99999999);
  state.gold = clamp(state.gold, 0, 99999999);

  p.level        = clamp(p.level,        1, 9999);
  p.dungeonLevel = clamp(p.dungeonLevel, 1, 9999);

  state.turnCount = clamp(state.turnCount, 0, 9999999);

  // Trim logs to 80 entries on load as well as on save
  if (state.logs.length > 80) {
    state.logs = state.logs.slice(-80);
  }

  return state;
}

function fromStorable(stored: StoredState): GameState {
  const state = {
    ...stored,
    dungeon: {
      ...stored.dungeon,
      rooms: new Map(stored.dungeon.rooms),
    },
  } as GameState;

  state.player = migratePlayer(state.player);

  // Events are one-shot signals — they must not persist across requests.
  // Clear any event that was saved with the state (e.g. LEVEL_COMPLETED).
  delete state.event;

  return validateState(state);
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
