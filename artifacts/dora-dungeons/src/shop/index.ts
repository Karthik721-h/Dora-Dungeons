// ── Browser-safe shop types and logic ────────────────────────────────────────
// Mirrors lib/game-engine/src/services/ShopService.ts but has zero Node deps.

export interface ShopWeapon {
  id: string;
  name: string;
  description: string;
  price: number;
}

export interface ShopArmor {
  id: string;
  name: string;
  level: 1 | 2 | 3;
}

// Items the player carries in their bag that can be sold
export interface ShopInventoryItem {
  id: string;
  name: string;
  value: number;
}

export interface ShopActionResult<T> {
  success: boolean;
  message: string;
  data: T;
}

// ── Static catalogue ─────────────────────────────────────────────────────────

export const SHOP_WEAPONS: ShopWeapon[] = [
  { id: "ashbringer",    name: "Ashbringer",    description: "A holy blade that burns with righteous fire.",       price: 10  },
  { id: "keyblade",     name: "Keyblade",      description: "A mysterious key-shaped weapon of ancient power.",    price: 20  },
  { id: "leviathan-axe",name: "Inferno Axe",   description: "A rune-carved axe that erupts in searing flames on every strike. Each swing releases a torrent of magical fire.", price: 45  },
  { id: "gjallarhorn",  name: "Gjallarhorn",   description: "A legendary horn whose blast shakes the heavens.",    price: 50  },
  { id: "buster-sword", name: "Buster Sword",  description: "An enormous blade carried by a legendary mercenary.", price: 60  },
  { id: "gunblade",     name: "Gunblade",      description: "A hybrid weapon that fires when it strikes.",         price: 100 },
];

export const ARMOR_UPGRADE_COSTS: Record<1 | 2, number> = { 1: 20, 2: 30 };

// ── RPG stat bridge ───────────────────────────────────────────────────────────
// Maps ShopWeapon IDs → RPG damage + specialAbility so purchases can be synced
// into RPGProgressionContext (which the LLM reads).

export interface RPGWeapon { id: string; name: string; damage: number; specialAbility: string }
export interface RPGArmor  { id: string; name: string; defense: number }

export const WEAPON_RPG_STATS: Record<string, { damage: number; specialAbility: string }> = {
  "wooden-sword":   { damage: 2,  specialAbility: "None" },
  "ashbringer":     { damage: 15, specialAbility: "Holy Fire" },
  "keyblade":       { damage: 25, specialAbility: "Magic Lock" },
  "leviathan-axe":  { damage: 40, specialAbility: "Inferno Blast" },
  "gjallarhorn":    { damage: 45, specialAbility: "Thunder Blast" },
  "buster-sword":   { damage: 55, specialAbility: "Limit Break" },
  "gunblade":       { damage: 80, specialAbility: "Trigger Happy" },
};

/** Convert a ShopWeapon into an RPGWeapon (damage + specialAbility from stat bridge). */
export function shopWeaponToRPGWeapon(w: ShopWeapon): RPGWeapon {
  const stats = WEAPON_RPG_STATS[w.id] ?? { damage: 10, specialAbility: "None" };
  return { id: w.id, name: w.name, ...stats };
}

/** Convert a ShopArmor into an RPGArmor (defense = level × 5). */
export function shopArmorToRPGArmor(a: ShopArmor): RPGArmor {
  return { id: a.id, name: a.name, defense: a.level * 5 };
}

// ── Pure shop functions ───────────────────────────────────────────────────────

export function buyWeapon(
  gold: number,
  ownedWeapons: ShopWeapon[],
  weaponId: string,
): ShopActionResult<{ gold: number; weapons: ShopWeapon[] }> {
  const weapon = SHOP_WEAPONS.find((w) => w.id === weaponId);
  if (!weapon) {
    return { success: false, message: "ITEM_NOT_FOUND", data: { gold, weapons: ownedWeapons } };
  }
  if (gold < weapon.price) {
    return { success: false, message: "NOT_ENOUGH_GOLD", data: { gold, weapons: ownedWeapons } };
  }
  return {
    success: true,
    message: "SUCCESS",
    data: { gold: gold - weapon.price, weapons: [...ownedWeapons, weapon] },
  };
}

export function sellItem(
  gold: number,
  inventory: ShopInventoryItem[],
  itemId: string,
): ShopActionResult<{ gold: number; inventory: ShopInventoryItem[] }> {
  const item = inventory.find((i) => i.id === itemId);
  if (!item) {
    return { success: false, message: "ITEM_NOT_FOUND", data: { gold, inventory } };
  }
  return {
    success: true,
    message: "SUCCESS",
    data: {
      gold: gold + item.value,
      inventory: inventory.filter((i) => i.id !== itemId),
    },
  };
}

export function upgradeArmor(
  gold: number,
  ownedArmors: ShopArmor[],
  armorId: string,
): ShopActionResult<{ gold: number; armors: ShopArmor[] }> {
  const armor = ownedArmors.find((a) => a.id === armorId);
  if (!armor) {
    return { success: false, message: "ITEM_NOT_FOUND", data: { gold, armors: ownedArmors } };
  }
  if (armor.level === 3) {
    return { success: false, message: "ARMOR_MAX_LEVEL", data: { gold, armors: ownedArmors } };
  }
  const cost = ARMOR_UPGRADE_COSTS[armor.level as 1 | 2];
  if (gold < cost) {
    return { success: false, message: "NOT_ENOUGH_GOLD", data: { gold, armors: ownedArmors } };
  }
  const newLevel = (armor.level + 1) as 1 | 2 | 3;
  return {
    success: true,
    message: "SUCCESS",
    data: {
      gold: gold - cost,
      armors: ownedArmors.map((a) => (a.id === armorId ? { ...a, level: newLevel } : a)),
    },
  };
}
