import { Router, type IRouter, type Request, type Response } from "express";
import { GameEngine, GameState, GameStatus, Ability, Item, Enemy } from "@workspace/game-engine";
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

function serializeGameState(state: GameState, parsedCommand?: GameState["parsedCommand"]) {
  const room = state.dungeon.rooms.get(state.currentRoomId)!;
  return {
    sessionId: state.sessionId,
    gameStatus: state.gameStatus,
    player: {
      id: state.player.id,
      name: state.player.name,
      hp: state.player.hp,
      maxHp: state.player.maxHp,
      mp: state.player.mp,
      maxMp: state.player.maxMp,
      level: state.player.level,
      xp: state.player.xp,
      xpToNextLevel: state.player.xpToNextLevel,
      attack: state.player.attack,
      defense: state.player.defense,
      abilities: state.player.abilities.map((a: Ability) => a.name),
      inventory: state.player.inventory.map((i: Item) => i.name),
    },
    currentRoom: {
      id: room.id,
      name: room.name,
      description: room.description,
      exits: Object.fromEntries(Object.entries(room.exits)),
      enemies: room.enemies.map((e: Enemy) => ({
        id: e.id,
        name: e.name,
        hp: e.hp,
        maxHp: e.maxHp,
        attack: e.attack,
        defense: e.defense,
        xpReward: e.xpReward,
        isDefeated: e.isDefeated,
      })),
      items: room.items.map((i: Item) => i.name),
      isExplored: room.isExplored,
    },
    logs: state.logs.slice(-50),
    parsedCommand: parsedCommand
      ? {
          action: parsedCommand.action,
          target: parsedCommand.target,
          direction: parsedCommand.direction,
          raw: parsedCommand.raw,
        }
      : undefined,
    turnCount: state.turnCount,
  };
}

router.post("/start", (req: Request, res: Response) => {
  const body = StartGameBody.parse(req.body ?? {});
  engine = new GameEngine();
  currentState = engine.startGame(body.playerName ?? "Hero");

  const response = StartGameResponse.parse(serializeGameState(currentState));
  res.json(response);
});

router.post("/action", (req: Request, res: Response) => {
  if (!engine || !currentState) {
    res.status(404).json({ error: "NOT_FOUND", message: "No active game session. Call /game/start first." });
    return;
  }

  if (currentState.gameStatus === GameStatus.GAME_OVER || currentState.gameStatus === GameStatus.VICTORY) {
    res.status(400).json({ error: "GAME_ENDED", message: `Game is over (status: ${currentState.gameStatus}). Start a new game.` });
    return;
  }

  const body = ProcessActionBody.parse(req.body);
  currentState = engine.processCommand(body.command);

  const response = ProcessActionResponse.parse(serializeGameState(currentState, currentState.parsedCommand));
  res.json(response);
});

router.get("/state", (req: Request, res: Response) => {
  if (!engine || !currentState) {
    res.status(404).json({ error: "NOT_FOUND", message: "No active game session. Call /game/start first." });
    return;
  }

  const response = GetGameStateResponse.parse(serializeGameState(currentState));
  res.json(response);
});

export default router;
