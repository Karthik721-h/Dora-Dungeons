import { Ability, AbilityTargetType, AbilityEffectKind, StatusEffectType } from "../types/index.js";

const abilityRegistry = new Map<string, Ability>();

export const AbilityRegistry = {
  register(ability: Ability): void {
    abilityRegistry.set(ability.id, ability);
  },

  get(id: string): Ability | undefined {
    return abilityRegistry.get(id);
  },

  getAll(): Ability[] {
    return [...abilityRegistry.values()];
  },

  findByName(name: string): Ability | undefined {
    const lower = name.toLowerCase();
    for (const ability of abilityRegistry.values()) {
      if (
        ability.id === lower ||
        ability.name.toLowerCase() === lower ||
        ability.name.toLowerCase().includes(lower) ||
        lower.includes(ability.name.toLowerCase())
      ) {
        return ability;
      }
    }
    return undefined;
  },
};

AbilityRegistry.register({
  id: "fireball",
  name: "Fireball",
  description: "Launch a roaring ball of fire at a single enemy. Deals heavy damage and may burn.",
  mpCost: 15,
  targetType: AbilityTargetType.SINGLE_ENEMY,
  narrationKey: "ability.fireball",
  effects: [
    { kind: AbilityEffectKind.DAMAGE, value: 35 },
    {
      kind: AbilityEffectKind.APPLY_STATUS_TARGET,
      value: 0,
      statusDef: { type: StatusEffectType.BURN, name: "Burning", duration: 2, damagePerTurn: 5 },
    },
  ],
});

AbilityRegistry.register({
  id: "lightning",
  name: "Lightning",
  description: "Call down a bolt of lightning to stun an enemy.",
  mpCost: 18,
  targetType: AbilityTargetType.SINGLE_ENEMY,
  narrationKey: "ability.lightning",
  effects: [
    { kind: AbilityEffectKind.DAMAGE, value: 28 },
    {
      kind: AbilityEffectKind.APPLY_STATUS_TARGET,
      value: 0,
      statusDef: { type: StatusEffectType.STUN, name: "Stunned", duration: 1, skipsTurn: true },
    },
  ],
});

AbilityRegistry.register({
  id: "freeze",
  name: "Freeze",
  description: "Encase an enemy in frost, slowing and damaging them.",
  mpCost: 12,
  targetType: AbilityTargetType.SINGLE_ENEMY,
  narrationKey: "ability.freeze",
  effects: [
    { kind: AbilityEffectKind.DAMAGE, value: 20 },
    {
      kind: AbilityEffectKind.APPLY_STATUS_TARGET,
      value: 0,
      statusDef: { type: StatusEffectType.STUN, name: "Frozen", duration: 1, skipsTurn: true },
    },
  ],
});

AbilityRegistry.register({
  id: "inferno",
  name: "Inferno",
  description: "Unleash a wave of fire that scorches all enemies.",
  mpCost: 25,
  targetType: AbilityTargetType.ALL_ENEMIES,
  narrationKey: "ability.inferno",
  effects: [
    { kind: AbilityEffectKind.DAMAGE, value: 18 },
    {
      kind: AbilityEffectKind.APPLY_STATUS_TARGET,
      value: 0,
      statusDef: { type: StatusEffectType.BURN, name: "Burning", duration: 2, damagePerTurn: 4 },
    },
  ],
});

AbilityRegistry.register({
  id: "heal",
  name: "Heal",
  description: "Channel restorative magic to recover HP.",
  mpCost: 10,
  targetType: AbilityTargetType.SELF,
  narrationKey: "ability.heal",
  effects: [{ kind: AbilityEffectKind.HEAL_SELF, value: 30 }],
});

AbilityRegistry.register({
  id: "shield",
  name: "Shield",
  description: "Raise a magical shield that boosts your defense for 2 turns.",
  mpCost: 8,
  targetType: AbilityTargetType.SELF,
  narrationKey: "ability.shield",
  effects: [
    {
      kind: AbilityEffectKind.APPLY_STATUS_SELF,
      value: 0,
      statusDef: { type: StatusEffectType.SHIELD, name: "Shielded", duration: 2, defenseModifier: 8 },
    },
  ],
});

AbilityRegistry.register({
  id: "poison_dart",
  name: "Poison Dart",
  description: "Hurl a dart tipped with venom to poison an enemy over time.",
  mpCost: 8,
  targetType: AbilityTargetType.SINGLE_ENEMY,
  narrationKey: "ability.poison_dart",
  effects: [
    { kind: AbilityEffectKind.DAMAGE, value: 10 },
    {
      kind: AbilityEffectKind.APPLY_STATUS_TARGET,
      value: 0,
      statusDef: { type: StatusEffectType.POISON, name: "Poisoned", duration: 3, damagePerTurn: 6 },
    },
  ],
});

export const PLAYER_STARTING_ABILITIES: Ability[] = [
  { ...AbilityRegistry.get("fireball")!, currentCooldown: 0 },
  { ...AbilityRegistry.get("heal")!, currentCooldown: 0 },
];

export function findAbilityByName(abilities: Ability[], name: string): Ability | undefined {
  const lower = name.toLowerCase();
  return abilities.find(
    (a) =>
      a.id === lower ||
      a.name.toLowerCase() === lower ||
      a.name.toLowerCase().includes(lower) ||
      lower.includes(a.name.toLowerCase())
  );
}
