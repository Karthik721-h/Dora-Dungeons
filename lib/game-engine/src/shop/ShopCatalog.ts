/**
 * ShopCatalog
 *
 * Defines the Blacksmith Shop inventory for Dora Dungeons.
 * Shared between the API routes and the frontend via the api-server.
 * The frontend receives the catalog via GET /api/shop/catalog.
 *
 * Weapons go into player.inventory (ItemType.WEAPON) and are auto-equipped on purchase.
 * Armors go into player.inventory (ItemType.ARMOR) with effect.value = level (1–3).
 * Armors are auto-equipped on purchase/upgrade.
 */

import crypto from "crypto";
import { Item, ItemType } from "../types/index.js";

// ── Weapon catalog ─────────────────────────────────────────────────────────

export interface ShopWeapon {
  id: string;
  name: string;
  description: string;
  price: number;
  attackBonus: number;
  speedBonus?: number;
  mpBonus?: number;
}

export const SHOP_WEAPONS: ShopWeapon[] = [
  {
    id: "iron_sword",
    name: "Iron Sword",
    description: "A reliable iron blade, simple but effective.",
    price: 25,
    attackBonus: 5,
  },
  {
    id: "war_axe",
    name: "War Axe",
    description: "A heavy cleaving axe that can shatter bone.",
    price: 45,
    attackBonus: 9,
  },
  {
    id: "shadow_dagger",
    name: "Shadow Dagger",
    description: "A slim blade forged from shadow-iron, strikes swift and true.",
    price: 60,
    attackBonus: 7,
    speedBonus: 3,
  },
  {
    id: "thunder_bow",
    name: "Thunder Bow",
    description: "A longbow imbued with storm magic. Lightning crackles at the tips.",
    price: 80,
    attackBonus: 12,
  },
  {
    id: "crystal_staff",
    name: "Crystal Staff",
    description: "A crystalline staff that amplifies arcane power.",
    price: 100,
    attackBonus: 8,
    mpBonus: 20,
  },
  {
    id: "ashbringer",
    name: "Ashbringer",
    description: "A legendary blade of radiant light. Few can wield its power.",
    price: 150,
    attackBonus: 18,
  },
];

// ── Armor catalog ──────────────────────────────────────────────────────────

export interface ShopArmor {
  id: string;
  name: string;
  description: string;
  /** Cost to purchase at level 1 */
  buyPrice: number;
  /** Cost to upgrade: index 0 = to level 2, index 1 = to level 3 */
  upgradeCosts: [number, number];
}

export const SHOP_ARMORS: ShopArmor[] = [
  {
    id: "iron_plate",
    name: "Iron Plate",
    description: "Sturdy iron plating that turns aside basic blows.",
    buyPrice: 30,
    upgradeCosts: [40, 80],
  },
  {
    id: "shadowweave_cloak",
    name: "Shadowweave Cloak",
    description: "An enchanted cloak woven from shadow-silk.",
    buyPrice: 50,
    upgradeCosts: [60, 120],
  },
  {
    id: "judgment_armor",
    name: "Judgment Armor",
    description: "Sacred holy mail blessed by ancient paladins.",
    buyPrice: 80,
    upgradeCosts: [100, 180],
  },
];

// ── Sell prices for consumable / misc items ────────────────────────────────

export const SELL_PRICE_TABLE: Record<string, number> = {
  "Health Potion": 15,
  "Mana Potion": 10,
  "Elixir": 25,
  "Greater Health Potion": 30,
  "Antidote": 8,
};

/** Fallback sell price for items not in the table. */
export const DEFAULT_SELL_PRICE = 5;

// ── Armor damage-reduction constants ──────────────────────────────────────

/** Damage reduction fraction vs regular enemies by armor level (1–3). */
export const ARMOR_REDUCTION_NORMAL: Record<1 | 2 | 3, number> = {
  1: 0.25,
  2: 0.50,
  3: 0.75,
};

/** Damage reduction fraction vs bosses by armor level (1–3). */
export const ARMOR_REDUCTION_BOSS: Record<1 | 2 | 3, number> = {
  1: 0.10,
  2: 0.30,
  3: 0.50,
};

// ── Item factory helpers ───────────────────────────────────────────────────

export function makeWeaponItem(weapon: ShopWeapon): Item {
  return {
    id: crypto.randomUUID(),
    name: weapon.name,
    description: weapon.description,
    type: ItemType.WEAPON,
    effect: { stat: "attack", value: weapon.attackBonus },
  };
}

export function makeArmorItem(armor: ShopArmor, level: 1 | 2 | 3 = 1): Item {
  return {
    id: crypto.randomUUID(),
    name: armor.name,
    description: armor.description,
    type: ItemType.ARMOR,
    /** effect.value encodes the armor level (1–3) for damage reduction logic. */
    effect: { stat: "defense", value: level },
  };
}

// ── Lookup helpers ─────────────────────────────────────────────────────────

export function findShopWeaponById(id: string): ShopWeapon | undefined {
  return SHOP_WEAPONS.find(w => w.id === id);
}

export function findShopWeaponByName(name: string): ShopWeapon | undefined {
  return SHOP_WEAPONS.find(w => w.name.toLowerCase() === name.toLowerCase());
}

export function findShopArmorById(id: string): ShopArmor | undefined {
  return SHOP_ARMORS.find(a => a.id === id);
}

export function findShopArmorByName(name: string): ShopArmor | undefined {
  return SHOP_ARMORS.find(a => a.name.toLowerCase() === name.toLowerCase());
}

export function getSellPrice(itemName: string): number {
  return SELL_PRICE_TABLE[itemName] ?? DEFAULT_SELL_PRICE;
}
