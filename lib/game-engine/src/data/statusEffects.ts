import { StatusEffectDefinition, StatusEffectType } from "../types/index.js";

/**
 * Pure data: all status effect definitions keyed by string ID.
 * AbilityEffect.statusId references these keys.
 * Adding a new status effect = add an entry here only.
 */
export const STATUS_DEFINITIONS: Record<string, StatusEffectDefinition> = {
  burn: {
    type: StatusEffectType.BURN,
    name: "Burning",
    duration: 2,
    damagePerTurn: 5,
  },
  burn_heavy: {
    type: StatusEffectType.BURN,
    name: "Searing Burn",
    duration: 3,
    damagePerTurn: 8,
  },
  stun: {
    type: StatusEffectType.STUN,
    name: "Stunned",
    duration: 1,
    skipsTurn: true,
  },
  freeze: {
    type: StatusEffectType.STUN,
    name: "Frozen",
    duration: 1,
    skipsTurn: true,
  },
  poison: {
    type: StatusEffectType.POISON,
    name: "Poisoned",
    duration: 3,
    damagePerTurn: 6,
  },
  poison_weak: {
    type: StatusEffectType.POISON,
    name: "Weakened Poison",
    duration: 2,
    damagePerTurn: 3,
  },
  shield: {
    type: StatusEffectType.SHIELD,
    name: "Shielded",
    duration: 2,
    defenseModifier: 8,
  },
  shield_strong: {
    type: StatusEffectType.SHIELD,
    name: "Fortified",
    duration: 3,
    defenseModifier: 14,
  },
  haste: {
    type: StatusEffectType.HASTE,
    name: "Haste",
    duration: 2,
  },
};
