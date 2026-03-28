import { Ability, AbilityTargetType, AbilityEffectType, StatusEffectType } from "../types/index.js";

export const ABILITIES: Record<string, Ability> = {
  fireball: {
    id: "fireball",
    name: "Fireball",
    description: "Launch a roaring ball of fire at a single enemy. Deals heavy damage and may burn.",
    mpCost: 15,
    targetType: AbilityTargetType.SINGLE_ENEMY,
    effectType: AbilityEffectType.ATTACK,
    baseDamage: 35,
    statusEffect: {
      type: StatusEffectType.BURN,
      name: "Burning",
      duration: 2,
      damagePerTurn: 5,
      skipsTurn: false,
    },
    narrationTemplate: "You hurl a roaring fireball at {target}!",
  },
  lightning: {
    id: "lightning",
    name: "Lightning",
    description: "Call down a bolt of lightning to stun an enemy.",
    mpCost: 18,
    targetType: AbilityTargetType.SINGLE_ENEMY,
    effectType: AbilityEffectType.ATTACK,
    baseDamage: 28,
    statusEffect: {
      type: StatusEffectType.STUN,
      name: "Stunned",
      duration: 1,
      skipsTurn: true,
    },
    narrationTemplate: "You call down lightning upon {target}!",
  },
  freeze: {
    id: "freeze",
    name: "Freeze",
    description: "Encase an enemy in frost, slowing and damaging them.",
    mpCost: 12,
    targetType: AbilityTargetType.SINGLE_ENEMY,
    effectType: AbilityEffectType.ATTACK,
    baseDamage: 20,
    statusEffect: {
      type: StatusEffectType.STUN,
      name: "Frozen",
      duration: 1,
      skipsTurn: true,
    },
    narrationTemplate: "Frost erupts from your hands and encases {target}!",
  },
  inferno: {
    id: "inferno",
    name: "Inferno",
    description: "Unleash a wave of fire that scorches all enemies.",
    mpCost: 25,
    targetType: AbilityTargetType.ALL_ENEMIES,
    effectType: AbilityEffectType.ATTACK,
    baseDamage: 18,
    statusEffect: {
      type: StatusEffectType.BURN,
      name: "Burning",
      duration: 2,
      damagePerTurn: 4,
      skipsTurn: false,
    },
    narrationTemplate: "You unleash an Inferno, engulfing all enemies in roaring flame!",
  },
  heal: {
    id: "heal",
    name: "Heal",
    description: "Channel restorative magic to recover HP.",
    mpCost: 10,
    targetType: AbilityTargetType.SELF,
    effectType: AbilityEffectType.HEAL,
    healAmount: 30,
    narrationTemplate: "You channel healing energy into yourself.",
  },
  shield: {
    id: "shield",
    name: "Shield",
    description: "Raise a magical shield that boosts your defense for 2 turns.",
    mpCost: 8,
    targetType: AbilityTargetType.SELF,
    effectType: AbilityEffectType.BUFF,
    statusEffect: {
      type: StatusEffectType.SHIELD,
      name: "Shielded",
      duration: 2,
      defenseModifier: 8,
      skipsTurn: false,
    },
    narrationTemplate: "You conjure a shimmering magical barrier around yourself.",
  },
  poison_dart: {
    id: "poison_dart",
    name: "Poison Dart",
    description: "Hurl a dart tipped with venom to poison an enemy over time.",
    mpCost: 8,
    targetType: AbilityTargetType.SINGLE_ENEMY,
    effectType: AbilityEffectType.DEBUFF,
    baseDamage: 10,
    statusEffect: {
      type: StatusEffectType.POISON,
      name: "Poisoned",
      duration: 3,
      damagePerTurn: 6,
      skipsTurn: false,
    },
    narrationTemplate: "You fling a venomous dart at {target}!",
  },
};

export const PLAYER_STARTING_ABILITIES: Ability[] = [
  { ...ABILITIES.fireball, currentCooldown: 0 },
  { ...ABILITIES.heal, currentCooldown: 0 },
];

export const ADVANCED_ABILITIES: Ability[] = [
  { ...ABILITIES.lightning, currentCooldown: 0 },
  { ...ABILITIES.freeze, currentCooldown: 0 },
  { ...ABILITIES.inferno, currentCooldown: 0 },
  { ...ABILITIES.shield, currentCooldown: 0 },
  { ...ABILITIES.poison_dart, currentCooldown: 0 },
];

export function findAbilityByName(abilities: Ability[], name: string): Ability | undefined {
  const lower = name.toLowerCase();
  return abilities.find(
    (a) =>
      a.name.toLowerCase() === lower ||
      a.id === lower ||
      a.name.toLowerCase().includes(lower) ||
      lower.includes(a.name.toLowerCase())
  );
}

export function tickAbilityCooldowns(abilities: Ability[]): void {
  for (const ability of abilities) {
    if ((ability.currentCooldown ?? 0) > 0) {
      ability.currentCooldown = (ability.currentCooldown ?? 0) - 1;
    }
  }
}
