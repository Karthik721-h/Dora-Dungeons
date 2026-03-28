import {
  Player,
  Enemy,
  Ability,
  CombatState,
  AbilityTargetType,
  AbilityEffectKind,
  StatusEffectType,
  StatusEffect,
} from "../types/index.js";
import { NarrationEngine } from "../narration/NarrationEngine.js";
import { tickStatusEffects, applyStatusEffect, getDefenseBonus, isStunned } from "./StatusEffects.js";
import { findAbilityByName } from "../systems/AbilitySystem.js";

export interface CombatActionResult {
  messages: string[];
  xpGained: number;
  goldGained: number;
  allEnemiesDefeated: boolean;
  playerDefeated: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function rollDamage(base: number, variance = 0.25): number {
  const min = Math.floor(base * (1 - variance));
  const max = Math.ceil(base * (1 + variance));
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function calcDamage(attackerAtk: number, defenderDef: number, defenderBonus = 0): number {
  const raw = rollDamage(attackerAtk);
  return clamp(raw - Math.floor((defenderDef + defenderBonus) * 0.5), 1, 9999);
}

function buildTurnOrder(player: Player, enemies: Enemy[]): string[] {
  const combatants: Array<{ id: string; speed: number }> = [
    { id: "player", speed: player.speed },
    ...enemies.filter((e) => !e.isDefeated).map((e) => ({ id: e.id, speed: e.speed })),
  ];
  combatants.sort((a, b) => b.speed - a.speed);
  return combatants.map((c) => c.id);
}

export function initCombatState(player: Player, enemies: Enemy[]): CombatState {
  return {
    active: true,
    enemies,
    turnOrder: buildTurnOrder(player, enemies),
    currentTurnIndex: 0,
    round: 1,
    log: [],
  };
}

export function refreshTurnOrder(combat: CombatState, player: Player): void {
  combat.turnOrder = buildTurnOrder(player, combat.enemies.filter((e) => !e.isDefeated));
  combat.currentTurnIndex = 0;
}

function enemyAttackPlayer(enemy: Enemy, player: Player): string[] {
  const msgs: string[] = [];
  const stunned = isStunned(enemy.statusEffects);
  if (stunned) {
    msgs.push(NarrationEngine.statusEffectTick(enemy.name, StatusEffectType.STUN, 0));
    return msgs;
  }

  const statusTick = tickStatusEffects(enemy.name, enemy.statusEffects);
  msgs.push(...statusTick.messages);
  if (statusTick.damage > 0) {
    enemy.hp = clamp(enemy.hp - statusTick.damage, 0, enemy.maxHp);
    if (enemy.hp <= 0) {
      enemy.isDefeated = true;
      msgs.push(NarrationEngine.enemyDefeated(enemy));
      return msgs;
    }
  }

  const defBonus = getDefenseBonus(player.statusEffects);
  const defenseMult = player.isDefending ? 0.5 : 1.0;
  const raw = calcDamage(enemy.attack, player.defense, defBonus);
  const dmg = Math.floor(raw * defenseMult);
  player.hp = clamp(player.hp - dmg, 0, player.maxHp);
  msgs.push(NarrationEngine.enemyTurn(enemy, dmg));
  if (player.hp <= 0) msgs.push(NarrationEngine.playerDefeated(player));
  return msgs;
}

function resolveTargets(ability: Ability, targetEnemy: Enemy | null, activeEnemies: Enemy[]): Enemy[] {
  if (ability.targetType === AbilityTargetType.ALL_ENEMIES) return activeEnemies;
  if (ability.targetType === AbilityTargetType.SELF) return [];
  if (targetEnemy) return [targetEnemy];
  return activeEnemies.slice(0, 1);
}

function applyAbilityEffects(
  ability: Ability,
  player: Player,
  targets: Enemy[],
  messages: string[]
): { xpGained: number; goldGained: number } {
  let xpGained = 0;
  let goldGained = 0;

  let firstDamageDone = false;

  for (const effect of ability.effects) {
    switch (effect.kind) {
      case AbilityEffectKind.HEAL_SELF: {
        const healed = Math.min(effect.value, player.maxHp - player.hp);
        player.hp = clamp(player.hp + healed, 0, player.maxHp);
        messages.push(NarrationEngine.spellHeal(player.name, ability.name, healed));
        break;
      }

      case AbilityEffectKind.APPLY_STATUS_SELF: {
        if (effect.statusDef) {
          const statusEffect: StatusEffect = { ...effect.statusDef, narration: "" };
          applyStatusEffect(player.statusEffects, statusEffect);
          messages.push(NarrationEngine.statusEffectApplied(player.name, effect.statusDef.type));
        }
        break;
      }

      case AbilityEffectKind.DAMAGE: {
        if (targets.length === 0) break;

        if (!firstDamageDone) {
          const primary = targets[0]!;
          const primaryDmg = clamp(
            Math.floor(rollDamage(effect.value) - getDefenseBonus(primary.statusEffects) * 0.3),
            1,
            9999
          );
          messages.push(
            ability.targetType === AbilityTargetType.ALL_ENEMIES
              ? NarrationEngine.spellCast(player.name, ability.name, "all enemies", primaryDmg)
              : NarrationEngine.spellCast(player.name, ability.name, primary.name, primaryDmg)
          );
          firstDamageDone = true;
        }

        for (const target of targets) {
          const defBonus = getDefenseBonus(target.statusEffects);
          const dmg = clamp(Math.floor(rollDamage(effect.value) - defBonus * 0.3), 1, 9999);
          target.hp = clamp(target.hp - dmg, 0, target.maxHp);

          if (targets.length > 1) {
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
        }
        break;
      }

      case AbilityEffectKind.APPLY_STATUS_TARGET: {
        if (!effect.statusDef) break;
        for (const target of targets.filter((t) => !t.isDefeated)) {
          const statusEffect: StatusEffect = { ...effect.statusDef, narration: "" };
          applyStatusEffect(target.statusEffects, statusEffect);
          messages.push(NarrationEngine.statusEffectApplied(target.name, effect.statusDef.type));
        }
        break;
      }
    }
  }

  return { xpGained, goldGained };
}

export class CombatSystem {
  playerAttack(player: Player, enemy: Enemy, combat: CombatState): CombatActionResult {
    const messages: string[] = [];
    let xpGained = 0;
    let goldGained = 0;

    const defBonus = getDefenseBonus(enemy.statusEffects);
    const dmg = calcDamage(player.attack, enemy.defense, defBonus);
    enemy.hp = clamp(enemy.hp - dmg, 0, enemy.maxHp);
    messages.push(NarrationEngine.attackHit("You", enemy.name, dmg));

    if (enemy.hp <= 0) {
      enemy.isDefeated = true;
      xpGained = enemy.xpReward;
      goldGained = enemy.goldReward;
      messages.push(NarrationEngine.enemyDefeated(enemy));
      messages.push(NarrationEngine.xpGained(xpGained));
      if (goldGained > 0) messages.push(NarrationEngine.goldGained(goldGained));
    }

    player.isDefending = false;
    messages.push(...this.runEnemyTurns(player, combat, enemy));

    const allDefeated = combat.enemies.every((e) => e.isDefeated);
    const playerDefeated = player.hp <= 0;

    return { messages, xpGained, goldGained, allEnemiesDefeated: allDefeated, playerDefeated };
  }

  playerDefend(player: Player, combat: CombatState): CombatActionResult {
    const messages: string[] = [];
    player.isDefending = true;
    messages.push(NarrationEngine.playerDefend(player));
    messages.push(...this.runEnemyTurns(player, combat));
    const allDefeated = combat.enemies.every((e) => e.isDefeated);
    const playerDefeated = player.hp <= 0;
    player.isDefending = false;
    return { messages, xpGained: 0, goldGained: 0, allEnemiesDefeated: allDefeated, playerDefeated };
  }

  playerCastSpell(
    player: Player,
    abilityName: string,
    targetEnemy: Enemy | null,
    combat: CombatState
  ): CombatActionResult {
    const messages: string[] = [];

    const ability = findAbilityByName(player.abilities, abilityName);
    if (!ability) {
      messages.push(
        `You don't know the spell "${abilityName}". Your known spells: ${player.abilities.map((a) => a.name).join(", ")}`
      );
      return { messages, xpGained: 0, goldGained: 0, allEnemiesDefeated: false, playerDefeated: false };
    }

    if (player.mp < ability.mpCost) {
      messages.push(NarrationEngine.notEnoughMana(player.name, ability.name));
      return { messages, xpGained: 0, goldGained: 0, allEnemiesDefeated: false, playerDefeated: false };
    }

    player.mp = clamp(player.mp - ability.mpCost, 0, player.maxMp);
    const activeEnemies = combat.enemies.filter((e) => !e.isDefeated);
    const targets = resolveTargets(ability, targetEnemy, activeEnemies);

    if (
      ability.targetType !== AbilityTargetType.SELF &&
      ability.effects.some((e) => e.kind === AbilityEffectKind.DAMAGE || e.kind === AbilityEffectKind.APPLY_STATUS_TARGET) &&
      targets.length === 0
    ) {
      messages.push(NarrationEngine.noTarget(ability.name));
      player.mp = clamp(player.mp + ability.mpCost, 0, player.maxMp);
      return { messages, xpGained: 0, goldGained: 0, allEnemiesDefeated: false, playerDefeated: false };
    }

    const { xpGained, goldGained } = applyAbilityEffects(ability, player, targets, messages);

    player.isDefending = false;
    messages.push(...this.runEnemyTurns(player, combat));

    const allDefeated = combat.enemies.every((e) => e.isDefeated);
    const playerDefeated = player.hp <= 0;
    return { messages, xpGained, goldGained, allEnemiesDefeated: allDefeated, playerDefeated };
  }

  private runEnemyTurns(player: Player, combat: CombatState, justKilled?: Enemy): string[] {
    const messages: string[] = [];
    if (player.hp <= 0) return messages;

    for (const enemy of combat.enemies) {
      if (enemy.isDefeated) continue;
      if (justKilled && enemy.id === justKilled.id) continue;

      messages.push(...enemyAttackPlayer(enemy, player));
      if (player.hp <= 0) break;
    }

    const playerStatusTick = tickStatusEffects(player.name, player.statusEffects);
    messages.push(...playerStatusTick.messages);
    if (playerStatusTick.damage > 0) {
      player.hp = clamp(player.hp - playerStatusTick.damage, 0, player.maxHp);
      if (player.hp <= 0) messages.push(NarrationEngine.playerDefeated(player));
    }

    return messages;
  }
}
