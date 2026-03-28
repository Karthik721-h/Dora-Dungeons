import crypto from "crypto";
import { Player } from "../types/index.js";
import { PLAYER_STARTING_ABILITIES } from "../systems/AbilitySystem.js";

function uuid(): string {
  return crypto.randomUUID();
}

export function createPlayer(name: string): Player {
  return {
    id: uuid(),
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
    abilities: PLAYER_STARTING_ABILITIES.map((a) => ({ ...a })),
    inventory: [],
    statusEffects: [],
    isDefending: false,
    baseAttack: 12,
    baseDefense: 8,
  };
}

export function calculateXpToNextLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.5, level - 1));
}
