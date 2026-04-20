import { Player, Weapon, Armor, Item } from "../types/index.js";

// ── Static weapon catalogue ───────────────────────────────────────────────────

const AVAILABLE_WEAPONS: Weapon[] = [
  { id: "ashbringer",    name: "Ashbringer",    description: "A holy blade that burns with righteous fire.",        price: 10  },
  { id: "keyblade",     name: "Keyblade",      description: "A mysterious key-shaped weapon of ancient power.",     price: 20  },
  { id: "leviathan-axe",name: "Inferno Axe",   description: "A rune-carved axe that erupts in searing flames on every strike. Each swing releases a torrent of magical fire.", price: 45  },
  { id: "gjallarhorn",  name: "Gjallarhorn",   description: "A legendary horn whose blast shakes the heavens.",     price: 50  },
  { id: "buster-sword", name: "Buster Sword",  description: "An enormous blade carried by a legendary mercenary.",  price: 60  },
  { id: "gunblade",     name: "Gunblade",      description: "A hybrid weapon that fires when it strikes.",          price: 100 },
];

// ── Upgrade cost table ────────────────────────────────────────────────────────

const UPGRADE_COSTS: Record<1 | 2, number> = { 1: 20, 2: 30 };

// ── Result type ───────────────────────────────────────────────────────────────

export interface ShopResult {
  success: boolean;
  message: string;
  updatedPlayer: Player;
}

// ── Helper finders ────────────────────────────────────────────────────────────

export function findWeaponById(id: string): Weapon | undefined {
  return AVAILABLE_WEAPONS.find((w) => w.id === id);
}

export function findArmorById(player: Player, id: string): Armor | undefined {
  return player.armors.find((a) => a.id === id);
}

export function findItemById(player: Player, id: string): Item | undefined {
  return player.inventory.find((i) => i.id === id);
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Return the full list of purchasable weapons. */
export function getAvailableWeapons(): Weapon[] {
  return AVAILABLE_WEAPONS;
}

/**
 * Purchase a weapon from the shop.
 * Deducts gold and adds the weapon to player.weapons.
 */
export function buyWeapon(player: Player, weaponId: string): ShopResult {
  const weapon = findWeaponById(weaponId);
  if (!weapon) {
    return { success: false, message: "ITEM_NOT_FOUND", updatedPlayer: player };
  }
  if (player.weapons.some((w) => w.id === weaponId)) {
    return { success: false, message: "ALREADY_OWNED", updatedPlayer: player };
  }
  if (player.gold < weapon.price) {
    return { success: false, message: "NOT_ENOUGH_GOLD", updatedPlayer: player };
  }
  const updatedPlayer: Player = {
    ...player,
    gold: player.gold - weapon.price,
    weapons: [...player.weapons, weapon],
  };
  return { success: true, message: "SUCCESS", updatedPlayer };
}

/**
 * Sell an item from player.inventory.
 * Removes the item and adds its value to player.gold.
 */
export function sellItem(player: Player, itemId: string): ShopResult {
  const item = findItemById(player, itemId);
  if (!item) {
    return { success: false, message: "ITEM_NOT_FOUND", updatedPlayer: player };
  }
  const saleValue = item.value ?? 0;
  const updatedPlayer: Player = {
    ...player,
    gold: player.gold + saleValue,
    inventory: player.inventory.filter((i) => i.id !== itemId),
  };
  return { success: true, message: "SUCCESS", updatedPlayer };
}

/**
 * Upgrade an armor piece owned by the player.
 * Max level is 3.  Costs 20 gold (1→2) or 30 gold (2→3).
 */
export function upgradeArmor(player: Player, armorId: string): ShopResult {
  const armor = findArmorById(player, armorId);
  if (!armor) {
    return { success: false, message: "ITEM_NOT_FOUND", updatedPlayer: player };
  }
  if (armor.level === 3) {
    return { success: false, message: "ARMOR_MAX_LEVEL", updatedPlayer: player };
  }
  const cost = UPGRADE_COSTS[armor.level as 1 | 2];
  if (player.gold < cost) {
    return { success: false, message: "NOT_ENOUGH_GOLD", updatedPlayer: player };
  }
  const newLevel = (armor.level + 1) as 1 | 2 | 3;
  const updatedArmors: Armor[] = player.armors.map((a) =>
    a.id === armorId ? { ...a, level: newLevel } : a
  );
  const updatedPlayer: Player = {
    ...player,
    gold: player.gold - cost,
    armors: updatedArmors,
  };
  return { success: true, message: "SUCCESS", updatedPlayer };
}
