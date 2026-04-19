import { Router, type IRouter, type Request, type Response } from "express";
import {
  GameEngine,
  GameState,
  GameStatus,
  Player,
  Enemy,
  Item,
  Ability,
  Weapon,
  Armor,
  calculateXpToNextLevel,
} from "@workspace/game-engine";
import {
  StartGameBody,
  ProcessActionBody,
  StartGameResponse,
  ProcessActionResponse,
  GetGameStateResponse,
  ShopBuyBody,
  ShopSellBody,
  ShopUpgradeBody,
  ShopActionResponse,
} from "@workspace/api-zod";
import { loadSession, saveSession, deleteSession } from "../lib/gameSession.js";
import { callGameMaster, type RPGContext } from "../lib/gameMaster.js";

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
    weapons: (p.weapons ?? []).map((w: Weapon) => ({
      id: w.id, name: w.name, description: w.description, price: w.price,
    })),
    armors: (p.armors ?? []).map((a: Armor) => ({
      id: a.id, name: a.name, level: a.level,
    })),
    // Full inventory details (id + name + value) so the shop sell view can
    // display real items with their correct IDs for server-side selling.
    inventoryItems: (p.inventory ?? []).map((i: Item) => ({
      id: i.id, name: i.name, value: i.value ?? 0,
    })),
    dungeonLevel: p.dungeonLevel ?? 1,
    dungeonLevelCompleted: p.dungeonLevelCompleted ?? false,
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
    gold: state.gold,
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
    event: state.event,
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
 * Returns true for UI / informational commands that don't need LLM narration.
 * The engine handles these with plain system messages — calling the GM for them
 * wastes tokens and adds latency.
 *
 * Kept deliberately narrow: only pure meta / overlay commands.  Game actions
 * (attack, move, cast, defend, flee, .destroy, buy, sell, equip) all receive
 * full cinematic narration from the Game Master.
 */
function shouldSkipGM(cmd: string): boolean {
  const c = cmd.trim().toLowerCase();
  // Exact UI meta commands
  const SKIP_EXACT = new Set([
    // Informational / stats — engine output is already clear
    "status", "help",
    // Overlay openers — these just trigger UI panels, no narrative needed
    "shop", "open_shop",
    "inventory", "open_inventory",
    // Meta / session commands
    "repeat", "change_voice", "logout",
    "replay_prompt", "replay_level", "next_level", "exit_to_login",
    // NOTE: "look" is intentionally excluded — the LLM narrates room descriptions well.
  ]);
  return SKIP_EXACT.has(c);
}

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

  // ── Optional RPG context forwarded by the frontend ────────────────────────
  // Zod strips unknown keys from ProcessActionBody, so we read directly from
  // req.body. All fields are optional — missing context falls back gracefully.
  const rpgContext: RPGContext = {
    equippedWeapon: req.body?.rpgContext?.equippedWeapon ?? {
      id: "rusty-sword", name: "Rusty Sword", damage: 5, specialAbility: "None",
    },
    equippedArmor: req.body?.rpgContext?.equippedArmor ?? {
      id: "tattered-robe", name: "Tattered Robe", defense: 2,
    },
    unlockedAbilities: req.body?.rpgContext?.unlockedAbilities ?? [],
    // Full collections — allow STATUS voice and LLM to reflect everything in the overlay.
    unlockedWeapons:   req.body?.rpgContext?.unlockedWeapons  ?? [],
    unlockedArmor:     req.body?.rpgContext?.unlockedArmor    ?? [],
    destroyConsumed:   req.body?.rpgContext?.destroyConsumed  ?? false,
    playerXP: req.body?.rpgContext?.playerXP ?? 0,
  };

  // Capture log count BEFORE the command so we can extract exactly which lines
  // were added by this command (the server caps logs at 80 in the serializer,
  // so comparing array lengths client-side breaks after 80 total log lines).
  const logCountBefore = state.logs.length;

  const updatedState = engine.processCommand(body.command);

  // Lines genuinely added by this command — used by the client for TTS and
  // also forwarded to the LLM as the "engine outcome" context.
  const engineNewLogs = updatedState.logs.slice(logCountBefore);

  // ── STATUS: synchronise engine output with RPG inventory overlay (blue bag) ──
  // The engine's "Inventory:" line tracks dungeon item drops (potions, misc) —
  // completely separate from the weapon/armor overlay the player sees.
  // We patch three things here so what the voice reads = what the overlay shows:
  //   1. Abilities line  → append .destroy charges (RPG overlay abilities tab)
  //   2. Inventory line  → replace with full blue-bag contents:
  //                        all owned weapons + all owned armor (overlay tabs 1+2)
  //
  // The engine recognises many aliases for the STATUS command (stats, hp, health,
  // bag, pack, inventory, me, self, level, abilities).  We must patch ALL of them,
  // not just the literal "status" word, so typed aliases work too.
  const STATUS_COMMAND_ALIASES = new Set([
    "status", "stats", "stat", "health", "hp", "inventory",
    "me", "self", "level", "bag", "pack", "abilities",
  ]);
  if (STATUS_COMMAND_ALIASES.has(body.command.toLowerCase())) {
    const rpgAbilities: string[] = Array.isArray(rpgContext.unlockedAbilities)
      ? (rpgContext.unlockedAbilities as string[]) : [];
    const ownedWeapons = (rpgContext.unlockedWeapons ?? []) as { name: string }[];
    const ownedArmors  = (rpgContext.unlockedArmor  ?? []) as { name: string }[];

    // Helper: patch a line in both the engineNewLogs slice and live updatedState.logs
    const patchLine = (idx: number, replacement: string) => {
      engineNewLogs[idx] = replacement;
      const liveIdx = logCountBefore + idx;
      if (liveIdx < updatedState.logs.length) updatedState.logs[liveIdx] = replacement;
    };

    for (let i = 0; i < engineNewLogs.length; i++) {
      const line = engineNewLogs[i];

      // 1. Abilities: append RPG overlay abilities (.destroy N Charges, etc.)
      if (line.startsWith("Abilities:") && rpgAbilities.length > 0) {
        patchLine(i, `${line}, ${rpgAbilities.join(", ")}`);
      }

      // 2. Inventory: replace the engine's dungeon-drops line with the full
      //    blue-bag contents — all owned weapons + all owned armor.
      //    This is exactly what the player sees when they open the blue bag overlay.
      if (line.startsWith("Inventory:")) {
        const bagItems: string[] = [
          ...ownedWeapons.map(w => w.name),
          ...ownedArmors.map(a => a.name),
        ];
        const bagText = bagItems.length > 0
          ? bagItems.join(", ")
          : "empty";
        patchLine(i, `Inventory: ${bagText}`);
      }
    }
  }

  // ── LLM Game Master narration ─────────────────────────────────────────────
  // Skip the LLM entirely for UI / informational commands (status, look, shop,
  // inventory, help, etc.) — the engine already produces clear system messages
  // for these and calling gpt-5.2 here wastes tokens and adds latency.
  const room = updatedState.dungeon.rooms.get(updatedState.currentRoomId)!;
  const gmResult = shouldSkipGM(body.command)
    ? { narration: "", xp_awarded: 0, hp_change: 0, used_destroy_ability: false, ui_command: "none" as const }
    : await callGameMaster(
        body.command,
        engineNewLogs,
        updatedState.gameStatus,
        updatedState.player.hp,
        updatedState.player.maxHp,
        room.name,
        room.description,
        rpgContext,
      );

  // Apply LLM-awarded HP change (clamped to valid range)
  if (gmResult.hp_change !== 0) {
    updatedState.player.hp = Math.max(
      0,
      Math.min(updatedState.player.maxHp, updatedState.player.hp + gmResult.hp_change),
    );
  }

  // ── .destroy suppression ──────────────────────────────────────────────────
  // The engine doesn't recognise .destroy as a valid command and produces a
  // "You don't have X" error line.  When the LLM confirms the ability was used,
  // strip those wrong engine lines from the visual log and send only the
  // cinematic LLM narration to the client for TTS.
  if (gmResult.used_destroy_ability) {
    updatedState.logs.splice(logCountBefore, engineNewLogs.length);
  }

  // Push the GM narration into the live log so it appears in the visual
  // terminal (logs are serialized from updatedState.logs).  Without this,
  // narration is spoken via TTS but never rendered on screen ("Ghost Text").
  if (gmResult.narration) {
    updatedState.logs.push(gmResult.narration);
  }

  // Build final newLogs: engine lines + GM narration (if any).
  // For .destroy: engine produced wrong output — send ONLY the LLM narration.
  const newLogs = gmResult.used_destroy_ability
    ? (gmResult.narration ? [gmResult.narration] : [])
    : gmResult.narration
      ? [...engineNewLogs, gmResult.narration]
      : engineNewLogs;

  await saveSession(userId, updatedState);

  const serialized = serializeGameState(updatedState);
  const response = ProcessActionResponse.parse({ ...serialized, newLogs });
  // Append GM fields after Zod serialization (avoids schema changes to the
  // generated OpenAPI contract while still delivering all data to the client).
  res.json({
    ...response,
    xp_awarded:           gmResult.xp_awarded,
    used_destroy_ability: gmResult.used_destroy_ability,
    ui_command:           gmResult.ui_command,
  });
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

/**
 * POST /game/add-xp
 * Apply LLM narrative XP award directly to the engine's player state so that
 * the STATUS voice output and the inventory overlay always agree.
 * Handles level-up the same way the engine's private applyXpAndGold does.
 */
router.post("/add-xp", async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const amount = Number(req.body?.amount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: "INVALID", message: "amount must be a positive number" });
    return;
  }

  const session = await loadSession(userId);
  if (!session) {
    res.status(404).json({ error: "NOT_FOUND", message: "No active game session." });
    return;
  }

  const { state } = session;
  const p = state.player;

  p.xp += amount;

  // Mirror the engine's applyXpAndGold level-up loop
  while (p.xp >= p.xpToNextLevel) {
    p.xp -= p.xpToNextLevel;
    p.level += 1;
    p.xpToNextLevel = calculateXpToNextLevel(p.level);
    // Increase max HP by 10% and heal fully on level-up (matches engine behaviour)
    p.maxHp = Math.round(p.maxHp * 1.1);
    p.hp = Math.min(p.hp + Math.round(p.maxHp * 0.1), p.maxHp);
    state.logs.push(`Level Up! You are now level ${p.level}!`);
  }

  await saveSession(userId, state);
  res.json(serializeGameState(state));
});

// ── Shop routes ───────────────────────────────────────────────────────────────

async function loadSessionOrFail(userId: string, res: Response): Promise<{ engine: GameEngine; state: GameState } | null> {
  const session = await loadSession(userId);
  if (!session) {
    res.status(404).json({ error: "NOT_FOUND", message: "No active game session." });
    return null;
  }
  return session;
}

/**
 * POST /game/shop/buy
 * Purchase a weapon. Deducts gold and adds weapon to player.weapons.
 */
router.post("/shop/buy", async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const session = await loadSessionOrFail(userId, res);
  if (!session) return;

  const { weaponId } = ShopBuyBody.parse(req.body);
  const { engine, state } = session;
  const { success, message } = engine.buyWeaponShop(weaponId);

  await saveSession(userId, state);
  const response = ShopActionResponse.parse({
    success,
    message,
    gold: state.gold,
    player: serializePlayer(state.player),
  });
  res.json(response);
});

/**
 * POST /game/shop/sell
 * Sell an inventory item. Adds its value to player.gold.
 */
router.post("/shop/sell", async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const session = await loadSessionOrFail(userId, res);
  if (!session) return;

  const { itemId } = ShopSellBody.parse(req.body);
  const { engine, state } = session;
  const { success, message } = engine.sellItemShop(itemId);

  await saveSession(userId, state);
  const response = ShopActionResponse.parse({
    success,
    message,
    gold: state.gold,
    player: serializePlayer(state.player),
  });
  res.json(response);
});

/**
 * POST /game/shop/upgrade
 * Upgrade an armor piece by one level. Deducts gold.
 */
router.post("/shop/upgrade", async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const session = await loadSessionOrFail(userId, res);
  if (!session) return;

  const { armorId } = ShopUpgradeBody.parse(req.body);
  const { engine, state } = session;
  const { success, message } = engine.upgradeArmorShop(armorId);

  await saveSession(userId, state);
  const response = ShopActionResponse.parse({
    success,
    message,
    gold: state.gold,
    player: serializePlayer(state.player),
  });
  res.json(response);
});

/**
 * POST /game/next-level
 * Advance to the next dungeon level after a VICTORY.
 *
 * - Increments player.dungeonLevel
 * - Generates a brand-new dungeon using the stable seed for the new level
 * - Preserves all gear, gold, XP, and abilities — only the dungeon changes
 */
router.post("/next-level", async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const session = await loadSessionOrFail(userId, res);
  if (!session) return;

  const { state } = session;

  if (state.gameStatus !== GameStatus.VICTORY) {
    res.status(400).json({
      error: "NOT_VICTORY",
      message: "Can only advance to the next level after defeating the dungeon boss.",
    });
    return;
  }

  const oldPlayer = state.player;
  const oldGold   = state.gold;
  const newLevel  = oldPlayer.dungeonLevel + 1;

  // Stable seed — mirrors the formula in GameEngine.startGame().
  // level-2 for the same player will always produce the same dungeon.
  const newSeed = `level-${newLevel}-${oldPlayer.id.slice(0, 8)}`;

  // Generate a fresh dungeon under the new seed.
  // startGame() creates a throwaway player; we replace it immediately.
  const tempEngine = new GameEngine();
  tempEngine.startGame(oldPlayer.name, newSeed);
  const newState = tempEngine.getState()!;

  // Overwrite the auto-created player with the player's real preserved state.
  // Restore HP/MP fully; clear transient combat state.
  newState.player = {
    ...oldPlayer,
    hp:                   oldPlayer.maxHp,
    mp:                   oldPlayer.maxMp,
    statusEffects:        [],
    isDefending:          false,
    dungeonLevel:         newLevel,
    dungeonLevelCompleted: false,
  };
  newState.gold = oldGold;

  // Append a level-transition banner so the terminal shows the new context.
  newState.logs.push(
    "══════════════════════════════",
    `   DUNGEON LEVEL ${newLevel}`,
    "══════════════════════════════",
    `${newState.player.name} descends deeper into the dark.`,
    `Dungeon ${newLevel} awaits. Your gear and gold remain.`,
    ...(newLevel >= 3
      ? [`Tip: Enemies grow stronger at this depth. Visit the shop to upgrade your weapons and armor before pressing on.`]
      : []),
  );

  await saveSession(userId, newState);
  const response = GetGameStateResponse.parse(serializeGameState(newState));
  res.json(response);
});

/**
 * POST /game/replay-level
 * Replay the current dungeon level after a VICTORY without advancing.
 *
 * Calls restartLevel() which resets enemies and returns to the dungeon
 * entrance — but keeps the same dungeon layout, gear, and gold.
 */
router.post("/replay-level", async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const session = await loadSessionOrFail(userId, res);
  if (!session) return;

  const { engine, state } = session;

  if (state.gameStatus !== GameStatus.VICTORY) {
    res.status(400).json({
      error: "NOT_VICTORY",
      message: "Can only replay a level after defeating the dungeon boss.",
    });
    return;
  }

  const updatedState = engine.restartLevel();
  await saveSession(userId, updatedState);

  const response = GetGameStateResponse.parse(serializeGameState(updatedState));
  res.json(response);
});

/**
 * POST /game/restart
 * Restart the current dungeon run after a GAME_OVER.
 * Restores player HP/MP/status and resets all enemies.
 * Keeps weapons, armors, gold and inventory.
 */
router.post("/restart", async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const session = await loadSessionOrFail(userId, res);
  if (!session) return;

  const { engine, state } = session;

  if (state.gameStatus !== GameStatus.GAME_OVER) {
    res.status(400).json({
      error: "NOT_GAME_OVER",
      message: "Can only restart after a GAME_OVER.",
    });
    return;
  }

  const updatedState = engine.restartLevel();
  await saveSession(userId, updatedState);

  const response = GetGameStateResponse.parse(serializeGameState(updatedState));
  res.json(response);
});

export default router;
