import crypto from "crypto";
import { Player } from "../types/index.js";
import { getPlayerStartingAbilities } from "../systems/AbilitySystem.js";

export function createPlayer(name: string): Player {
  return {
    id: crypto.randomUUID(),
    name,
    hp: 100,
    maxHp: 100,
    mp: 60,
    maxMp: 60,
    attack: 12,
    defense: 8,
    speed: 10,
    level: 1,
    xp: 0,
    xpToNextLevel: 100,
    abilities: getPlayerStartingAbilities(),
    inventory: [],
    statusEffects: [],
    isDefending: false,
    baseAttack: 12,
    baseDefense: 8,
    gold: 0,
    weapons: [],
    armors: [],
  };
}

export function calculateXpToNextLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.5, level - 1));
}
