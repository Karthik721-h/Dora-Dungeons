import { Player, Enemy, Ability } from "../types/index.js";

export interface CombatResult {
  playerDamageDealt: number;
  enemyDamageDealt: number;
  enemyDefeated: boolean;
  playerDefeated: boolean;
  messages: string[];
  xpGained: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function rollDamage(base: number, variance: number = 0.3): number {
  const min = Math.floor(base * (1 - variance));
  const max = Math.ceil(base * (1 + variance));
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function calculateDamage(attacker: { attack: number }, defender: { defense: number }): number {
  const rawDamage = Math.max(1, rollDamage(attacker.attack) - Math.floor(defender.defense * 0.5));
  return clamp(rawDamage, 1, 999);
}

export function playerAttack(player: Player, enemy: Enemy): CombatResult {
  const messages: string[] = [];
  let xpGained = 0;

  const damageDealt = calculateDamage(player, enemy);
  enemy.hp = clamp(enemy.hp - damageDealt, 0, enemy.maxHp);
  messages.push(`You strike the ${enemy.name} for ${damageDealt} damage! (${enemy.hp}/${enemy.maxHp} HP remaining)`);

  let enemyDamageDealt = 0;
  let enemyDefeated = false;
  let playerDefeated = false;

  if (enemy.hp <= 0) {
    enemy.isDefeated = true;
    enemyDefeated = true;
    xpGained = enemy.xpReward;
    messages.push(`The ${enemy.name} collapses! You gain ${enemy.xpReward} XP.`);
  } else {
    const defenseMultiplier = player.isDefending ? 0.5 : 1.0;
    enemyDamageDealt = Math.floor(calculateDamage(enemy, player) * defenseMultiplier);
    player.hp = clamp(player.hp - enemyDamageDealt, 0, player.maxHp);

    if (player.isDefending) {
      messages.push(`The ${enemy.name} attacks! Your guard reduces the blow to ${enemyDamageDealt} damage.`);
    } else {
      messages.push(`The ${enemy.name} strikes back for ${enemyDamageDealt} damage! (${player.hp}/${player.maxHp} HP remaining)`);
    }

    if (player.hp <= 0) {
      playerDefeated = true;
      messages.push("You have been defeated! The dungeon claims another soul...");
    }
  }

  player.isDefending = false;

  return { playerDamageDealt: damageDealt, enemyDamageDealt, enemyDefeated, playerDefeated, messages, xpGained };
}

export function playerDefend(player: Player, enemies: Enemy[]): CombatResult {
  const messages: string[] = [];
  player.isDefending = true;
  messages.push("You take a defensive stance, ready to absorb the next blow.");

  let totalEnemyDamage = 0;
  let playerDefeated = false;

  for (const enemy of enemies) {
    if (enemy.isDefeated) continue;
    const reduced = Math.floor(calculateDamage(enemy, player) * 0.5);
    totalEnemyDamage += reduced;
    player.hp = clamp(player.hp - reduced, 0, player.maxHp);
    messages.push(`${enemy.name} attacks through your guard for ${reduced} damage. (${player.hp}/${player.maxHp} HP)`);
  }

  if (player.hp <= 0) {
    playerDefeated = true;
    messages.push("Even in defense, you fall. The dungeon is unforgiving...");
  }

  player.isDefending = false;

  return { playerDamageDealt: 0, enemyDamageDealt: totalEnemyDamage, enemyDefeated: false, playerDefeated, messages, xpGained: 0 };
}

export function playerCastSpell(player: Player, spellName: string, enemy: Enemy | null, enemies: Enemy[]): CombatResult {
  const messages: string[] = [];
  let playerDamageDealt = 0;
  let enemyDamageDealt = 0;
  let enemyDefeated = false;
  let playerDefeated = false;
  let xpGained = 0;

  const spell = player.abilities.find(
    (a) => a.name.toLowerCase().includes(spellName?.toLowerCase() ?? "") || spellName?.toLowerCase().includes(a.name.toLowerCase())
  ) ?? player.abilities[0];

  if (!spell) {
    messages.push("You don't know any spells!");
    return { playerDamageDealt, enemyDamageDealt, enemyDefeated, playerDefeated, messages, xpGained };
  }

  if (player.mp < spell.mpCost) {
    messages.push(`Not enough mana to cast ${spell.name}! (Need ${spell.mpCost} MP, have ${player.mp} MP)`);
    return { playerDamageDealt, enemyDamageDealt, enemyDefeated, playerDefeated, messages, xpGained };
  }

  player.mp = clamp(player.mp - spell.mpCost, 0, player.maxMp);

  if (spell.type === "offensive" && enemy && spell.damage) {
    const rawDamage = rollDamage(spell.damage);
    const damage = Math.max(1, rawDamage - Math.floor(enemy.defense * 0.3));
    enemy.hp = clamp(enemy.hp - damage, 0, enemy.maxHp);
    playerDamageDealt = damage;
    messages.push(`You cast ${spell.name}! The ${enemy.name} takes ${damage} magic damage! (${enemy.hp}/${enemy.maxHp} HP remaining)`);

    if (enemy.hp <= 0) {
      enemy.isDefeated = true;
      enemyDefeated = true;
      xpGained = enemy.xpReward;
      messages.push(`The ${enemy.name} is incinerated! You gain ${enemy.xpReward} XP.`);
    }
  } else if (spell.type === "defensive" && spell.healAmount) {
    const healed = Math.min(spell.healAmount, player.maxHp - player.hp);
    player.hp = clamp(player.hp + healed, 0, player.maxHp);
    messages.push(`You cast ${spell.name} and recover ${healed} HP! (${player.hp}/${player.maxHp} HP)`);
  }

  if (!enemyDefeated) {
    for (const e of enemies) {
      if (e.isDefeated) continue;
      const dmg = calculateDamage(e, player);
      enemyDamageDealt += dmg;
      player.hp = clamp(player.hp - dmg, 0, player.maxHp);
      messages.push(`${e.name} retaliates for ${dmg} damage! (${player.hp}/${player.maxHp} HP)`);
    }

    if (player.hp <= 0) {
      playerDefeated = true;
      messages.push("The magic exhausts you and the enemies finish the job. You fall in darkness...");
    }
  }

  player.isDefending = false;

  return { playerDamageDealt, enemyDamageDealt, enemyDefeated, playerDefeated, messages, xpGained };
}

export class CombatSystem {
  attack(player: Player, enemy: Enemy): CombatResult {
    return playerAttack(player, enemy);
  }

  defend(player: Player, enemies: Enemy[]): CombatResult {
    return playerDefend(player, enemies);
  }

  castSpell(player: Player, spellName: string, enemy: Enemy | null, enemies: Enemy[]): CombatResult {
    return playerCastSpell(player, spellName, enemy, enemies);
  }
}
