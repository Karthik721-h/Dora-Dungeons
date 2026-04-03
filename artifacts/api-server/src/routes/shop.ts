/**
 * Shop routes — Blacksmith Shop for Dora Dungeons
 *
 * GET  /shop/catalog  → catalog + player gold/owned items
 * POST /shop/buy      → buy a weapon { itemId }
 * POST /shop/sell     → sell an inventory item { itemName }
 * POST /shop/upgrade  → upgrade an armor { armorId }
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { ItemType, Item } from "@workspace/game-engine";
import {
  SHOP_WEAPONS,
  SHOP_ARMORS,
  makeWeaponItem,
  makeArmorItem,
  findShopWeaponById,
  findShopArmorById,
  findShopArmorByName,
  getSellPrice,
} from "@workspace/game-engine";
import { loadSession, saveSession } from "../lib/gameSession.js";
import { GameState } from "@workspace/game-engine";

const router: IRouter = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

function serializeGameState(state: GameState) {
  const room = state.dungeon.rooms.get(state.currentRoomId)!;

  return {
    sessionId: state.sessionId,
    gameStatus: state.gameStatus,
    player: {
      id: state.player.id,
      name: state.player.name,
      hp: state.player.hp,
      maxHp: state.player.maxHp,
      mp: state.player.mp,
      maxMp: state.player.maxMp,
      level: state.player.level,
      xp: state.player.xp,
      xpToNextLevel: state.player.xpToNextLevel,
      attack: state.player.attack,
      defense: state.player.defense,
      abilities: state.player.abilities.map((a) => a.name),
      inventory: state.player.inventory.map((i) => i.name),
    },
    currentRoom: {
      id: room.id,
      name: room.name,
      description: room.description,
      exits: Object.fromEntries(Object.entries(room.exits)),
      enemies: (room.event.enemies ?? []).map((e) => ({
        id: e.id,
        name: e.name,
        hp: e.hp,
        maxHp: e.maxHp,
        attack: e.attack,
        defense: e.defense,
        xpReward: e.xpReward,
        isDefeated: e.isDefeated,
      })),
      items: room.items.map((i: Item) => i.name),
      isExplored: room.isExplored,
    },
    logs: state.logs.slice(-80),
    parsedCommand: undefined,
    turnCount: state.turnCount,
    gold: state.gold,
  };
}

/** Extract weapon items from player inventory. */
function getOwnedWeaponIds(state: GameState): string[] {
  const owned: string[] = [];
  for (const item of state.player.inventory) {
    if (item.type === ItemType.WEAPON) {
      const catalogEntry = SHOP_WEAPONS.find(
        (w) => w.name.toLowerCase() === item.name.toLowerCase()
      );
      if (catalogEntry) owned.push(catalogEntry.id);
    }
  }
  if (state.player.equippedWeapon) {
    const catalogEntry = SHOP_WEAPONS.find(
      (w) => w.name.toLowerCase() === state.player.equippedWeapon!.name.toLowerCase()
    );
    if (catalogEntry && !owned.includes(catalogEntry.id)) {
      owned.push(catalogEntry.id);
    }
  }
  return owned;
}

/** Extract armor items from player inventory with level info. */
function getOwnedArmors(state: GameState): Array<{ id: string; name: string; level: number }> {
  const armors: Array<{ id: string; name: string; level: number }> = [];
  const seen = new Set<string>();

  // Check inventory
  for (const item of state.player.inventory) {
    if (item.type === ItemType.ARMOR) {
      const catalogEntry = SHOP_ARMORS.find(
        (a) => a.name.toLowerCase() === item.name.toLowerCase()
      );
      if (catalogEntry && !seen.has(catalogEntry.id)) {
        seen.add(catalogEntry.id);
        armors.push({
          id: catalogEntry.id,
          name: catalogEntry.name,
          level: item.effect?.value ?? 1,
        });
      }
    }
  }

  // Check equipped armor
  if (state.player.equippedArmor) {
    const catalogEntry = SHOP_ARMORS.find(
      (a) => a.name.toLowerCase() === state.player.equippedArmor!.name.toLowerCase()
    );
    if (catalogEntry && !seen.has(catalogEntry.id)) {
      seen.add(catalogEntry.id);
      armors.push({
        id: catalogEntry.id,
        name: catalogEntry.name,
        level: state.player.equippedArmor.effect?.value ?? 1,
      });
    }
  }

  return armors;
}

/** Consumable/misc items the player can sell. */
function getSellableItems(
  state: GameState
): Array<{ name: string; sellPrice: number }> {
  return state.player.inventory
    .filter(
      (i) =>
        i.type === ItemType.CONSUMABLE ||
        (i.type === ItemType.MISC &&
          !SHOP_WEAPONS.some((w) => w.name === i.name) &&
          !SHOP_ARMORS.some((a) => a.name === i.name))
    )
    .map((i) => ({ name: i.name, sellPrice: getSellPrice(i.name) }));
}

// ── GET /shop/catalog ─────────────────────────────────────────────────────────

router.get("/catalog", async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const session = await loadSession(userId);

  const gold = session?.state.gold ?? 0;
  const ownedWeaponIds = session ? getOwnedWeaponIds(session.state) : [];
  const ownedArmors = session ? getOwnedArmors(session.state) : [];
  const sellableItems = session ? getSellableItems(session.state) : [];

  res.json({
    weapons: SHOP_WEAPONS,
    armors: SHOP_ARMORS,
    gold,
    ownedWeaponIds,
    ownedArmors,
    sellableItems,
  });
});

// ── POST /shop/buy ────────────────────────────────────────────────────────────

router.post("/buy", async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { itemId } = req.body as { itemId?: string };

  if (!itemId) {
    res.status(400).json({ error: "BAD_REQUEST", message: "itemId is required." });
    return;
  }

  const weapon = findShopWeaponById(itemId);
  if (!weapon) {
    res.status(404).json({ error: "NOT_FOUND", message: `Weapon "${itemId}" not found in catalog.` });
    return;
  }

  const session = await loadSession(userId);
  if (!session) {
    res.status(404).json({ error: "NO_SESSION", message: "No active game session." });
    return;
  }

  const { state } = session;

  // Check if already owned (in inventory or equipped)
  const alreadyOwned =
    state.player.inventory.some(
      (i) => i.type === ItemType.WEAPON && i.name.toLowerCase() === weapon.name.toLowerCase()
    ) ||
    state.player.equippedWeapon?.name.toLowerCase() === weapon.name.toLowerCase();

  if (alreadyOwned) {
    res.status(400).json({ error: "ALREADY_OWNED", message: `You already own the ${weapon.name}.` });
    return;
  }

  if (state.gold < weapon.price) {
    res.status(400).json({
      error: "INSUFFICIENT_GOLD",
      message: `You need ${weapon.price} gold but only have ${state.gold}.`,
    });
    return;
  }

  // Deduct gold
  state.gold -= weapon.price;

  // Create weapon item and add to inventory
  const weaponItem = makeWeaponItem(weapon);

  // Apply attack bonus and optionally speed / MP bonuses
  state.player.attack = state.player.baseAttack + weapon.attackBonus;
  if (weapon.speedBonus) state.player.speed += weapon.speedBonus;
  if (weapon.mpBonus) {
    state.player.maxMp += weapon.mpBonus;
    state.player.mp = Math.min(state.player.mp + weapon.mpBonus, state.player.maxMp);
  }

  // Auto-equip: move previous weapon to inventory, set new one as equipped
  if (state.player.equippedWeapon) {
    state.player.inventory.push(state.player.equippedWeapon);
  }
  state.player.equippedWeapon = weaponItem;

  state.logs.push(
    `[SHOP] Purchased ${weapon.name} for ${weapon.price} gold. It has been equipped. Gold remaining: ${state.gold}.`
  );

  await saveSession(userId, state);
  res.json(serializeGameState(state));
});

// ── POST /shop/sell ───────────────────────────────────────────────────────────

router.post("/sell", async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { itemName } = req.body as { itemName?: string };

  if (!itemName) {
    res.status(400).json({ error: "BAD_REQUEST", message: "itemName is required." });
    return;
  }

  const session = await loadSession(userId);
  if (!session) {
    res.status(404).json({ error: "NO_SESSION", message: "No active game session." });
    return;
  }

  const { state } = session;

  // Find the item in inventory (must be consumable/misc — no weapons or armors)
  const itemIndex = state.player.inventory.findIndex(
    (i) =>
      i.name.toLowerCase() === itemName.toLowerCase() &&
      (i.type === ItemType.CONSUMABLE || i.type === ItemType.MISC)
  );

  if (itemIndex === -1) {
    res.status(404).json({
      error: "ITEM_NOT_FOUND",
      message: `"${itemName}" is not a sellable item in your inventory.`,
    });
    return;
  }

  const [item] = state.player.inventory.splice(itemIndex, 1);
  if (!item) {
    res.status(500).json({ error: "INTERNAL", message: "Failed to remove item." });
    return;
  }

  const sellPrice = getSellPrice(item.name);
  state.gold += sellPrice;

  state.logs.push(
    `[SHOP] Sold ${item.name} for ${sellPrice} gold. Gold balance: ${state.gold}.`
  );

  await saveSession(userId, state);
  res.json(serializeGameState(state));
});

// ── POST /shop/upgrade ────────────────────────────────────────────────────────

router.post("/upgrade", async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { armorId, armorName } = req.body as { armorId?: string; armorName?: string };

  const armor = armorId
    ? findShopArmorById(armorId)
    : armorName
    ? findShopArmorByName(armorName)
    : undefined;

  if (!armor) {
    res.status(404).json({ error: "NOT_FOUND", message: "Armor not found in catalog." });
    return;
  }

  const session = await loadSession(userId);
  if (!session) {
    res.status(404).json({ error: "NO_SESSION", message: "No active game session." });
    return;
  }

  const { state } = session;

  // Find existing armor item in inventory or equipped slot
  let existingItem: Item | undefined;
  let existingIndex = -1;

  existingIndex = state.player.inventory.findIndex(
    (i) => i.type === ItemType.ARMOR && i.name.toLowerCase() === armor.name.toLowerCase()
  );
  if (existingIndex !== -1) {
    existingItem = state.player.inventory[existingIndex];
  } else if (
    state.player.equippedArmor?.name.toLowerCase() === armor.name.toLowerCase()
  ) {
    existingItem = state.player.equippedArmor;
  }

  const currentLevel = (existingItem?.effect?.value ?? 0) as 0 | 1 | 2 | 3;

  // If not owned, treat as level 0 — purchase at buy price to get level 1
  if (currentLevel === 0) {
    // Buy the armor at level 1
    if (state.gold < armor.buyPrice) {
      res.status(400).json({
        error: "INSUFFICIENT_GOLD",
        message: `You need ${armor.buyPrice} gold to purchase ${armor.name}. You have ${state.gold}.`,
      });
      return;
    }
    state.gold -= armor.buyPrice;
    const newArmor = makeArmorItem(armor, 1);
    state.player.equippedArmor = newArmor;
    state.logs.push(
      `[SHOP] Purchased ${armor.name} (Level 1) for ${armor.buyPrice} gold. Equipped. Gold remaining: ${state.gold}.`
    );
    await saveSession(userId, state);
    res.json(serializeGameState(state));
    return;
  }

  if (currentLevel >= 3) {
    res.status(400).json({
      error: "MAX_LEVEL",
      message: `${armor.name} is already at maximum level 3.`,
    });
    return;
  }

  // Upgrade from currentLevel → currentLevel + 1
  const upgradeCostIndex = currentLevel - 1; // level 1→2 = index 0, level 2→3 = index 1
  const upgradeCost = armor.upgradeCosts[upgradeCostIndex]!;

  if (state.gold < upgradeCost) {
    res.status(400).json({
      error: "INSUFFICIENT_GOLD",
      message: `Upgrading ${armor.name} to level ${currentLevel + 1} costs ${upgradeCost} gold. You have ${state.gold}.`,
    });
    return;
  }

  state.gold -= upgradeCost;
  const newLevel = (currentLevel + 1) as 1 | 2 | 3;
  const upgradedItem = makeArmorItem(armor, newLevel);

  // Remove from inventory if it was there
  if (existingIndex !== -1) {
    state.player.inventory.splice(existingIndex, 1);
  }

  // Always equip the upgraded armor
  state.player.equippedArmor = upgradedItem;

  state.logs.push(
    `[SHOP] Upgraded ${armor.name} to Level ${newLevel} for ${upgradeCost} gold. Equipped. Gold remaining: ${state.gold}.`
  );

  await saveSession(userId, state);
  res.json(serializeGameState(state));
});

export default router;
