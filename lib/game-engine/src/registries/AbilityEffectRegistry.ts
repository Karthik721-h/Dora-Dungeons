import { AbilityEffect, Player, Enemy, StatusEffect } from "../types/index.js";
import { STATUS_DEFINITIONS } from "../data/statusEffects.js";
import { NarrationEngine, NarrationRegistry } from "../narration/NarrationEngine.js";
import { applyStatusEffect, getDefenseBonus } from "../combat/StatusEffects.js";
import { getLevelMultiplier } from "../scaling/LevelScaling.js";

export interface EffectResult {
  xpGained: number;
  goldGained: number;
}

type EffectHandler = (
  effect: AbilityEffect,
  player: Player,
  targets: Enemy[],
  messages: string[]
) => EffectResult;

const handlers = new Map<string, EffectHandler>();

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function rollDamage(base: number, variance = 0.25): number {
  const lo = Math.floor(base * (1 - variance));
  const hi = Math.ceil(base * (1 + variance));
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

/**
 * AbilityEffectRegistry
 *
 * Maps effect type strings to handler functions.
 * CombatSystem calls process() for each AbilityEffect — it never
 * branches on ability names, effect types, or specific values.
 *
 * Built-in types: DAMAGE | HEAL | APPLY_STATUS | MODIFY_STAT
 * Custom types:   register(type, handler) — no engine changes required.
 */
export const AbilityEffectRegistry = {
  register(type: string, handler: EffectHandler): void {
    handlers.set(type, handler);
  },

  process(
    effect: AbilityEffect,
    player: Player,
    allTargets: Enemy[],
    messages: string[]
  ): EffectResult {
    const handler = handlers.get(effect.type);
    if (!handler) {
      messages.push(`[Unknown effect type: "${effect.type}". Register a handler to support it.]`);
      return { xpGained: 0, goldGained: 0 };
    }
    return handler(effect, player, allTargets, messages);
  },

  has(type: string): boolean {
    return handlers.has(type);
  },

  registeredTypes(): string[] {
    return [...handlers.keys()];
  },
};

AbilityEffectRegistry.register(
  "DAMAGE",
  (effect, player, targets, messages): EffectResult => {
    let xpGained = 0;
    let goldGained = 0;

    const liveTargets = targets.filter((t) => !t.isDefeated);
    if (liveTargets.length === 0) return { xpGained: 0, goldGained: 0 };

    const primaryTarget = liveTargets[0]!;
    const isAoe = liveTargets.length > 1;

    // Scale spell damage with dungeon level so spells remain viable as enemies grow.
    // Uses the same 0.2-step enemy multiplier (capped at 3.0×) — spells and enemies
    // grow at the same rate, keeping the combat loop consistent at every level.
    const scaledValue = Math.round((effect.value ?? 0) * getLevelMultiplier(player.dungeonLevel ?? 1));

    const damages: number[] = liveTargets.map((t) => {
      const defBonus = getDefenseBonus(t.statusEffects);
      return clamp(Math.floor(rollDamage(scaledValue) - defBonus * 0.3), 1, 9999);
    });

    if (effect.narrationKey) {
      const templateKey = NarrationRegistry.has(effect.narrationKey) ? effect.narrationKey : "ability.damage";
      const targetLabel = isAoe ? "all enemies" : primaryTarget.name;
      messages.push(
        NarrationRegistry.get(templateKey, {
          player: player.name,
          target: targetLabel,
          damage: isAoe ? damages[0]! : damages[0]!,
        })
      );
    }

    liveTargets.forEach((target, i) => {
      const dmg = damages[i]!;
      target.hp = clamp(target.hp - dmg, 0, target.maxHp);

      if (isAoe) {
        messages.push(`${target.name} takes ${dmg} damage.`);
      }

      if (target.hp <= 0) {
        target.isDefeated = true;
        xpGained += target.xpReward;
        goldGained += target.goldReward;
        messages.push(NarrationEngine.enemyDefeated(target));
        messages.push(NarrationEngine.xpGained(target.xpReward));
        if (target.goldReward > 0) messages.push(NarrationEngine.goldGained(target.goldReward));
      }
    });

    return { xpGained, goldGained };
  }
);

AbilityEffectRegistry.register(
  "HEAL",
  (effect, player, _targets, messages): EffectResult => {
    const amount = Math.min(effect.value ?? 0, player.maxHp - player.hp);
    player.hp = clamp(player.hp + amount, 0, player.maxHp);
    if (effect.narrationKey && NarrationRegistry.has(effect.narrationKey)) {
      messages.push(NarrationRegistry.get(effect.narrationKey, { player: player.name, amount }));
    } else {
      messages.push(NarrationEngine.spellHeal(player.name, "", amount));
    }
    return { xpGained: 0, goldGained: 0 };
  }
);

AbilityEffectRegistry.register(
  "APPLY_STATUS",
  (effect, player, targets, messages): EffectResult => {
    const def = effect.statusId ? STATUS_DEFINITIONS[effect.statusId] : undefined;
    if (!def) {
      messages.push(`[Unknown statusId: "${effect.statusId}". Add it to data/statusEffects.ts.]`);
      return { xpGained: 0, goldGained: 0 };
    }

    const statusEffect: StatusEffect = { ...def, narration: "" };

    if (effect.target === "SELF") {
      applyStatusEffect(player.statusEffects, statusEffect);
      messages.push(NarrationEngine.statusEffectApplied(player.name, def.type));
    } else {
      for (const target of targets.filter((t) => !t.isDefeated)) {
        applyStatusEffect(target.statusEffects, { ...statusEffect });
        messages.push(NarrationEngine.statusEffectApplied(target.name, def.type));
      }
    }

    return { xpGained: 0, goldGained: 0 };
  }
);

AbilityEffectRegistry.register(
  "MODIFY_STAT",
  (effect, player, _targets, messages): EffectResult => {
    const stat = effect.stat as keyof Player;
    const delta = effect.value ?? 0;
    if (stat && stat in player && typeof (player as unknown as Record<string, unknown>)[stat] === "number") {
      (player as unknown as Record<string, number>)[stat] += delta;
      const sign = delta >= 0 ? "+" : "";
      messages.push(`${player.name}'s ${effect.stat} changes by ${sign}${delta}.`);
    } else {
      messages.push(`[MODIFY_STAT: unknown stat "${effect.stat}"]`);
    }
    return { xpGained: 0, goldGained: 0 };
  }
);
