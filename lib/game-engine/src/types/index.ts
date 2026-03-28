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
  USE_ITEM = "USE_ITEM",
  LOOK = "LOOK",
  STATUS = "STATUS",
  TAKE = "TAKE",
  FLEE = "FLEE",
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

export enum StatusEffectType {
  POISON = "POISON",
  STUN = "STUN",
  BURN = "BURN",
  SHIELD = "SHIELD",
  HASTE = "HASTE",
}

export enum EnemyType {
  GOBLIN = "GOBLIN",
  MAGE = "MAGE",
  TANK = "TANK",
  SKELETON = "SKELETON",
  BOSS = "BOSS",
}

export enum AbilityTargetType {
  SINGLE_ENEMY = "SINGLE_ENEMY",
  ALL_ENEMIES = "ALL_ENEMIES",
  SELF = "SELF",
}

export enum AbilityEffectKind {
  DAMAGE = "DAMAGE",
  HEAL_SELF = "HEAL_SELF",
  APPLY_STATUS_TARGET = "APPLY_STATUS_TARGET",
  APPLY_STATUS_SELF = "APPLY_STATUS_SELF",
}

export enum ItemType {
  CONSUMABLE = "CONSUMABLE",
  WEAPON = "WEAPON",
  ARMOR = "ARMOR",
  MISC = "MISC",
}

export enum EventType {
  COMBAT = "COMBAT",
  TREASURE = "TREASURE",
  TRAP = "TRAP",
  STORY = "STORY",
  EMPTY = "EMPTY",
}

export interface StatusEffectDefinition {
  type: StatusEffectType;
  name: string;
  duration: number;
  damagePerTurn?: number;
  defenseModifier?: number;
  skipsTurn?: boolean;
}

export interface StatusEffect extends StatusEffectDefinition {
  narration: string;
}

export interface StatBlock {
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  attack: number;
  defense: number;
  speed: number;
}

export interface ItemEffect {
  stat: keyof StatBlock;
  value: number;
}

export interface Item {
  id: string;
  name: string;
  description: string;
  type: ItemType;
  effect?: ItemEffect;
  equipped?: boolean;
}

export interface AbilityEffect {
  kind: AbilityEffectKind;
  value: number;
  statusDef?: StatusEffectDefinition;
}

export interface Ability {
  id: string;
  name: string;
  description: string;
  mpCost: number;
  targetType: AbilityTargetType;
  effects: AbilityEffect[];
  narrationKey: string;
  cooldown?: number;
  currentCooldown?: number;
}

export interface Player extends StatBlock {
  id: string;
  name: string;
  level: number;
  xp: number;
  xpToNextLevel: number;
  abilities: Ability[];
  inventory: Item[];
  equippedWeapon?: Item;
  equippedArmor?: Item;
  statusEffects: StatusEffect[];
  isDefending: boolean;
  baseAttack: number;
  baseDefense: number;
}

export interface Enemy extends StatBlock {
  id: string;
  name: string;
  type: EnemyType;
  xpReward: number;
  goldReward: number;
  isDefeated: boolean;
  statusEffects: StatusEffect[];
  abilities?: Ability[];
  aiProfile: "aggressive" | "defensive" | "caster" | "balanced";
}

export interface RoomEvent {
  type: EventType;
  triggered: boolean;
  enemies?: Enemy[];
  itemReward?: Item;
  goldReward?: number;
  trapDamage?: number;
  storyText?: string;
}

export interface Room {
  id: string;
  name: string;
  description: string;
  exits: Partial<Record<Direction, string>>;
  event: RoomEvent;
  items: Item[];
  isExplored: boolean;
  ambientDescription?: string;
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
  ability?: string;
  item?: string;
  raw: string;
}

export interface CombatState {
  active: boolean;
  enemies: Enemy[];
  turnOrder: string[];
  currentTurnIndex: number;
  round: number;
  log: string[];
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
  combat: CombatState;
  gold: number;
}
