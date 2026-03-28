import { Item, ItemType } from "../types/index.js";

/**
 * Pure data: all item definitions. No logic here.
 * Adding a new item = add an entry. No code changes elsewhere.
 */
export const ITEM_DEFINITIONS: Record<string, Item> = {
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
  elixir: {
    id: "elixir",
    name: "Elixir",
    description: "A golden draught that fully restores 60 HP.",
    type: ItemType.CONSUMABLE,
    effect: { stat: "hp", value: 60 },
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
    description: "A quick, sharp dagger. Attack +5.",
    type: ItemType.WEAPON,
    effect: { stat: "attack", value: 5 },
  },
  runic_blade: {
    id: "runic_blade",
    name: "Runic Blade",
    description: "An ancient sword etched with glowing runes. Attack +12.",
    type: ItemType.WEAPON,
    effect: { stat: "attack", value: 12 },
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
  speed_boots: {
    id: "speed_boots",
    name: "Boots of Swiftness",
    description: "Feather-light boots. Speed +4.",
    type: ItemType.MISC,
    effect: { stat: "speed", value: 4 },
  },
};
