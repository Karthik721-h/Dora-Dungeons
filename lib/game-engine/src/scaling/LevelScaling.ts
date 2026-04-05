import { Enemy, EnemyType } from "../types/index.js";

/**
 * LevelScaling
 *
 * Pure, deterministic scaling functions for dungeon level progression.
 * All functions depend only on the dungeonLevel integer — no randomness.
 *
 * Curve:
 *   Level 1 → 1.0×   (baseline)
 *   Level 2 → 1.2×
 *   Level 3 → 1.4×
 *   Level 5 → 1.8×
 *   Level 11 → 3.0× (soft cap, never exceeds)
 *
 * Boss multiplier is 1.5× the normal multiplier, also capped at 3.0×.
 */

const MULTIPLIER_STEP = 0.2;
const MULTIPLIER_CAP  = 3.0;

/** Base enemy multiplier for the given dungeon level. */
export function getLevelMultiplier(dungeonLevel: number): number {
  const raw = 1 + (Math.max(1, dungeonLevel) - 1) * MULTIPLIER_STEP;
  return Math.min(raw, MULTIPLIER_CAP);
}

/**
 * Boss-specific multiplier — grows at 0.3× per level (faster than normal enemies
 * which grow at 0.2×), hard-capped at 3.0×.
 *
 * Level 1 → 1.0  (guaranteed baseline — no spike)
 * Level 2 → 1.3
 * Level 3 → 1.6
 * Level 5 → 2.2
 * Level 8 → 3.0  (cap reached)
 */
export function getBossMultiplier(dungeonLevel: number): number {
  if (dungeonLevel <= 1) return 1.0;
  const raw = 1 + (dungeonLevel - 1) * 0.3;
  return Math.min(raw, MULTIPLIER_CAP);
}

/** Round and floor-clamp a stat so it is always ≥ 1. */
function scaleValue(base: number, multiplier: number): number {
  return Math.max(1, Math.round(base * multiplier));
}

/**
 * Apply level scaling to an enemy in-place.
 * Bosses use the boss multiplier; all others use the base multiplier.
 * Scales: hp, maxHp, attack, defense, xpReward, goldReward.
 * Speed is intentionally not scaled — it affects turn order and could
 * break combat balance disproportionately.
 */
export function scaleEnemy(enemy: Enemy, dungeonLevel: number): void {
  if (dungeonLevel <= 1) return; // Level 1 is always baseline — skip math.

  const isBoss = enemy.type === EnemyType.BOSS;
  const mult   = isBoss ? getBossMultiplier(dungeonLevel) : getLevelMultiplier(dungeonLevel);

  enemy.hp        = scaleValue(enemy.hp,        mult);
  enemy.maxHp     = scaleValue(enemy.maxHp,     mult);
  enemy.attack    = scaleValue(enemy.attack,     mult);
  enemy.defense   = scaleValue(enemy.defense,    mult);
  enemy.xpReward  = scaleValue(enemy.xpReward,  mult);
  enemy.goldReward = scaleValue(enemy.goldReward, mult);
}

/**
 * Returns true if an extra enemy should spawn in multi-enemy combat rooms
 * at this dungeon level.  Threshold: level 3+ allows bonus spawn chances.
 *
 * @param rngValue  A value from [0, 1) produced by the seeded RNG.
 */
export function shouldSpawnBonusEnemy(dungeonLevel: number, rngValue: number): boolean {
  if (dungeonLevel < 3) return false;
  // Probability grows with level: 10% at L3, 20% at L5, capped at 40%.
  const probability = Math.min(0.1 + (dungeonLevel - 3) * 0.05, 0.4);
  return rngValue < probability;
}

/**
 * Atmospheric narration injected at dungeon start to signal difficulty tier.
 */
export function getDungeonAtmosphere(dungeonLevel: number): string {
  if (dungeonLevel >= 5) {
    return "A deadly aura fills this dungeon. The shadows themselves feel hostile. Only the strong survive here.";
  }
  if (dungeonLevel >= 3) {
    return "The air grows heavier as you descend. You sense the enemies here are stronger — and angrier.";
  }
  return "A quiet dungeon… something stirs in the dark, but it has not yet found you.";
}

/**
 * Gold treasure scaling for TREASURE room events.
 * Applied as a multiplier on the generated gold amount.
 */
export function scaleGoldReward(baseGold: number, dungeonLevel: number): number {
  return scaleValue(baseGold, getLevelMultiplier(dungeonLevel));
}

/**
 * Trap damage scaling — traps hit slightly harder at higher levels.
 */
export function scaleTrapDamage(baseDamage: number, dungeonLevel: number): number {
  // Traps scale at half the rate of enemies to keep them fair.
  const trapMult = Math.min(1 + (dungeonLevel - 1) * 0.1, 2.0);
  return scaleValue(baseDamage, trapMult);
}
