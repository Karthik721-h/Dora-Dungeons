import crypto from "crypto";

function uuidv4(): string {
  return crypto.randomUUID();
}
import { GameState, GameStatus, Player, ActionType, Direction, Ability, ParsedCommand } from "../types/index.js";
import { CommandParser } from "../ai/CommandParser.js";
import { DungeonManager, createDefaultDungeon } from "../dungeon/DungeonManager.js";
import { CombatSystem, CombatResult } from "../combat/CombatSystem.js";

const DEFAULT_ABILITIES: Ability[] = [
  { id: "fireball", name: "Fireball", description: "Launch a ball of fire at an enemy", mpCost: 10, damage: 30, type: "offensive" },
  { id: "heal", name: "Heal", description: "Restore some of your HP", mpCost: 8, healAmount: 25, type: "defensive" },
];

function createPlayer(name: string): Player {
  return {
    id: uuidv4(),
    name,
    hp: 100,
    maxHp: 100,
    mp: 50,
    maxMp: 50,
    level: 1,
    xp: 0,
    xpToNextLevel: 100,
    attack: 15,
    defense: 8,
    abilities: DEFAULT_ABILITIES,
    inventory: [],
    isDefending: false,
  };
}

function calculateXpToNextLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.5, level - 1));
}

export class GameEngine {
  private parser: CommandParser;
  private combat: CombatSystem;
  private state: GameState | null = null;

  constructor() {
    this.parser = new CommandParser();
    this.combat = new CombatSystem();
  }

  startGame(playerName: string = "Hero"): GameState {
    const dungeon = createDefaultDungeon();
    const dungeonManager = new DungeonManager(dungeon);
    const startRoomId = dungeon.startRoomId;

    this.state = {
      sessionId: uuidv4(),
      gameStatus: GameStatus.EXPLORING,
      player: createPlayer(playerName),
      currentRoomId: startRoomId,
      dungeon,
      logs: [
        "Welcome to Dora Dungeons!",
        `You are ${playerName}, a brave adventurer entering a perilous dungeon.`,
        "Your quest: defeat the Orc Warlord and claim victory!",
        "Commands: attack [enemy], defend, move [direction], look, status, cast [spell]",
        "---",
      ],
      parsedCommand: undefined,
      turnCount: 0,
    };

    dungeonManager.markExplored(startRoomId);
    const roomDesc = this.describeCurrentRoom();
    this.state.logs.push(...roomDesc);

    return this.state;
  }

  getState(): GameState | null {
    return this.state;
  }

  processCommand(input: string): GameState {
    if (!this.state) {
      throw new Error("No active game session. Call startGame() first.");
    }

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
      case ActionType.LOOK:
        logs.push(...this.describeCurrentRoom());
        break;
      case ActionType.STATUS:
        logs.push(...this.describePlayerStatus());
        break;
      case ActionType.TAKE:
        logs.push(...this.handleTake(parsed));
        break;
      default:
        logs.push(`Unknown command: "${input}". Try: attack, defend, move [direction], look, status, cast [spell]`);
    }

    this.state.logs.push(...logs);
    this.updateGameStatus();

    return this.state;
  }

  updateState(): GameState {
    if (!this.state) throw new Error("No active game session.");
    this.updateGameStatus();
    return this.state;
  }

  private handleAttack(parsed: ParsedCommand): string[] {
    const state = this.state!;
    const dungeonManager = new DungeonManager(state.dungeon);
    const activeEnemies = dungeonManager.getActiveEnemies(state.currentRoomId);

    if (activeEnemies.length === 0) {
      return ["There are no enemies here to attack."];
    }

    state.gameStatus = GameStatus.IN_COMBAT;

    let target = activeEnemies[0];
    if (parsed.target) {
      const found = activeEnemies.find((e) =>
        e.name.toLowerCase().includes(parsed.target!.toLowerCase())
      );
      if (found) target = found;
      else return [`You don't see a "${parsed.target}" here. Available enemies: ${activeEnemies.map((e) => e.name).join(", ")}`];
    }

    const result = this.combat.attack(state.player, target);
    this.applyXpGain(result);

    const remaining = dungeonManager.getActiveEnemies(state.currentRoomId);
    if (remaining.length === 0) {
      state.gameStatus = GameStatus.EXPLORING;
    }

    return result.messages;
  }

  private handleDefend(): string[] {
    const state = this.state!;
    const dungeonManager = new DungeonManager(state.dungeon);
    const activeEnemies = dungeonManager.getActiveEnemies(state.currentRoomId);

    if (activeEnemies.length === 0) {
      state.player.isDefending = true;
      return ["You take a defensive stance, but there are no enemies nearby."];
    }

    state.gameStatus = GameStatus.IN_COMBAT;
    const result = this.combat.defend(state.player, activeEnemies);
    this.applyXpGain(result);
    return result.messages;
  }

  private handleMove(parsed: ParsedCommand): string[] {
    const state = this.state!;
    const dungeonManager = new DungeonManager(state.dungeon);

    const activeEnemies = dungeonManager.getActiveEnemies(state.currentRoomId);
    if (activeEnemies.length > 0) {
      return ["You cannot flee! Enemies block your path. Defeat them first!"];
    }

    const direction = parsed.direction;
    if (!direction) {
      return ["Which direction? Try: move north, move south, move east, move west"];
    }

    const nextRoomId = dungeonManager.canMove(state.currentRoomId, direction);
    if (!nextRoomId) {
      return [`You cannot go ${direction} from here. Check the exits.`];
    }

    state.currentRoomId = nextRoomId;
    dungeonManager.markExplored(nextRoomId);
    state.gameStatus = GameStatus.EXPLORING;

    const msgs = [`You move ${direction}...`];
    msgs.push(...this.describeCurrentRoom());
    return msgs;
  }

  private handleCastSpell(parsed: ParsedCommand): string[] {
    const state = this.state!;
    const dungeonManager = new DungeonManager(state.dungeon);
    const activeEnemies = dungeonManager.getActiveEnemies(state.currentRoomId);

    const spellName = parsed.target ?? "fireball";
    let targetEnemy = activeEnemies.length > 0 ? activeEnemies[0] : null;

    if (parsed.target) {
      const found = activeEnemies.find((e) =>
        e.name.toLowerCase().includes(parsed.target!.toLowerCase())
      );
      if (found) targetEnemy = found;
    }

    if (activeEnemies.length > 0) {
      state.gameStatus = GameStatus.IN_COMBAT;
    }

    const result = this.combat.castSpell(state.player, spellName, targetEnemy, activeEnemies);
    this.applyXpGain(result);

    const remaining = dungeonManager.getActiveEnemies(state.currentRoomId);
    if (remaining.length === 0 && activeEnemies.length > 0) {
      state.gameStatus = GameStatus.EXPLORING;
    }

    return result.messages;
  }

  private handleTake(parsed: ParsedCommand): string[] {
    const state = this.state!;
    const room = state.dungeon.rooms.get(state.currentRoomId);
    if (!room) return ["Room not found."];

    if (room.items.length === 0) return ["There is nothing here to take."];

    const itemName = parsed.target?.toLowerCase();
    const itemIndex = itemName
      ? room.items.findIndex((i) => i.name.toLowerCase().includes(itemName))
      : 0;

    if (itemIndex === -1) return [`You don't see a "${parsed.target}" here.`];

    const [taken] = room.items.splice(itemIndex, 1);
    state.player.inventory.push(taken);
    return [`You pick up the ${taken.name} and add it to your inventory.`];
  }

  private describeCurrentRoom(): string[] {
    const state = this.state!;
    const room = state.dungeon.rooms.get(state.currentRoomId);
    if (!room) return ["You are in an unknown location."];

    const msgs: string[] = [
      `--- ${room.name} ---`,
      room.description,
    ];

    const exits = Object.keys(room.exits);
    msgs.push(`Exits: ${exits.length > 0 ? exits.join(", ") : "none"}`);

    const activeEnemies = room.enemies.filter((e) => !e.isDefeated);
    if (activeEnemies.length > 0) {
      msgs.push(`Enemies: ${activeEnemies.map((e) => `${e.name} (${e.hp}/${e.maxHp} HP)`).join(", ")}`);
    } else {
      msgs.push("The room is clear of enemies.");
    }

    if (room.items.length > 0) {
      msgs.push(`Items: ${room.items.map((i) => i.name).join(", ")}`);
    }

    return msgs;
  }

  private describePlayerStatus(): string[] {
    const player = this.state!.player;
    return [
      `--- ${player.name}'s Status ---`,
      `Level: ${player.level} | XP: ${player.xp}/${player.xpToNextLevel}`,
      `HP: ${player.hp}/${player.maxHp} | MP: ${player.mp}/${player.maxMp}`,
      `Attack: ${player.attack} | Defense: ${player.defense}`,
      `Abilities: ${player.abilities.map((a) => a.name).join(", ")}`,
      `Inventory: ${player.inventory.length > 0 ? player.inventory.map((i) => i.name).join(", ") : "empty"}`,
    ];
  }

  private applyXpGain(result: CombatResult): void {
    if (result.xpGained <= 0) return;
    const player = this.state!.player;
    player.xp += result.xpGained;

    while (player.xp >= player.xpToNextLevel) {
      player.xp -= player.xpToNextLevel;
      player.level += 1;
      player.xpToNextLevel = calculateXpToNextLevel(player.level);
      player.maxHp += 15;
      player.hp = Math.min(player.hp + 15, player.maxHp);
      player.maxMp += 10;
      player.mp = Math.min(player.mp + 10, player.maxMp);
      player.attack += 3;
      player.defense += 2;
      this.state!.logs.push(
        `LEVEL UP! You are now level ${player.level}! HP+15, MP+10, ATK+3, DEF+2`
      );
    }
  }

  private updateGameStatus(): void {
    const state = this.state!;
    if (!state) return;

    if (state.player.hp <= 0) {
      state.gameStatus = GameStatus.GAME_OVER;
      return;
    }

    const dungeonManager = new DungeonManager(state.dungeon);

    if (dungeonManager.isBossRoom(state.currentRoomId) && dungeonManager.isAllClear(state.currentRoomId)) {
      state.gameStatus = GameStatus.VICTORY;
      state.logs.push("VICTORY! The Orc Warlord is defeated! You are the champion of Dora Dungeons!");
      return;
    }

    const activeEnemies = dungeonManager.getActiveEnemies(state.currentRoomId);
    if (activeEnemies.length > 0) {
      state.gameStatus = GameStatus.IN_COMBAT;
    } else if (state.gameStatus === GameStatus.IN_COMBAT) {
      state.gameStatus = GameStatus.EXPLORING;
    }
  }
}
