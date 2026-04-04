/**
 * ShopNarration
 *
 * Centralises all shop-related TTS narration so GameScreen never contains
 * raw narration strings.  Every function fires AudioManager with
 * { interrupt: true } to prevent speech overlap.
 *
 * Narration philosophy:
 *  – Immersive, in-world language (the blacksmith speaks)
 *  – Short pauses between sentences via commas / natural phrasing
 *  – Dynamic data (names, gold) inserted where meaningful
 *  – Never ambiguous: the player always knows what happened and what to do next
 */

import { AudioManager } from "./AudioManager";
import { ShopWeapon, ShopArmor, ShopInventoryItem, ARMOR_UPGRADE_COSTS } from "@/shop";

// ── Shop entry / exit ─────────────────────────────────────────────────────────

export function speakShopOpen(): void {
  AudioManager.speak(
    "The blacksmith greets you. You may purchase weapons, sell items, or reinforce your armor. What would you like to do?",
    { interrupt: true }
  );
}

export function speakShopExit(): void {
  AudioManager.speak(
    "The blacksmith bids you farewell. Safe travels, adventurer.",
    { interrupt: true }
  );
}

// ── Weapon list ───────────────────────────────────────────────────────────────

export function speakWeaponList(weapons: ShopWeapon[]): void {
  AudioManager.speakLines(
    [
      "Available weapons are as follows.",
      ...weapons.map((w) => `${w.name} costs ${w.price} gold.`),
      "Speak the name of the weapon you wish to acquire.",
    ],
    { interrupt: true }
  );
}

// ── Purchase ──────────────────────────────────────────────────────────────────

export function speakPurchaseSuccess(weaponName: string, goldRemaining: number): void {
  AudioManager.speak(
    `Your purchase is complete. ${weaponName} has been added to your equipment. You now have ${goldRemaining} gold remaining.`,
    { interrupt: true }
  );
}

export function speakPurchaseFail(): void {
  AudioManager.speak(
    "You do not have enough gold for that purchase. Continue your journey to earn more.",
    { interrupt: true }
  );
}

// ── Sell ──────────────────────────────────────────────────────────────────────

export function speakSellList(items: ShopInventoryItem[]): void {
  AudioManager.speakLines(
    [
      "You have the following items available for sale.",
      ...items.map((i) => `${i.name}, valued at ${i.value} gold.`),
      "Speak the name of the item you wish to sell.",
    ],
    { interrupt: true }
  );
}

export function speakSellSuccess(itemName: string, goldTotal: number): void {
  AudioManager.speak(
    `The item has been sold. Your gold reserves have increased. You now hold ${goldTotal} gold.`,
    { interrupt: true }
  );
}

export function speakSellEmpty(): void {
  AudioManager.speak(
    "Your inventory is empty. Explore the dungeon to gather items.",
    { interrupt: true }
  );
}

// ── Armor upgrade ─────────────────────────────────────────────────────────────

export function speakArmorList(armors: ShopArmor[]): void {
  AudioManager.speakLines(
    [
      "These are your armors available for reinforcement.",
      ...armors.map((a) => {
        if (a.level === 3) return `${a.name}, level three, already at maximum reinforcement.`;
        const cost = ARMOR_UPGRADE_COSTS[a.level as 1 | 2];
        return `${a.name}, currently level ${a.level}. Reinforcement costs ${cost} gold.`;
      }),
      "Speak the name of the armor you wish to reinforce.",
    ],
    { interrupt: true }
  );
}

export function speakUpgradeSuccess(armorName: string, level: number, goldRemaining: number): void {
  AudioManager.speak(
    `Your armor has been reinforced successfully. ${armorName} is now level ${level}. Your defenses have improved. You have ${goldRemaining} gold remaining.`,
    { interrupt: true }
  );
}

export function speakUpgradeFail(): void {
  AudioManager.speak(
    "You do not have enough gold to reinforce this armor. Defeat more enemies to increase your wealth.",
    { interrupt: true }
  );
}

export function speakUpgradeMax(): void {
  AudioManager.speak(
    "This armor has already reached its maximum reinforcement level. It cannot be improved further.",
    { interrupt: true }
  );
}

export function speakNoArmor(): void {
  AudioManager.speak(
    "You currently possess no armor to upgrade. Venture further into the dungeon to acquire gear.",
    { interrupt: true }
  );
}

// ── Errors / fallback ─────────────────────────────────────────────────────────

export function speakShopNoMatch(): void {
  AudioManager.speak(
    "I did not recognize that. Speak the name clearly and try again.",
    { interrupt: true }
  );
}
