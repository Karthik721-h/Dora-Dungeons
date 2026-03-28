import crypto from "crypto";
import { Enemy, EnemyType } from "../types/index.js";

function uuid(): string {
  return crypto.randomUUID();
}

type EnemyTemplate = Omit<Enemy, "id" | "statusEffects" | "isDefeated">;

const ENEMY_TEMPLATES: Record<string, EnemyTemplate> = {
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
};

export function createEnemy(templateKey: string, overrides?: Partial<Enemy>): Enemy {
  const template = ENEMY_TEMPLATES[templateKey];
  if (!template) throw new Error(`Unknown enemy template: ${templateKey}`);
  return {
    id: `${templateKey}-${uuid().slice(0, 8)}`,
    ...template,
    statusEffects: [],
    isDefeated: false,
    ...overrides,
  };
}

export function getEnemyAiAction(enemy: Enemy): "attack" | "special" {
  if (enemy.aiProfile === "aggressive") {
    return Math.random() < 0.85 ? "attack" : "special";
  }
  if (enemy.aiProfile === "caster") {
    return Math.random() < 0.5 ? "attack" : "special";
  }
  if (enemy.aiProfile === "defensive") {
    return "attack";
  }
  return Math.random() < 0.7 ? "attack" : "special";
}
