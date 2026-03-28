import { Ability, AbilityTargetType } from "../types/index.js";

/**
 * Pure data: all ability definitions.
 * effects[] are processed generically by AbilityEffectRegistry.
 *
 * Adding a new ability requires ONLY adding an entry here.
 * No changes to CombatSystem, AbilityEffectRegistry, or any engine code.
 */
export const ABILITY_DEFINITIONS: Record<string, Ability> = {
  fireball: {
    id: "fireball",
    name: "Fireball",
    description: "Hurl a roaring ball of fire. Deals heavy damage and burns.",
    mpCost: 15,
    targetType: AbilityTargetType.SINGLE_ENEMY,
    narrationKey: "ability.fireball",
    effects: [
      { type: "DAMAGE", target: "ENEMY", value: 35, narrationKey: "ability.fireball" },
      { type: "APPLY_STATUS", target: "ENEMY", statusId: "burn" },
    ],
  },

  lightning: {
    id: "lightning",
    name: "Lightning",
    description: "Call down a bolt of lightning to stun an enemy.",
    mpCost: 18,
    targetType: AbilityTargetType.SINGLE_ENEMY,
    narrationKey: "ability.lightning",
    effects: [
      { type: "DAMAGE", target: "ENEMY", value: 28, narrationKey: "ability.lightning" },
      { type: "APPLY_STATUS", target: "ENEMY", statusId: "stun" },
    ],
  },

  freeze: {
    id: "freeze",
    name: "Freeze",
    description: "Encase an enemy in frost.",
    mpCost: 12,
    targetType: AbilityTargetType.SINGLE_ENEMY,
    narrationKey: "ability.freeze",
    effects: [
      { type: "DAMAGE", target: "ENEMY", value: 20, narrationKey: "ability.freeze" },
      { type: "APPLY_STATUS", target: "ENEMY", statusId: "freeze" },
    ],
  },

  inferno: {
    id: "inferno",
    name: "Inferno",
    description: "Unleash a wave of fire that scorches all enemies.",
    mpCost: 25,
    targetType: AbilityTargetType.ALL_ENEMIES,
    narrationKey: "ability.inferno",
    effects: [
      { type: "DAMAGE", target: "ALL_ENEMIES", value: 18, narrationKey: "ability.inferno" },
      { type: "APPLY_STATUS", target: "ALL_ENEMIES", statusId: "burn" },
    ],
  },

  heal: {
    id: "heal",
    name: "Heal",
    description: "Channel restorative magic to recover HP.",
    mpCost: 10,
    targetType: AbilityTargetType.SELF,
    narrationKey: "ability.heal",
    effects: [
      { type: "HEAL", target: "SELF", value: 30, narrationKey: "ability.heal" },
    ],
  },

  shield: {
    id: "shield",
    name: "Shield",
    description: "Raise a magical shield that boosts your defense.",
    mpCost: 8,
    targetType: AbilityTargetType.SELF,
    narrationKey: "ability.shield",
    effects: [
      { type: "APPLY_STATUS", target: "SELF", statusId: "shield", narrationKey: "ability.shield" },
    ],
  },

  poison_dart: {
    id: "poison_dart",
    name: "Poison Dart",
    description: "Hurl a dart dipped in venom to poison an enemy over time.",
    mpCost: 8,
    targetType: AbilityTargetType.SINGLE_ENEMY,
    narrationKey: "ability.poison_dart",
    effects: [
      { type: "DAMAGE", target: "ENEMY", value: 10, narrationKey: "ability.poison_dart" },
      { type: "APPLY_STATUS", target: "ENEMY", statusId: "poison" },
    ],
  },

  /**
   * VALIDATION DEMO: Meteor Strike
   * Added in data only — zero changes to CombatSystem or AbilityEffectRegistry.
   * Three chained effects processed generically: DAMAGE + APPLY_STATUS + MODIFY_STAT.
   */
  meteor_strike: {
    id: "meteor_strike",
    name: "Meteor Strike",
    description:
      "Call down a blazing meteor that devastates all enemies but leaves you briefly exposed.",
    mpCost: 30,
    targetType: AbilityTargetType.ALL_ENEMIES,
    narrationKey: "ability.meteor_strike",
    effects: [
      { type: "DAMAGE", target: "ALL_ENEMIES", value: 45, narrationKey: "ability.meteor_strike" },
      { type: "APPLY_STATUS", target: "ALL_ENEMIES", statusId: "burn_heavy" },
      { type: "MODIFY_STAT", target: "SELF", stat: "defense", value: -2 },
    ],
  },
};

export const PLAYER_STARTING_ABILITY_IDS = ["fireball", "heal"];
