import { EnemyType } from "../types/index.js";

/**
 * Pure data: enemy templates. No logic here.
 * Adding a new enemy = add an entry. No code changes elsewhere.
 */
export interface EnemyTemplate {
  name: string;
  type: EnemyType;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  attack: number;
  defense: number;
  speed: number;
  xpReward: number;
  goldReward: number;
  aiProfile: "aggressive" | "defensive" | "caster" | "balanced";
}

export const ENEMY_TEMPLATES: Record<string, EnemyTemplate> = {
  goblin_scout: {
    name: "Goblin Scout",
    type: EnemyType.GOBLIN,
    hp: 22,
    maxHp: 22,
    mp: 0,
    maxMp: 0,
    attack: 9,
    defense: 3,
    speed: 14,
    xpReward: 30,
    goldReward: 5,
    aiProfile: "aggressive",
  },
  goblin_grunt: {
    name: "Goblin Grunt",
    type: EnemyType.GOBLIN,
    hp: 30,
    maxHp: 30,
    mp: 0,
    maxMp: 0,
    attack: 11,
    defense: 5,
    speed: 10,
    xpReward: 40,
    goldReward: 8,
    aiProfile: "balanced",
  },
  goblin_shaman: {
    name: "Goblin Shaman",
    type: EnemyType.MAGE,
    hp: 20,
    maxHp: 20,
    mp: 30,
    maxMp: 30,
    attack: 7,
    defense: 3,
    speed: 12,
    xpReward: 50,
    goldReward: 12,
    aiProfile: "caster",
  },
  skeleton: {
    name: "Skeleton Warrior",
    type: EnemyType.SKELETON,
    hp: 18,
    maxHp: 18,
    mp: 0,
    maxMp: 0,
    attack: 8,
    defense: 4,
    speed: 8,
    xpReward: 28,
    goldReward: 4,
    aiProfile: "balanced",
  },
  skeleton_archer: {
    name: "Skeleton Archer",
    type: EnemyType.SKELETON,
    hp: 15,
    maxHp: 15,
    mp: 0,
    maxMp: 0,
    attack: 10,
    defense: 2,
    speed: 11,
    xpReward: 32,
    goldReward: 6,
    aiProfile: "aggressive",
  },
  stone_golem: {
    name: "Stone Golem",
    type: EnemyType.TANK,
    hp: 60,
    maxHp: 60,
    mp: 0,
    maxMp: 0,
    attack: 16,
    defense: 14,
    speed: 5,
    xpReward: 90,
    goldReward: 20,
    aiProfile: "defensive",
  },
  dark_mage: {
    name: "Dark Mage",
    type: EnemyType.MAGE,
    hp: 35,
    maxHp: 35,
    mp: 50,
    maxMp: 50,
    attack: 14,
    defense: 5,
    speed: 11,
    xpReward: 75,
    goldReward: 18,
    aiProfile: "caster",
  },
  orc_guard: {
    name: "Orc Guard",
    type: EnemyType.TANK,
    hp: 45,
    maxHp: 45,
    mp: 0,
    maxMp: 0,
    attack: 14,
    defense: 10,
    speed: 7,
    xpReward: 80,
    goldReward: 15,
    aiProfile: "defensive",
  },
  orc_warlord: {
    name: "Orc Warlord",
    type: EnemyType.BOSS,
    hp: 120,
    maxHp: 120,
    mp: 20,
    maxMp: 20,
    attack: 22,
    defense: 14,
    speed: 9,
    xpReward: 300,
    goldReward: 100,
    aiProfile: "balanced",
  },
  vampire_lord: {
    name: "Vampire Lord",
    type: EnemyType.BOSS,
    hp: 100,
    maxHp: 100,
    mp: 40,
    maxMp: 40,
    attack: 19,
    defense: 10,
    speed: 13,
    xpReward: 280,
    goldReward: 90,
    aiProfile: "caster",
  },
};
