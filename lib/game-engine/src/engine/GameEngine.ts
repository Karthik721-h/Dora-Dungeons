import crypto from "crypto";
import {
  GameState,
  GameStatus,
  ActionType,
  Direction,
  ParsedCommand,
  Enemy,
  ItemType,
  EnemyType,
} from "../types/index.js";
import { CommandParser } from "../ai/CommandParser.js";
import { DungeonManager } from "../dungeon/DungeonManager.js";
import { generateDungeon } from "../generators/DungeonGenerator.js";
import { CombatSystem, initCombatState, refreshTurnOrder } from "../combat/CombatSystem.js";
import { NarrationEngine } from "../narration/NarrationEngine.js";
import { triggerRoomEvent } from "../systems/EventSystem.js";
import { findItemByName, useConsumable, applyEquipment } from "../systems/ItemSystem.js";
import { createPlayer, calculateXpToNextLevel } from "../entities/Player.js";
import {
  buyWeapon as shopBuyWeapon,
  sellItem as shopSellItem,
  upgradeArmor as shopUpgradeArmor,
  findWeaponById,
} from "../services/ShopService.js";
import { getDungeonAtmosphere } from "../scaling/LevelScaling.js";

function uuid(): string {
  return crypto.randomUUID();
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export class GameEngine {
  private parser: CommandParser;
  private combat: CombatSystem;
  private state: GameState | null = null;

  constructor() {
    this.parser = new CommandParser();
    this.combat = new CombatSystem();
  }

  /**
   * Start a new game.
   * @param playerName   Display name for the player character.
   * @param dungeonSeed  Optional seed for reproducible dungeon generation.
   *                     Omit for a random dungeon each run.
   */
  startGame(playerName = "Hero", dungeonSeed?: string): GameState {
    const player = createPlayer(playerName);
    // Ensure dungeon level defaults are set (guards hydrated sessions from old saves)
    player.dungeonLevel = player.dungeonLevel || 1;
    player.dungeonLevelCompleted = false;

    // Stable seed: same player + same dungeon level → same layout every time.
    // A random uuid() fallback is intentionally NOT used — we want repeatability
    // so the player gets a consistent dungeon if they restart at the same level.
    const effectiveSeed = dungeonSeed ?? `level-${player.dungeonLevel}-${player.id.slice(0, 8)}`;
    const dungeon = generateDungeon(effectiveSeed, player.dungeonLevel);

    this.state = {
      sessionId: uuid(),
      gameStatus: GameStatus.EXPLORING,
      player,
      currentRoomId: dungeon.startRoomId,
      dungeon,
      logs: [
        "══════════════════════════════",
        "   DORA DUNGEONS — BEGIN",
        "══════════════════════════════",
        `You are ${playerName}, a lone adventurer descending into an ancient dungeon.`,
        `Dungeon Level ${player.dungeonLevel}. Your mission: explore the dungeon and defeat the boss to progress.`,
        getDungeonAtmosphere(player.dungeonLevel),
        "Your quest: reach the final chamber and slay the boss.",
        `Dungeon seed: ${dungeon.seed}`,
        "Commands: attack [enemy] | defend | move [direction] | cast [spell] [target] | use [item] | look | status | flee",
        "——————————————————————————————",
      ],
      parsedCommand: undefined,
      turnCount: 0,
      combat: { active: false, enemies: [], turnOrder: [], currentTurnIndex: 0, round: 1, log: [] },
      gold: 0,
    };

    const mgr = new DungeonManager(dungeon);
    mgr.markExplored(dungeon.startRoomId);

    const startRoom = dungeon.rooms.get(dungeon.startRoomId)!;
    const eventResult = triggerRoomEvent(startRoom.event, player);
    if (eventResult.narration.length > 0) this.state.logs.push(...eventResult.narration);
    this.state.logs.push(...this.describeCurrentRoom(false));

    return this.state;
  }

  getState(): GameState | null {
    return this.state;
  }

  processCommand(input: string): GameState {
    if (!this.state) throw new Error("No active game session. Call startGame() first.");

    if (
      this.state.gameStatus === GameStatus.GAME_OVER ||
      this.state.gameStatus === GameStatus.VICTORY
    ) {
      this.state.logs.push("The game is over. Start a new session to play again.");
      return this.state;
    }

    // Clear the one-shot event flag so previous turns don't bleed through.
    delete this.state.event;

    const parsed = this.parser.parse(input);
    this.state.parsedCommand = parsed;
    this.state.turnCount += 1;

    const logs: string[] = [`> ${input}`];

    switch (parsed.action) {
      case ActionType.ATTACK:
        logs.push(...this.handleAttack(parsed));
        break;
      case ActionType.DEFEND:
        logs.push(...this.handleDefend());
        break;
      case ActionType.MOVE:
        logs.push(...this.handleMove(parsed));
        break;
      case ActionType.CAST_SPELL:
        logs.push(...this.handleCastSpell(parsed));
        break;
      case ActionType.USE_ITEM:
        logs.push(...this.handleUseItem(parsed));
        break;
      case ActionType.TAKE:
        logs.push(...this.handleTake(parsed));
        break;
      case ActionType.LOOK:
        logs.push(...this.describeCurrentRoom(true));
        break;
      case ActionType.STATUS:
        logs.push(...this.describePlayerStatus());
        break;
      case ActionType.FLEE:
        logs.push(...this.handleFlee(parsed));
        break;
      default:
        logs.push(
          `Unknown command: "${input}".`,
          "Try: attack [enemy] | defend | move [direction] | cast [spell] | use [item] | look | status | flee"
        );
    }

    this.state.logs.push(...logs);
    this.syncGameStatus();

    return this.state;
  }

  private handleAttack(parsed: ParsedCommand): string[] {
    const state = this.state!;
    const mgr = new DungeonManager(state.dungeon);
    const activeEnemies = mgr.getActiveEnemies(state.currentRoomId);

    if (activeEnemies.length === 0) return ["There are no enemies here to attack."];

    this.ensureCombatStarted(activeEnemies);

    let target = activeEnemies[0]!;
    if (parsed.target) {
      const found = activeEnemies.find((e) =>
        e.name.toLowerCase().includes(parsed.target!.toLowerCase())
      );
      if (found) {
        target = found;
      } else {
        return [
          `You search for "${parsed.target}" but find only: ${activeEnemies.map((e) => e.name).join(", ")}.`,
        ];
      }
    }

    const result = this.combat.playerAttack(state.player, target, state.combat);
    this.applyXpAndGold(result.xpGained, result.goldGained);
    this.checkLevelUp();

    if (result.allEnemiesDefeated) {
      result.messages.push(NarrationEngine.combatVictory());
      state.combat.active = false;
      state.gameStatus = GameStatus.EXPLORING;
    }

    return result.messages;
  }

  private handleDefend(): string[] {
    const state = this.state!;
    const mgr = new DungeonManager(state.dungeon);
    const activeEnemies = mgr.getActiveEnemies(state.currentRoomId);

    if (activeEnemies.length === 0) {
      state.player.isDefending = true;
      return ["You adopt a defensive stance, alert for threats."];
    }

    this.ensureCombatStarted(activeEnemies);

    const result = this.combat.playerDefend(state.player, state.combat);
    this.applyXpAndGold(result.xpGained, result.goldGained);

    if (result.allEnemiesDefeated) {
      result.messages.push(NarrationEngine.combatVictory());
      state.combat.active = false;
      state.gameStatus = GameStatus.EXPLORING;
    }

    return result.messages;
  }

  private handleCastSpell(parsed: ParsedCommand): string[] {
    const state = this.state!;
    const mgr = new DungeonManager(state.dungeon);
    const activeEnemies = mgr.getActiveEnemies(state.currentRoomId);
    const spellName = parsed.ability ?? parsed.target ?? "fireball";

    let targetEnemy: Enemy | null = null;
    if (activeEnemies.length > 0) {
      this.ensureCombatStarted(activeEnemies);
      targetEnemy = activeEnemies[0]!;
      if (parsed.target) {
        const found = activeEnemies.find((e) =>
          e.name.toLowerCase().includes(parsed.target!.toLowerCase())
        );
        if (found) targetEnemy = found;
      }
    }

    const result = this.combat.playerCastSpell(state.player, spellName, targetEnemy, state.combat);
    this.applyXpAndGold(result.xpGained, result.goldGained);
    this.checkLevelUp();

    if (result.allEnemiesDefeated && activeEnemies.length > 0) {
      result.messages.push(NarrationEngine.combatVictory());
      state.combat.active = false;
      state.gameStatus = GameStatus.EXPLORING;
    }

    return result.messages;
  }

  private handleMove(parsed: ParsedCommand): string[] {
    const state = this.state!;
    const mgr = new DungeonManager(state.dungeon);

    if (state.combat.active && mgr.getActiveEnemies(state.currentRoomId).length > 0) {
      return [NarrationEngine.moveBlocked()];
    }

    const direction = parsed.direction;
    if (!direction) {
      return ["Which direction? Try: move north, move south, move east, move west."];
    }

    const nextRoomId = mgr.canMove(state.currentRoomId, direction);
    if (!nextRoomId) return [NarrationEngine.noExit(direction)];

    state.currentRoomId = nextRoomId;
    state.combat.active = false;
    state.player.isDefending = false;

    const nextRoom = state.dungeon.rooms.get(nextRoomId)!;
    const wasExplored = nextRoom.isExplored;
    mgr.markExplored(nextRoomId);

    const msgs: string[] = [`You move ${direction}...`];

    if (wasExplored) {
      msgs.push(NarrationEngine.roomAlreadyExplored(nextRoom.name));
    } else {
      msgs.push(NarrationEngine.roomEntry(nextRoom.name, nextRoom.description));
      if (nextRoom.ambientDescription) msgs.push(nextRoom.ambientDescription);
    }

    if (!wasExplored) {
      // Warn the player before boss combat begins so they can prepare.
      // Only fires on first entry (wasExplored === false) to avoid repeated warnings.
      const roomHasBoss = nextRoom.event?.enemies?.some((e) => e.type === EnemyType.BOSS) ?? false;
      if (roomHasBoss) {
        msgs.push(
          "You sense a terrible presence beyond the threshold — this is the lair of the dungeon's master.",
          "The air reeks of blood and power. Prepare your spells and potions before you advance."
        );
      }

      const eventResult = triggerRoomEvent(nextRoom.event, state.player);
      msgs.push(...eventResult.narration);

      if (eventResult.goldGained > 0) state.gold += eventResult.goldGained;
      if ((eventResult as { mpRestored?: number }).mpRestored) {
        state.player.mp = Math.min(state.player.mp + ((eventResult as { mpRestored?: number }).mpRestored ?? 0), state.player.maxMp);
      }
      if (eventResult.itemFound) {
        state.player.inventory.push(eventResult.itemFound);
        msgs.push(NarrationEngine.itemPickedUp(eventResult.itemFound.name));
      }
      if (eventResult.combatTriggered && nextRoom.event.enemies) {
        const enemies = nextRoom.event.enemies.filter((e) => !e.isDefeated);
        if (enemies.length > 0) {
          state.combat = initCombatState(state.player, enemies);
          state.gameStatus = GameStatus.IN_COMBAT;
        }
      }
    } else {
      const activeEnemies = mgr.getActiveEnemies(nextRoomId);
      if (activeEnemies.length > 0) {
        state.combat = initCombatState(state.player, activeEnemies);
        state.gameStatus = GameStatus.IN_COMBAT;
        msgs.push(NarrationEngine.combatStart(activeEnemies));
      } else {
        state.gameStatus = GameStatus.EXPLORING;
        msgs.push(...this.describeCurrentRoom(false).slice(1));
      }
    }

    return msgs;
  }

  private handleUseItem(parsed: ParsedCommand): string[] {
    const state = this.state!;
    const searchName = parsed.item ?? parsed.target ?? "";
    const item = findItemByName(state.player.inventory, searchName);

    if (!item) {
      const names = state.player.inventory.map((i) => i.name);
      return names.length === 0
        ? ["Your pack is empty."]
        : [`You don't have "${searchName}". Inventory: ${names.join(", ")}.`];
    }

    if (item.type === ItemType.CONSUMABLE) {
      const result = useConsumable(state.player, item);
      return [NarrationEngine.itemUsed(state.player.name, item.name, result.message)];
    }

    if (
      item.type === ItemType.WEAPON ||
      item.type === ItemType.ARMOR ||
      item.type === ItemType.MISC
    ) {
      return [applyEquipment(state.player, item)];
    }

    return [`You aren't sure how to use the ${item.name}.`];
  }

  private handleTake(parsed: ParsedCommand): string[] {
    const state = this.state!;
    const room = state.dungeon.rooms.get(state.currentRoomId);
    if (!room || room.items.length === 0) return ["There's nothing here to take."];

    const searchName = parsed.target ?? "";
    const itemIndex = searchName
      ? room.items.findIndex((i) => i.name.toLowerCase().includes(searchName.toLowerCase()))
      : 0;

    if (itemIndex === -1) return [`You don't see a "${searchName}" here.`];

    const [taken] = room.items.splice(itemIndex, 1);
    if (!taken) return ["Nothing to take."];
    state.player.inventory.push(taken);
    return [NarrationEngine.itemPickedUp(taken.name)];
  }

  private handleFlee(parsed: ParsedCommand): string[] {
    const state = this.state!;
    const mgr = new DungeonManager(state.dungeon);

    if (!state.combat.active || mgr.getActiveEnemies(state.currentRoomId).length === 0) {
      return ["You aren't in combat. No need to flee."];
    }

    const exits = Object.entries(state.dungeon.rooms.get(state.currentRoomId)?.exits ?? {});
    if (exits.length === 0) return [NarrationEngine.fleeFailed()];

    const fleeChance = 0.5 + (state.player.speed - 10) * 0.03;
    if (Math.random() < fleeChance) {
      const [dir, roomId] = exits[Math.floor(Math.random() * exits.length)]!;
      state.currentRoomId = roomId;
      state.combat.active = false;
      state.player.isDefending = false;
      state.gameStatus = GameStatus.EXPLORING;
      mgr.markExplored(roomId);
      return [
        NarrationEngine.fleeSuccess(dir as Direction),
        ...this.describeCurrentRoom(false),
      ];
    }

    return [NarrationEngine.fleeFailed(), "The enemies retaliate for your attempt!"];
  }

  private ensureCombatStarted(enemies: Enemy[]): void {
    const state = this.state!;
    if (!state.combat.active) {
      state.combat = initCombatState(state.player, enemies);
      state.gameStatus = GameStatus.IN_COMBAT;
    } else {
      refreshTurnOrder(state.combat, state.player);
    }
  }

  private describeCurrentRoom(includeHeader = true): string[] {
    const state = this.state!;
    const room = state.dungeon.rooms.get(state.currentRoomId);
    if (!room) return ["You are lost in an unknown place."];

    const msgs: string[] = [];
    if (includeHeader) msgs.push(`── ${room.name} ──`);
    if (!includeHeader) msgs.push(`── ${room.name} ──`);
    msgs.push(room.description);

    const exits = Object.keys(room.exits);
    msgs.push(`Exits: ${exits.length > 0 ? exits.join(", ") : "none"}`);

    const activeEnemies = (room.event.enemies ?? []).filter((e) => !e.isDefeated);
    if (activeEnemies.length > 0) {
      msgs.push(`Enemies: ${activeEnemies.map((e) => `${e.name} (${e.hp}/${e.maxHp} HP)`).join(", ")}`);
    } else {
      msgs.push("The room is clear.");
    }

    if (room.items.length > 0) {
      msgs.push(`Items on the floor: ${room.items.map((i) => i.name).join(", ")}`);
    }

    return msgs;
  }

  private describePlayerStatus(): string[] {
    const p = this.state!.player;
    const weaponDisplay = p.equippedWeapon
      ? p.equippedWeapon.name
      : p.weapons.length > 0
        ? p.weapons.map((w) => w.name).join(", ")
        : "None";
    const weapon = `Weapon: ${weaponDisplay}`;
    const armor = p.equippedArmor ? `Armor: ${p.equippedArmor.name}` : "Armor: None";
    const effects =
      p.statusEffects.length > 0
        ? p.statusEffects.map((e) => `${e.name} (${e.duration} turns)`).join(", ")
        : "None";

    return [
      `── ${p.name} — Status ──`,
      `Level ${p.level} | XP: ${p.xp}/${p.xpToNextLevel} | Gold: ${this.state!.gold}`,
      `HP: ${p.hp}/${p.maxHp} | MP: ${p.mp}/${p.maxMp}`,
      `ATK: ${p.attack} | DEF: ${p.defense} | SPD: ${p.speed}`,
      weapon,
      armor,
      `Abilities: ${p.abilities.map((a) => a.name).join(", ")}`,
      `Inventory: ${p.inventory.length > 0 ? p.inventory.map((i) => i.name).join(", ") : "empty"}`,
      `Status Effects: ${effects}`,
    ];
  }

  private applyXpAndGold(xp: number, gold: number): void {
    if (xp > 0) this.state!.player.xp += xp;
    if (gold > 0) this.state!.gold += gold;
  }

  private checkLevelUp(): void {
    const state = this.state!;
    const player = state.player;
    while (player.xp >= player.xpToNextLevel) {
      player.xp -= player.xpToNextLevel;
      player.level += 1;
      player.xpToNextLevel = calculateXpToNextLevel(player.level);
      player.maxHp += 15;
      player.hp = clamp(player.hp + 15, 0, player.maxHp);
      player.maxMp += 10;
      player.mp = clamp(player.mp + 10, 0, player.maxMp);
      player.attack += 3;
      player.baseAttack += 3;
      player.defense += 2;
      player.baseDefense += 2;
      player.speed += 1;
      state.logs.push(NarrationEngine.levelUp(player));
    }
  }

  private syncGameStatus(): void {
    const state = this.state!;
    if (state.player.hp <= 0) {
      state.gameStatus = GameStatus.GAME_OVER;
      state.combat.active = false;
      return;
    }

    const mgr = new DungeonManager(state.dungeon);
    if (mgr.isBossRoom(state.currentRoomId) && mgr.isAllClear(state.currentRoomId)) {
      state.gameStatus = GameStatus.VICTORY;
      state.combat.active = false;
      // Mark level completion — progression logic lives outside this engine step.
      state.player.dungeonLevelCompleted = true;
      state.event = "LEVEL_COMPLETED";
      state.logs.push(
        "══════════════════════════════",
        "   VICTORY! THE DUNGEON FALLS",
        "══════════════════════════════",
        `The boss is slain. ${state.player.name} stands victorious in the silence.`,
        `Final Level: ${state.player.level} | Dungeon: ${state.player.dungeonLevel} | Gold: ${state.gold} | Turns: ${state.turnCount}`
      );
      return;
    }

    const activeEnemies = mgr.getActiveEnemies(state.currentRoomId);
    if (activeEnemies.length > 0) {
      state.gameStatus = GameStatus.IN_COMBAT;
    } else if (state.combat.active) {
      state.combat.active = false;
      state.gameStatus = GameStatus.EXPLORING;
    }
  }

  // ── Restart ─────────────────────────────────────────────────────────────────

  /**
   * Restart the current dungeon run after a GAME_OVER.
   *
   * - Player HP and MP are fully restored.
   * - Status effects and defending flag are cleared.
   * - Player is moved back to the dungeon start room.
   * - All enemies in every room are restored to full HP and un-defeated.
   * - Room events are reset (triggered = false) and rooms are marked unexplored.
   * - Combat state is cleared.
   * - Weapons, armors, gold and inventory are preserved.
   */
  restartLevel(): GameState {
    if (!this.state) throw new Error("No active game session");
    const state = this.state;

    // Restore player vitals — keep all gear, gold and dungeon level progress
    state.player = {
      ...state.player,
      hp: state.player.maxHp,
      mp: state.player.maxMp,
      statusEffects: [],
      isDefending: false,
      dungeonLevelCompleted: false,
    };

    // Clear any lingering one-shot event so the restart response is clean.
    delete state.event;

    // Return to the dungeon entrance
    state.currentRoomId = state.dungeon.startRoomId;

    // Restore every enemy in every room
    for (const room of state.dungeon.rooms.values()) {
      if (room.event.enemies) {
        for (const enemy of room.event.enemies) {
          enemy.hp = enemy.maxHp;
          enemy.isDefeated = false;
          enemy.statusEffects = [];
        }
      }
      room.event.triggered = false;
      room.isExplored = false;
    }

    // Clear combat state
    state.combat = {
      active: false,
      enemies: [],
      turnOrder: [],
      currentTurnIndex: 0,
      round: 1,
      log: [],
    };

    state.gameStatus = GameStatus.EXPLORING;
    state.turnCount = 0;

    state.logs.push(
      "══════════════════════════════",
      "   YOU RISE AGAIN",
      "══════════════════════════════",
      `${state.player.name} rises from the shadows at the dungeon entrance.`,
      "Weapons, armor, and gold intact. The dungeon awaits once more.",
      "——————————————————————————————",
      ...this.describeCurrentRoom(false),
    );

    return state;
  }

  // ── Shop methods ────────────────────────────────────────────────────────────
  // Each method syncs state.gold ↔ player.gold (combat rewards accumulate in
  // state.gold; ShopService reads/writes player.gold) before and after the
  // transaction, then persists the result back into engine state.

  buyWeaponShop(weaponId: string): { success: boolean; message: string } {
    if (!this.state) throw new Error("No active game session");
    const state = this.state;
    // Sync combat gold into player before the shop reads player.gold
    state.player = { ...state.player, gold: state.gold };
    console.log("Before purchase: gold =", state.gold, "weapons =", state.player.weapons.map(w => w.name));
    const result = shopBuyWeapon(state.player, weaponId);
    if (result.success) {
      state.player = result.updatedPlayer;
      state.gold = result.updatedPlayer.gold;
      const bought = findWeaponById(weaponId)!;
      state.logs.push(`You purchased ${bought.name} for ${bought.price} gold.`);
      console.log("After purchase: gold =", state.gold, "weapons =", state.player.weapons.map(w => w.name));
    }
    return { success: result.success, message: result.message };
  }

  sellItemShop(itemId: string): { success: boolean; message: string } {
    if (!this.state) throw new Error("No active game session");
    const state = this.state;
    state.player = { ...state.player, gold: state.gold };
    const itemName = state.player.inventory.find((i) => i.id === itemId)?.name ?? itemId;
    const result = shopSellItem(state.player, itemId);
    if (result.success) {
      state.player = result.updatedPlayer;
      state.gold = result.updatedPlayer.gold;
      state.logs.push(`You sold ${itemName}.`);
    }
    return { success: result.success, message: result.message };
  }

  upgradeArmorShop(armorId: string): { success: boolean; message: string } {
    if (!this.state) throw new Error("No active game session");
    const state = this.state;
    state.player = { ...state.player, gold: state.gold };
    const result = shopUpgradeArmor(state.player, armorId);
    if (result.success) {
      state.player = result.updatedPlayer;
      state.gold = result.updatedPlayer.gold;
      const upgraded = result.updatedPlayer.armors.find((a) => a.id === armorId);
      state.logs.push(`Armor upgraded to level ${upgraded?.level ?? "?"}.`);
    }
    return { success: result.success, message: result.message };
  }
}
