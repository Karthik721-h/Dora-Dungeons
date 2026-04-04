import "./templates.js";
import { NarrationRegistry } from "./NarrationRegistry.js";
import { Enemy, Player, StatusEffectType, Direction } from "../types/index.js";

export { NarrationRegistry };

export const NarrationEngine = {
  attackHit: (attacker: string, defender: string, damage: number) =>
    NarrationRegistry.get("attack.hit", { attacker, defender, damage }),

  attackMiss: (attacker: string, defender: string) =>
    NarrationRegistry.get("attack.miss", { attacker, defender }),

  playerDefend: (player: Player) =>
    NarrationRegistry.get("defend.player", { player: player.name }),

  armorBlocked: (playerName: string, armorName: string, damageBlocked: number) =>
    NarrationRegistry.get("defend.armor_blocked", { player: playerName, armor: armorName, damageBlocked }),

  spellCast: (playerName: string, abilityName: string, targetName: string, damage: number) => {
    const key = `ability.${abilityName.toLowerCase().replace(/\s+/g, "_")}`;
    const templateKey = NarrationRegistry.has(key) ? key : "ability.damage";
    return NarrationRegistry.get(templateKey, { player: playerName, ability: abilityName, target: targetName, damage });
  },

  spellHeal: (playerName: string, abilityName: string, amount: number) => {
    const key = `ability.${abilityName.toLowerCase().replace(/\s+/g, "_")}`;
    const templateKey = NarrationRegistry.has(key) ? key : "ability.heal";
    return NarrationRegistry.get(templateKey, { player: playerName, ability: abilityName, amount });
  },

  spellBuff: (playerName: string, abilityName: string) => {
    const key = `ability.${abilityName.toLowerCase().replace(/\s+/g, "_")}`;
    const templateKey = NarrationRegistry.has(key) ? key : "ability.damage";
    return NarrationRegistry.get(templateKey, { player: playerName, ability: abilityName, target: playerName, damage: 0 });
  },

  notEnoughMana: (playerName: string, abilityName: string) =>
    NarrationRegistry.get("ability.no_mana", { player: playerName, ability: abilityName }),

  noTarget: (abilityName: string) =>
    NarrationRegistry.get("ability.no_target", { ability: abilityName, player: "You" }),

  statusEffectApplied: (targetName: string, effectType: StatusEffectType) =>
    NarrationRegistry.get(`status.applied.${effectType}`, { target: targetName }),

  statusEffectTick: (targetName: string, effectType: StatusEffectType, damage: number) =>
    NarrationRegistry.get(`status.tick.${effectType}`, { target: targetName, damage }),

  statusEffectExpired: (targetName: string, effectType: StatusEffectType) =>
    NarrationRegistry.get(`status.expired.${effectType}`, { target: targetName }),

  enemyDefeated: (enemy: Enemy) =>
    NarrationRegistry.get(`enemy.defeated.${enemy.type}`, { name: enemy.name }),

  playerDefeated: (player: Player) =>
    NarrationRegistry.get("player.defeated", { player: player.name }),

  enemyTurn: (enemy: Enemy, damage: number) =>
    NarrationRegistry.get(`enemy.turn.${enemy.type}`, { name: enemy.name, damage }),

  combatStart: (enemies: Enemy[]) =>
    NarrationRegistry.get("combat.start", { enemies: enemies.map((e) => e.name).join(" and ") }),

  combatVictory: () =>
    NarrationRegistry.get("combat.victory"),

  roomEntry: (roomName: string, description: string) =>
    NarrationRegistry.get("room.entry.new", { room: roomName, description }),

  roomAlreadyExplored: (roomName: string) =>
    NarrationRegistry.get("room.entry.revisit", { room: roomName }),

  moveBlocked: () =>
    NarrationRegistry.get("room.blocked"),

  noExit: (direction: Direction) =>
    NarrationRegistry.get("room.no_exit", { direction }),

  moving: (direction: Direction) =>
    NarrationRegistry.get(`move.${direction}`, { direction }) || `You move ${direction}...`,

  trapTriggered: (damage: number) =>
    NarrationRegistry.get("event.trap.hit", { damage }),

  trapAvoided: () =>
    NarrationRegistry.get("event.trap.dodge"),

  treasureFound: (itemName: string, gold: number) => {
    const base = NarrationRegistry.get("event.treasure", { item: itemName });
    if (gold > 0) return `${base} ${NarrationRegistry.get("event.treasure.gold", { gold })}`;
    return base;
  },

  itemPickedUp: (itemName: string) =>
    NarrationRegistry.get("item.pickup", { item: itemName }),

  itemUsed: (playerName: string, itemName: string, effect: string) =>
    NarrationRegistry.get("item.used", { player: playerName, item: itemName, effect }),

  xpGained: (amount: number) =>
    NarrationRegistry.get("xp.gained", { amount }),

  goldGained: (amount: number) =>
    NarrationRegistry.get("gold.gained", { amount }),

  levelUp: (player: Player) =>
    NarrationRegistry.get("level.up", { player: player.name, level: player.level }),

  fleeSuccess: (direction: Direction) =>
    NarrationRegistry.get("flee.success", { direction }),

  fleeFailed: () =>
    NarrationRegistry.get("flee.fail"),
};
