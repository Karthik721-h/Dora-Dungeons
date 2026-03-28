export enum GameStatus {
  IDLE = "IDLE",
  IN_COMBAT = "IN_COMBAT",
  EXPLORING = "EXPLORING",
  GAME_OVER = "GAME_OVER",
  VICTORY = "VICTORY",
}

export enum ActionType {
  ATTACK = "ATTACK",
  DEFEND = "DEFEND",
  MOVE = "MOVE",
  CAST_SPELL = "CAST_SPELL",
  LOOK = "LOOK",
  STATUS = "STATUS",
  TAKE = "TAKE",
  USE = "USE",
  UNKNOWN = "UNKNOWN",
}

export enum Direction {
  NORTH = "north",
  SOUTH = "south",
  EAST = "east",
  WEST = "west",
  UP = "up",
  DOWN = "down",
}

export interface Ability {
  id: string;
  name: string;
  description: string;
  mpCost: number;
  damage?: number;
  healAmount?: number;
  type: "offensive" | "defensive" | "utility";
}

export interface Item {
  id: string;
  name: string;
  description: string;
  type: "weapon" | "armor" | "potion" | "misc";
  effect?: {
    stat: "hp" | "mp" | "attack" | "defense";
    value: number;
  };
}

export interface Player {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  level: number;
  xp: number;
  xpToNextLevel: number;
  attack: number;
  defense: number;
  abilities: Ability[];
  inventory: Item[];
  isDefending: boolean;
}

export interface Enemy {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  xpReward: number;
  isDefeated: boolean;
  abilities?: Ability[];
}

export interface Room {
  id: string;
  name: string;
  description: string;
  exits: Partial<Record<Direction, string>>;
  enemies: Enemy[];
  items: Item[];
  isExplored: boolean;
}

export interface Dungeon {
  rooms: Map<string, Room>;
  startRoomId: string;
  bossRoomId: string;
}

export interface ParsedCommand {
  action: ActionType;
  target?: string;
  direction?: Direction;
  raw: string;
}

export interface GameState {
  sessionId: string;
  gameStatus: GameStatus;
  player: Player;
  currentRoomId: string;
  dungeon: Dungeon;
  logs: string[];
  parsedCommand?: ParsedCommand;
  turnCount: number;
}
