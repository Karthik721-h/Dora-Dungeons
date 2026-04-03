import { Router, type IRouter, type Request, type Response } from "express";
import {
  GameEngine,
  GameState,
  GameStatus,
  Player,
  Enemy,
  Item,
  Ability,
} from "@workspace/game-engine";
import {
  StartGameBody,
  ProcessActionBody,
  StartGameResponse,
  ProcessActionResponse,
  GetGameStateResponse,
} from "@workspace/api-zod";
import { loadSession, saveSession, deleteSession } from "../lib/gameSession.js";

const router: IRouter = Router();

// ── Serializers (read-only view sent to the client) ──────────────────────────

function serializePlayer(p: Player) {
  return {
    id: p.id,
    name: p.name,
    hp: p.hp,
    maxHp: p.maxHp,
    mp: p.mp,
    maxMp: p.maxMp,
    level: p.level,
    xp: p.xp,
    xpToNextLevel: p.xpToNextLevel,
    attack: p.attack,
    defense: p.defense,
    abilities: p.abilities.map((a: Ability) => a.name),
    inventory: p.inventory.map((i: Item) => i.name),
  };
}

function serializeEnemy(e: Enemy) {
  return {
    id: e.id,
    name: e.name,
    hp: e.hp,
    maxHp: e.maxHp,
    attack: e.attack,
    defense: e.defense,
    xpReward: e.xpReward,
    isDefeated: e.isDefeated,
  };
}

function serializeGameState(state: GameState) {
  const room = state.dungeon.rooms.get(state.currentRoomId)!;
  const roomEnemies = (room.event.enemies ?? []).map(serializeEnemy);

  return {
    sessionId: state.sessionId,
    gameStatus: state.gameStatus,
    player: serializePlayer(state.player),
    currentRoom: {
      id: room.id,
      name: room.name,
      description: room.description,
      exits: Object.fromEntries(Object.entries(room.exits)),
      enemies: roomEnemies,
      items: room.items.map((i: Item) => i.name),
      isExplored: room.isExplored,
    },
    logs: state.logs.slice(-80),
    parsedCommand: state.parsedCommand
      ? {
          action: state.parsedCommand.action,
          target: state.parsedCommand.target,
          direction: state.parsedCommand.direction,
          raw: state.parsedCommand.raw,
        }
      : undefined,
    turnCount: state.turnCount,
    gold: state.gold,
  };
}

// ── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /game/start
 * Resume an existing session or create a new one.
 * Pass ?new=true to force-start a fresh game (deletes old session).
 */
router.post("/start", async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const forceNew = req.query.new === "true";

  if (forceNew) {
    await deleteSession(userId);
  }

  // Try to resume an existing session first
  const existing = await loadSession(userId);
  if (existing) {
    const response = StartGameResponse.parse(serializeGameState(existing.state));
    res.json(response);
    return;
  }

  // No session found — start a new game
  const body = StartGameBody.parse(req.body ?? {});
  const dungeonSeed: string | undefined =
    typeof req.body?.dungeonSeed === "string" ? req.body.dungeonSeed : undefined;

  const engine = new GameEngine();
  const state = engine.startGame(body.playerName ?? "Hero", dungeonSeed);

  await saveSession(userId, state);

  const response = StartGameResponse.parse(serializeGameState(state));
  res.json(response);
});

/**
 * POST /game/action
 * Load the user's session, process a command, save updated state.
 */
router.post("/action", async (req: Request, res: Response) => {
  const userId = req.user!.id;

  const session = await loadSession(userId);
  if (!session) {
    res.status(404).json({
      error: "NOT_FOUND",
      message: "No active game session. Call /game/start first.",
    });
    return;
  }

  const { engine, state } = session;

  if (
    state.gameStatus === GameStatus.GAME_OVER ||
    state.gameStatus === GameStatus.VICTORY
  ) {
    res.status(400).json({
      error: "GAME_ENDED",
      message: `Game is over (${state.gameStatus}). Start a new game with POST /game/start?new=true`,
    });
    return;
  }

  const body = ProcessActionBody.parse(req.body);
  const updatedState = engine.processCommand(body.command);

  await saveSession(userId, updatedState);

  const response = ProcessActionResponse.parse(serializeGameState(updatedState));
  res.json(response);
});

/**
 * GET /game/state
 * Return the current saved state for the authenticated user.
 */
router.get("/state", async (req: Request, res: Response) => {
  const userId = req.user!.id;

  const session = await loadSession(userId);
  if (!session) {
    res.status(404).json({
      error: "NOT_FOUND",
      message: "No active game session. Call /game/start first.",
    });
    return;
  }

  const response = GetGameStateResponse.parse(serializeGameState(session.state));
  res.json(response);
});

export default router;
