import { StatusEffect, StatusEffectType } from "../types/index.js";
import { NarrationEngine } from "../narration/NarrationEngine.js";

export interface StatusTickResult {
  damage: number;
  messages: string[];
  defenseBonus: number;
  skippedTurn: boolean;
}

export function tickStatusEffects(
  targetName: string,
  effects: StatusEffect[]
): StatusTickResult {
  const result: StatusTickResult = {
    damage: 0,
    messages: [],
    defenseBonus: 0,
    skippedTurn: false,
  };

  const expired: StatusEffect[] = [];

  for (const effect of effects) {
    if (effect.skipsTurn && effect.duration > 0) {
      result.skippedTurn = true;
      result.messages.push(NarrationEngine.statusEffectTick(targetName, effect.type, 0));
    }

    if (effect.damagePerTurn && effect.damagePerTurn > 0 && effect.duration > 0) {
      result.damage += effect.damagePerTurn;
      result.messages.push(
        NarrationEngine.statusEffectTick(targetName, effect.type, effect.damagePerTurn)
      );
    }

    if (effect.defenseModifier && effect.duration > 0) {
      result.defenseBonus += effect.defenseModifier;
    }

    effect.duration -= 1;
    if (effect.duration <= 0) {
      expired.push(effect);
    }
  }

  for (const exp of expired) {
    result.messages.push(NarrationEngine.statusEffectExpired(targetName, exp.type));
    const idx = effects.indexOf(exp);
    if (idx !== -1) effects.splice(idx, 1);
  }

  return result;
}

export function applyStatusEffect(effects: StatusEffect[], incoming: StatusEffect): void {
  const existing = effects.find((e) => e.type === incoming.type);
  if (existing) {
    existing.duration = Math.max(existing.duration, incoming.duration);
  } else {
    effects.push({ ...incoming });
  }
}

export function getDefenseBonus(effects: StatusEffect[]): number {
  return effects
    .filter((e) => e.type === StatusEffectType.SHIELD && e.duration > 0)
    .reduce((sum, e) => sum + (e.defenseModifier ?? 0), 0);
}

export function isStunned(effects: StatusEffect[]): boolean {
  return effects.some((e) => e.type === StatusEffectType.STUN && e.duration > 0 && e.skipsTurn);
}
