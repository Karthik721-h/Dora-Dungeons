import { Ability } from "../types/index.js";
import { ABILITY_DEFINITIONS, PLAYER_STARTING_ABILITY_IDS } from "../data/abilities.js";

/**
 * AbilitySystem
 *
 * Thin lookup layer over data/abilities.ts.
 * All ability definitions live in data — this file only provides
 * convenience helpers for the engine to query them.
 */
export function getAbilityById(id: string): Ability | undefined {
  return ABILITY_DEFINITIONS[id];
}

export function getAllAbilities(): Ability[] {
  return Object.values(ABILITY_DEFINITIONS).map((a) => ({ ...a }));
}

export function getPlayerStartingAbilities(): Ability[] {
  return PLAYER_STARTING_ABILITY_IDS.map((id) => ({ ...ABILITY_DEFINITIONS[id]!, currentCooldown: 0 }));
}

export function findAbilityByName(abilities: Ability[], name: string): Ability | undefined {
  const lower = name.toLowerCase().trim();
  return abilities.find(
    (a) =>
      a.id === lower ||
      a.name.toLowerCase() === lower ||
      a.name.toLowerCase().includes(lower) ||
      lower.includes(a.name.toLowerCase())
  );
}
