import { Item, ItemType, Player } from "../types/index.js";
import { ITEM_DEFINITIONS } from "../data/items.js";
import { scaleHealAmount } from "../scaling/LevelScaling.js";

export { ITEM_DEFINITIONS };

export function cloneItem(item: Item): Item {
  return { ...item };
}

export function getItemById(id: string): Item | undefined {
  const def = ITEM_DEFINITIONS[id];
  return def ? cloneItem(def) : undefined;
}

export function applyEquipment(player: Player, item: Item): string {
  if (!item.effect) return `You equip the ${item.name}, but notice no immediate change.`;

  if (item.type === ItemType.WEAPON) {
    if (player.equippedWeapon) unapplyEquipment(player, player.equippedWeapon);
    player.equippedWeapon = item;
    item.equipped = true;
  } else if (item.type === ItemType.ARMOR) {
    if (player.equippedArmor) unapplyEquipment(player, player.equippedArmor);
    player.equippedArmor = item;
    item.equipped = true;
  }

  applyStatModifier(player, item.effect.stat, item.effect.value);
  return `You equip the ${item.name}. ${item.description}`;
}

export function unapplyEquipment(player: Player, item: Item): void {
  if (!item.effect) return;
  applyStatModifier(player, item.effect.stat, -item.effect.value);
  item.equipped = false;
  if (player.equippedWeapon?.id === item.id) player.equippedWeapon = undefined;
  if (player.equippedArmor?.id === item.id) player.equippedArmor = undefined;
}

function applyStatModifier(
  player: Player,
  stat: keyof import("../types/index.js").StatBlock,
  value: number
): void {
  if (stat === "hp") {
    player.maxHp += value;
    player.hp = Math.min(player.hp + value, player.maxHp);
  } else if (stat === "mp") {
    player.maxMp += value;
    player.mp = Math.min(player.mp + value, player.maxMp);
  } else if (stat === "attack") {
    player.attack += value;
  } else if (stat === "defense") {
    player.defense += value;
  } else if (stat === "speed") {
    player.speed += value;
  } else if (stat === "maxHp") {
    player.maxHp += value;
  } else if (stat === "maxMp") {
    player.maxMp += value;
  }
}

export function useConsumable(player: Player, item: Item): { message: string; healed?: number } {
  if (!item.effect) return { message: `The ${item.name} seems to have no effect.` };

  let message = "";
  let healed: number | undefined;

  if (item.effect.stat === "hp") {
    const before  = player.hp;
    const heal    = scaleHealAmount(item.effect.value, player.dungeonLevel ?? 1);
    player.hp = Math.min(player.hp + heal, player.maxHp);
    healed = player.hp - before;
    message = `Restores ${healed} HP. (${player.hp}/${player.maxHp} HP)`;
  } else if (item.effect.stat === "mp") {
    const before = player.mp;
    player.mp = Math.min(player.mp + item.effect.value, player.maxMp);
    const restored = player.mp - before;
    message = `Restores ${restored} MP. (${player.mp}/${player.maxMp} MP)`;
  }

  player.inventory = player.inventory.filter((i) => i.id !== item.id);
  return { message, healed };
}

export function findItemByName(items: Item[], name: string): Item | undefined {
  const lower = name.toLowerCase();
  return items.find(
    (i) =>
      i.name.toLowerCase() === lower ||
      i.name.toLowerCase().includes(lower) ||
      lower.includes(i.name.toLowerCase())
  );
}
