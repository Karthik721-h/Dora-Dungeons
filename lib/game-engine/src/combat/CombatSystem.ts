import {
  Player,
  Enemy,
  Armor,
  CombatState,
  AbilityTargetType,
  StatusEffectType,
  EnemyType,
} from "../types/index.js";
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

// ── Armor-based defense helpers ──────────────────────────────────────────────

/**
 * Pick the best armor from the player's collection.
 *
 * Rules (per spec):
 *  1. Find the highest level across all owned armors.
 *  2. If multiple armors share that highest level, choose one at random.
 *  3. Return null when the player has no armor.
 */
function selectBestArmor(player: Player): Armor | null {
  const armors = player.armors;
  if (!armors || armors.length === 0) return null;

  const maxLevel = Math.max(...armors.map((a) => a.level)) as 1 | 2 | 3;
  const candidates = armors.filter((a) => a.level === maxLevel);
  return candidates[Math.floor(Math.random() * candidates.length)]!;
}

/**
 * Return the damage multiplier when the player is defending with armor.
 *
 * Non-boss enemies:  level 1 → 25 % off (×0.75)
 *                    level 2 → 50 % off (×0.50)
 *                    level 3 → 75 % off (×0.25)
 *
 * Boss enemies:      level 1 → 10 % off (×0.90)
 *                    level 2 → 30 % off (×0.70)
 *                    level 3 → 50 % off (×0.50)
 */
function armorReductionMult(armor: Armor, isBoss: boolean): number {
  if (isBoss) {
    return armor.level === 1 ? 0.90 : armor.level === 2 ? 0.70 : 0.50;
  }
  return armor.level === 1 ? 0.75 : armor.level === 2 ? 0.50 : 0.25;
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

  const defBonus    = getDefenseBonus(player.statusEffects);
  const rawDamage   = calcDamage(enemy.attack, player.defense, defBonus);

  let defenseMult   = player.isDefending ? 0.5 : 1.0;
  let armorUsed: Armor | null = null;

  // ── Armor-based damage reduction (only active while defending) ───────────
  if (player.isDefending) {
    const bestArmor = selectBestArmor(player);
    if (bestArmor) {
      const isBoss = enemy.type === EnemyType.BOSS;
      defenseMult  = armorReductionMult(bestArmor, isBoss);
      armorUsed    = bestArmor;
    }
  }

  const dmg         = clamp(Math.floor(rawDamage * defenseMult), 0, 9999);
  const damageBlocked = rawDamage - dmg;

  player.hp = clamp(player.hp - dmg, 0, player.maxHp);
  msgs.push(NarrationEngine.enemyTurn(enemy, dmg));

  // Narrate armor absorption only when it meaningfully reduced damage.
  if (armorUsed && damageBlocked > 0) {
    msgs.push(NarrationEngine.armorBlocked(player.name, armorUsed.name, damageBlocked));
  }

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
