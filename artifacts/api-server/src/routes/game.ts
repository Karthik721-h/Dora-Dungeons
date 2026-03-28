import { Router, type IRouter, type Request, type Response } from "express";
import {
  GameEngine,
  GameState,
  GameStatus,
  Player,
  Enemy,
  Item,
  Ability,
  StatusEffect,
} from "@workspace/game-engine";
import {
  StartGameBody,
  ProcessActionBody,
  StartGameResponse,
  ProcessActionResponse,
  GetGameStateResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

let engine: GameEngine | null = null;
let currentState: GameState | null = null;

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
  };
}

router.post("/start", (req: Request, res: Response) => {
  const body = StartGameBody.parse(req.body ?? {});
  const dungeonSeed: string | undefined = typeof req.body?.dungeonSeed === "string"
    ? req.body.dungeonSeed
    : undefined;
  engine = new GameEngine();
  currentState = engine.startGame(body.playerName ?? "Hero", dungeonSeed);
  const response = StartGameResponse.parse(serializeGameState(currentState));
  res.json(response);
});

router.post("/action", (req: Request, res: Response) => {
  if (!engine || !currentState) {
    res.status(404).json({ error: "NOT_FOUND", message: "No active game session. Call /game/start first." });
    return;
  }

  if (
    currentState.gameStatus === GameStatus.GAME_OVER ||
    currentState.gameStatus === GameStatus.VICTORY
  ) {
    res.status(400).json({
      error: "GAME_ENDED",
      message: `Game is over (${currentState.gameStatus}). Start a new game.`,
    });
    return;
  }

  const body = ProcessActionBody.parse(req.body);
  currentState = engine.processCommand(body.command);
  const response = ProcessActionResponse.parse(serializeGameState(currentState));
  res.json(response);
});

router.get("/state", (_req: Request, res: Response) => {
  if (!engine || !currentState) {
    res.status(404).json({ error: "NOT_FOUND", message: "No active game session. Call /game/start first." });
    return;
  }

  const response = GetGameStateResponse.parse(serializeGameState(currentState));
  res.json(response);
});

export default router;
