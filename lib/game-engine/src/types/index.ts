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
  SHRINE = "SHRINE",
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
  /** Optional shop/drop value in gold. */
  value?: number;
}

/** Shop weapon that the player can own or purchase. */
export interface Weapon {
  id: string;
  name: string;
  description: string;
  price: number;
}

/** Shop armor that the player can own or purchase. */
export interface Armor {
  id: string;
  name: string;
  level: 1 | 2 | 3;
}

/** Simple inventory/shop item tracked in the player's bag. */
export interface ShopItem {
  id: string;
  name: string;
  value: number;
}

/**
 * Data-driven ability effect. Each effect is processed generically by
 * AbilityEffectRegistry — no switch statements, no hardcoded type checks.
 *
 * type: string key registered in AbilityEffectRegistry
 *       Built-ins: "DAMAGE" | "HEAL" | "APPLY_STATUS" | "MODIFY_STAT"
 *       Custom: register any new type without changing engine code.
 *
 * target: which combatants are affected
 *         "SELF"        — the player
 *         "ENEMY"       — single targeted enemy (or first if none specified)
 *         "ALL_ENEMIES" — every living enemy
 *
 * value:    numeric magnitude (damage amount, heal amount, stat delta)
 * statusId: key into StatusDefinitionRegistry for APPLY_STATUS effects
 * stat:     Player/StatBlock key for MODIFY_STAT effects
 */
export interface AbilityEffect {
  type: string;
  target: "SELF" | "ENEMY" | "ALL_ENEMIES";
  value?: number;
  statusId?: string;
  stat?: string;
  /** Narration template key (from NarrationRegistry) used by DAMAGE effects. */
  narrationKey?: string;
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
  /** Gold coins carried by the player (for future shop system). */
  gold: number;
  /** Weapons owned by the player (for future shop/equipment system). */
  weapons: Weapon[];
  /** Armors owned by the player (for future shop/equipment system). */
  armors: Armor[];
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
  shrineType?: string;
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
  seed: string;
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
