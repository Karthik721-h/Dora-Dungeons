import { Item, ItemType, Player } from "../types/index.js";

export const ITEMS: Record<string, Item> = {
  health_potion: {
    id: "health_potion",
    name: "Health Potion",
    description: "A bubbling red vial that restores 40 HP.",
    type: ItemType.CONSUMABLE,
    effect: { stat: "hp", value: 40 },
  },
  mana_potion: {
    id: "mana_potion",
    name: "Mana Potion",
    description: "A shimmering blue vial that restores 25 MP.",
    type: ItemType.CONSUMABLE,
    effect: { stat: "mp", value: 25 },
  },
  iron_sword: {
    id: "iron_sword",
    name: "Iron Sword",
    description: "A well-balanced iron blade. Attack +8.",
    type: ItemType.WEAPON,
    effect: { stat: "attack", value: 8 },
  },
  silver_dagger: {
    id: "silver_dagger",
    name: "Silver Dagger",
    description: "A quick, sharp dagger. Attack +5, Speed +3.",
    type: ItemType.WEAPON,
    effect: { stat: "attack", value: 5 },
  },
  leather_armor: {
    id: "leather_armor",
    name: "Leather Armor",
    description: "Sturdy boiled leather. Defense +5.",
    type: ItemType.ARMOR,
    effect: { stat: "defense", value: 5 },
  },
  chain_mail: {
    id: "chain_mail",
    name: "Chain Mail",
    description: "Interlocked rings of steel. Defense +10.",
    type: ItemType.ARMOR,
    effect: { stat: "defense", value: 10 },
  },
  enchanted_ring: {
    id: "enchanted_ring",
    name: "Enchanted Ring",
    description: "A ring humming with arcane energy. Max MP +20.",
    type: ItemType.MISC,
    effect: { stat: "maxMp", value: 20 },
  },
};

export function cloneItem(item: Item): Item {
  return { ...item };
}

export function applyEquipment(player: Player, item: Item): string {
  if (!item.effect) return `You equip the ${item.name}, but notice no immediate change.`;

  if (item.type === ItemType.WEAPON) {
    if (player.equippedWeapon) {
      unapplyEquipment(player, player.equippedWeapon);
    }
    player.equippedWeapon = item;
    item.equipped = true;
  } else if (item.type === ItemType.ARMOR) {
    if (player.equippedArmor) {
      unapplyEquipment(player, player.equippedArmor);
    }
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

function applyStatModifier(player: Player, stat: keyof import("../types/index.js").StatBlock, value: number): void {
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
    const before = player.hp;
    player.hp = Math.min(player.hp + item.effect.value, player.maxHp);
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
