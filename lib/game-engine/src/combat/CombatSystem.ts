import {
  Player,
  Enemy,
  CombatState,
  AbilityTargetType,
  StatusEffectType,
  EnemyType,
} from "../types/index.js";
import {
  ARMOR_REDUCTION_NORMAL,
  ARMOR_REDUCTION_BOSS,
} from "../shop/ShopCatalog.js";
import { NarrationEngine } from "../narration/NarrationEngine.js";
import { tickStatusEffects, getDefenseBonus, isStunned } from "./StatusEffects.js";
import { findAbilityByName } from "../systems/AbilitySystem.js";
import { AbilityEffectRegistry } from "../registries/AbilityEffectRegistry.js";

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

/**
 * Returns the fraction of damage absorbed by the player's equipped armor.
 * Armor level is stored in equippedArmor.effect.value (1–3).
 * Returns 0 if no armor is equipped.
 */
function getArmorDamageReduction(player: Player, attacker: Enemy): number {
  const armor = player.equippedArmor;
  if (!armor || !armor.effect) return 0;
  const level = armor.effect.value as 1 | 2 | 3;
  if (level < 1 || level > 3) return 0;
  const isBoss = attacker.type === EnemyType.BOSS;
  return isBoss
    ? (ARMOR_REDUCTION_BOSS[level] ?? 0)
    : (ARMOR_REDUCTION_NORMAL[level] ?? 0);
}

function buildTurnOrder(player: Player, enemies: Enemy[]): string[] {
  const combatants = [
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
  if (isStunned(enemy.statusEffects)) {
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
  const armorReduction = getArmorDamageReduction(player, enemy);
  const dmg = Math.max(1, Math.floor(calcDamage(enemy.attack, player.defense, defBonus) * defenseMult * (1 - armorReduction)));
  player.hp = clamp(player.hp - dmg, 0, player.maxHp);
  msgs.push(NarrationEngine.enemyTurn(enemy, dmg));
  if (player.hp <= 0) msgs.push(NarrationEngine.playerDefeated(player));
  return msgs;
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

    return {
      messages,
      xpGained,
      goldGained,
      allEnemiesDefeated: combat.enemies.every((e) => e.isDefeated),
      playerDefeated: player.hp <= 0,
    };
  }

  playerDefend(player: Player, combat: CombatState): CombatActionResult {
    const messages: string[] = [];
    player.isDefending = true;
    messages.push(NarrationEngine.playerDefend(player));
    messages.push(...this.runEnemyTurns(player, combat));
    const allDefeated = combat.enemies.every((e) => e.isDefeated);
    player.isDefending = false;
    return {
      messages,
      xpGained: 0,
      goldGained: 0,
      allEnemiesDefeated: allDefeated,
      playerDefeated: player.hp <= 0,
    };
  }

  /**
   * Spell casting — fully data-driven.
   *
   * This method:
   *  1. Looks up the ability by name
   *  2. Resolves targets based on ability.targetType
   *  3. Iterates ability.effects[] and delegates each to AbilityEffectRegistry
   *
   * It NEVER branches on ability name, effect type, or specific values.
   * Adding a new ability or effect type requires zero changes here.
   */
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
        `You don't know "${abilityName}". Known spells: ${player.abilities.map((a) => a.name).join(", ")}`
      );
      return { messages, xpGained: 0, goldGained: 0, allEnemiesDefeated: false, playerDefeated: false };
    }

    if (player.mp < ability.mpCost) {
      messages.push(NarrationEngine.notEnoughMana(player.name, ability.name));
      return { messages, xpGained: 0, goldGained: 0, allEnemiesDefeated: false, playerDefeated: false };
    }

    player.mp = clamp(player.mp - ability.mpCost, 0, player.maxMp);
    const activeEnemies = combat.enemies.filter((e) => !e.isDefeated);

    const targets: Enemy[] =
      ability.targetType === AbilityTargetType.ALL_ENEMIES
        ? activeEnemies
        : ability.targetType === AbilityTargetType.SELF
        ? []
        : targetEnemy
        ? [targetEnemy]
        : activeEnemies.slice(0, 1);

    const needsEnemyTarget =
      ability.targetType !== AbilityTargetType.SELF && activeEnemies.length > 0;

    if (needsEnemyTarget && targets.length === 0) {
      messages.push(NarrationEngine.noTarget(ability.name));
      player.mp = clamp(player.mp + ability.mpCost, 0, player.maxMp);
      return { messages, xpGained: 0, goldGained: 0, allEnemiesDefeated: false, playerDefeated: false };
    }

    let xpGained = 0;
    let goldGained = 0;

    for (const effect of ability.effects) {
      const result = AbilityEffectRegistry.process(effect, player, targets, messages);
      xpGained += result.xpGained;
      goldGained += result.goldGained;
    }

    player.isDefending = false;
    messages.push(...this.runEnemyTurns(player, combat));

    return {
      messages,
      xpGained,
      goldGained,
      allEnemiesDefeated: combat.enemies.every((e) => e.isDefeated),
      playerDefeated: player.hp <= 0,
    };
  }

  private runEnemyTurns(player: Player, combat: CombatState, justKilled?: Enemy): string[] {
    const messages: string[] = [];
    if (player.hp <= 0) return messages;

    for (const enemy of combat.enemies) {
      if (enemy.isDefeated) continue;
      if (justKilled?.id === enemy.id) continue;
      messages.push(...enemyAttackPlayer(enemy, player));
      if (player.hp <= 0) break;
    }

    const tick = tickStatusEffects(player.name, player.statusEffects);
    messages.push(...tick.messages);
    if (tick.damage > 0) {
      player.hp = clamp(player.hp - tick.damage, 0, player.maxHp);
      if (player.hp <= 0) messages.push(NarrationEngine.playerDefeated(player));
    }

    return messages;
  }
}
