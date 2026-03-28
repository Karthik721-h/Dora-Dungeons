import { Enemy } from "../types/index.js";
import { ENEMY_TEMPLATES } from "../data/enemies.js";

export { ENEMY_TEMPLATES };

export function createEnemy(templateKey: string, overrides?: Partial<Enemy>): Enemy {
  const template = ENEMY_TEMPLATES[templateKey];
  if (!template) throw new Error(`Unknown enemy template: "${templateKey}". Add it to data/enemies.ts.`);
  return {
    id: `${templateKey}-${Math.random().toString(36).slice(2, 8)}`,
    ...template,
    statusEffects: [],
    isDefeated: false,
    ...overrides,
  };
}

export function getEnemyAiAction(enemy: Enemy): "attack" | "special" {
  if (enemy.aiProfile === "aggressive") return Math.random() < 0.85 ? "attack" : "special";
  if (enemy.aiProfile === "caster") return Math.random() < 0.5 ? "attack" : "special";
  if (enemy.aiProfile === "defensive") return "attack";
  return Math.random() < 0.7 ? "attack" : "special";
}
