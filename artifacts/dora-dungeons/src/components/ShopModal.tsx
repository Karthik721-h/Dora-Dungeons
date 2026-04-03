/**
 * ShopModal — Blacksmith Shop UI for Dora Dungeons
 *
 * Tabs: Weapons | Armor | Sell
 * Design tokens: gold #c89b3c, blood #8b1e1e, panel #1a1f29, bg #060810
 * Fully accessible with ARIA labels, keyboard nav, and screen-reader friendly text.
 */
import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useShop, ShopWeapon, ShopArmor, OwnedArmor, SellableItem } from "../hooks/useShop";
import type { GameStateResponse } from "@workspace/api-client-react";

interface ShopModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGameStateUpdate: (state: GameStateResponse) => void;
  onAnnounce: (message: string) => void;
  playerGold: number;
}

type Tab = "weapons" | "armor" | "sell";

const GOLD = "#c89b3c";
const BLOOD = "#8b1e1e";
const PANEL = "#1a1f29";
const BG = "#060810";
const BORDER = "#2a3145";
const GREEN = "#22c55e";
const DIM = "#8899aa";

function GoldCoin({ amount }: { amount: number }) {
  return (
    <span style={{ color: GOLD, fontWeight: 700 }}>
      🪙 {amount}
    </span>
  );
}

function WeaponRow({
  weapon,
  owned,
  playerGold,
  isMutating,
  onBuy,
}: {
  weapon: ShopWeapon;
  owned: boolean;
  playerGold: number;
  isMutating: boolean;
  onBuy: (id: string) => void;
}) {
  const canAfford = playerGold >= weapon.price;

  return (
    <li
      style={{
        background: owned ? "#1a2a1a" : PANEL,
        border: `1px solid ${owned ? "#2d5a2d" : BORDER}`,
        borderRadius: 8,
        padding: "14px 16px",
        marginBottom: 10,
        listStyle: "none",
        opacity: owned ? 0.75 : 1,
      }}
      aria-label={`${weapon.name} — ${weapon.description}. Price: ${weapon.price} gold. Attack bonus: plus ${weapon.attackBonus}.${owned ? " Already owned." : canAfford ? " Affordable." : " Too expensive."}`}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 700, color: owned ? "#6bbc6b" : "#e8d5a3", fontSize: 15, marginBottom: 3 }}>
            {weapon.name} {owned && <span style={{ color: GREEN, fontSize: 12 }}>✓ Owned</span>}
          </div>
          <div style={{ color: DIM, fontSize: 13 }}>{weapon.description}</div>
          <div style={{ marginTop: 5, display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12 }}>
            <span style={{ color: "#ff8c42" }}>⚔ +{weapon.attackBonus} ATK</span>
            {weapon.speedBonus && <span style={{ color: "#38bdf8" }}>⚡ +{weapon.speedBonus} SPD</span>}
            {weapon.mpBonus && <span style={{ color: "#a78bfa" }}>✨ +{weapon.mpBonus} MP</span>}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ marginBottom: 8 }}>
            <GoldCoin amount={weapon.price} />
          </div>
          {!owned && (
            <button
              onClick={() => onBuy(weapon.id)}
              disabled={!canAfford || isMutating}
              aria-disabled={!canAfford || isMutating}
              style={{
                background: canAfford ? BLOOD : "#333",
                color: canAfford ? "#f9f0e0" : "#667",
                border: "none",
                borderRadius: 6,
                padding: "7px 16px",
                fontWeight: 700,
                cursor: canAfford && !isMutating ? "pointer" : "not-allowed",
                fontSize: 13,
                transition: "background 0.2s",
              }}
            >
              {isMutating ? "…" : canAfford ? "Buy" : "Too Expensive"}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function ArmorRow({
  armor,
  ownedArmor,
  playerGold,
  isMutating,
  onUpgrade,
}: {
  armor: ShopArmor;
  ownedArmor?: OwnedArmor;
  playerGold: number;
  isMutating: boolean;
  onUpgrade: (id: string) => void;
}) {
  const currentLevel = ownedArmor?.level ?? 0;
  const isMaxLevel = currentLevel >= 3;

  const nextCost =
    currentLevel === 0
      ? armor.buyPrice
      : currentLevel === 1
      ? armor.upgradeCosts[0]
      : currentLevel === 2
      ? armor.upgradeCosts[1]
      : null;

  const canAfford = nextCost !== null && playerGold >= nextCost;

  const actionLabel = currentLevel === 0 ? "Buy" : isMaxLevel ? "Max" : `Upgrade → Lv${currentLevel + 1}`;
  const levelBadges = [1, 2, 3].map((lv) => (
    <span
      key={lv}
      style={{
        display: "inline-block",
        width: 20,
        height: 8,
        borderRadius: 4,
        background: lv <= currentLevel ? GOLD : "#333",
        marginRight: 3,
      }}
      aria-hidden="true"
    />
  ));

  return (
    <li
      style={{
        background: currentLevel > 0 ? "#1a1a2a" : PANEL,
        border: `1px solid ${currentLevel > 0 ? "#3a3a6a" : BORDER}`,
        borderRadius: 8,
        padding: "14px 16px",
        marginBottom: 10,
        listStyle: "none",
      }}
      aria-label={`${armor.name}. ${armor.description}. Current level: ${currentLevel}. ${
        isMaxLevel
          ? "Max level reached."
          : nextCost !== null
          ? `Next upgrade costs ${nextCost} gold.`
          : ""
      }`}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 700, color: "#b0a0d8", fontSize: 15, marginBottom: 3 }}>
            {armor.name}
          </div>
          <div style={{ color: DIM, fontSize: 13, marginBottom: 6 }}>{armor.description}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div aria-label={`Level ${currentLevel} of 3`}>{levelBadges}</div>
            <span style={{ fontSize: 12, color: currentLevel > 0 ? GOLD : DIM }}>
              Lv {currentLevel}/3
            </span>
          </div>
          <div style={{ marginTop: 5, fontSize: 12, color: DIM }}>
            Buy: <GoldCoin amount={armor.buyPrice} /> |{" "}
            Upgrades: <GoldCoin amount={armor.upgradeCosts[0]} />{" / "}<GoldCoin amount={armor.upgradeCosts[1]} />
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          {nextCost !== null && <div style={{ marginBottom: 8 }}><GoldCoin amount={nextCost} /></div>}
          <button
            onClick={() => !isMaxLevel && onUpgrade(armor.id)}
            disabled={isMaxLevel || !canAfford || isMutating}
            aria-disabled={isMaxLevel || !canAfford || isMutating}
            style={{
              background: isMaxLevel ? "#2d3d2d" : canAfford ? "#3a2d6e" : "#333",
              color: isMaxLevel ? GREEN : canAfford ? "#c5aaff" : "#667",
              border: "none",
              borderRadius: 6,
              padding: "7px 14px",
              fontWeight: 700,
              cursor: !isMaxLevel && canAfford && !isMutating ? "pointer" : "not-allowed",
              fontSize: 13,
              transition: "background 0.2s",
              minWidth: 80,
            }}
          >
            {isMutating ? "…" : actionLabel}
          </button>
        </div>
      </div>
    </li>
  );
}

function SellRow({
  item,
  isMutating,
  onSell,
}: {
  item: SellableItem;
  isMutating: boolean;
  onSell: (name: string) => void;
}) {
  return (
    <li
      style={{
        background: PANEL,
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        padding: "12px 16px",
        marginBottom: 10,
        listStyle: "none",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
      }}
      aria-label={`${item.name}. Sell for ${item.sellPrice} gold.`}
    >
      <span style={{ color: "#e8d5a3", fontWeight: 600, fontSize: 14 }}>{item.name}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <GoldCoin amount={item.sellPrice} />
        <button
          onClick={() => onSell(item.name)}
          disabled={isMutating}
          style={{
            background: "#3d2a0e",
            color: GOLD,
            border: `1px solid ${GOLD}`,
            borderRadius: 6,
            padding: "6px 14px",
            fontWeight: 700,
            cursor: isMutating ? "not-allowed" : "pointer",
            fontSize: 13,
            transition: "background 0.2s",
          }}
        >
          {isMutating ? "…" : "Sell"}
        </button>
      </div>
    </li>
  );
}

export function ShopModal({
  isOpen,
  onClose,
  onGameStateUpdate,
  onAnnounce,
  playerGold,
}: ShopModalProps) {
  const [tab, setTab] = useState<Tab>("weapons");
  const [localGold, setLocalGold] = useState(playerGold);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const {
    catalog,
    isLoadingCatalog,
    isMutating,
    error,
    fetchCatalog,
    buyWeapon,
    sellItem,
    upgradeArmor,
  } = useShop();

  // Sync gold from parent + catalog
  useEffect(() => {
    setLocalGold(catalog?.gold ?? playerGold);
  }, [catalog?.gold, playerGold]);

  // Load catalog on open
  useEffect(() => {
    if (isOpen) {
      fetchCatalog();
      setFeedbackMsg(null);
    }
  }, [isOpen, fetchCatalog]);

  function showFeedback(msg: string) {
    setFeedbackMsg(msg);
    onAnnounce(msg);
    setTimeout(() => setFeedbackMsg(null), 4000);
  }

  async function handleBuy(id: string) {
    try {
      const result = await buyWeapon(id);
      onGameStateUpdate(result);
      setLocalGold(result.gold);
      const weapon = catalog?.weapons.find((w) => w.id === id);
      showFeedback(`Purchased ${weapon?.name ?? "weapon"}! It has been equipped. Gold remaining: ${result.gold}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Purchase failed.";
      showFeedback(msg);
    }
  }

  async function handleSell(name: string) {
    try {
      const result = await sellItem(name);
      onGameStateUpdate(result);
      setLocalGold(result.gold);
      showFeedback(`Sold ${name}! Gold balance: ${result.gold}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sale failed.";
      showFeedback(msg);
    }
  }

  async function handleUpgrade(id: string) {
    try {
      const result = await upgradeArmor(id);
      onGameStateUpdate(result);
      setLocalGold(result.gold);
      const armor = catalog?.armors.find((a) => a.id === id);
      showFeedback(`${armor?.name ?? "Armor"} upgraded! Gold remaining: ${result.gold}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upgrade failed.";
      showFeedback(msg);
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "weapons", label: "⚔ Weapons" },
    { key: "armor", label: "🛡 Armor" },
    { key: "sell", label: "🪙 Sell" },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="shop-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.75)",
              zIndex: 200,
            }}
            aria-hidden="true"
          />

          {/* Modal */}
          <motion.div
            key="shop-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Blacksmith Shop"
            initial={{ opacity: 0, scale: 0.92, y: 32 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 32 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 201,
              background: BG,
              border: `2px solid ${GOLD}`,
              borderRadius: 14,
              width: "min(600px, 95vw)",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: `0 0 60px rgba(200,155,60,0.25)`,
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                background: `linear-gradient(135deg, #1a1206 0%, #2a1e08 100%)`,
                borderBottom: `1px solid ${GOLD}`,
                padding: "18px 24px 14px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: 22, color: GOLD, fontWeight: 900, letterSpacing: 1 }}>
                  ⚒ Blacksmith Shop
                </h2>
                <div style={{ fontSize: 13, color: DIM, marginTop: 3 }}>
                  Your gold: <GoldCoin amount={localGold} />
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close shop"
                style={{
                  background: "none",
                  border: "none",
                  color: DIM,
                  fontSize: 24,
                  cursor: "pointer",
                  padding: "4px 8px",
                  borderRadius: 6,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>

            {/* Tabs */}
            <div
              role="tablist"
              aria-label="Shop sections"
              style={{
                display: "flex",
                borderBottom: `1px solid ${BORDER}`,
                background: "#0d1018",
              }}
            >
              {tabs.map(({ key, label }) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  style={{
                    flex: 1,
                    padding: "12px 0",
                    background: "none",
                    border: "none",
                    borderBottom: tab === key ? `3px solid ${GOLD}` : "3px solid transparent",
                    color: tab === key ? GOLD : DIM,
                    fontWeight: tab === key ? 700 : 400,
                    fontSize: 13,
                    cursor: "pointer",
                    transition: "all 0.2s",
                    letterSpacing: 0.5,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Feedback bar */}
            <AnimatePresence>
              {feedbackMsg && (
                <motion.div
                  key="feedback"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{
                    background: "#1a2a1a",
                    borderBottom: `1px solid #2d5a2d`,
                    padding: "10px 20px",
                    fontSize: 13,
                    color: "#86efac",
                    fontWeight: 600,
                  }}
                  role="status"
                  aria-live="polite"
                >
                  {feedbackMsg}
                </motion.div>
              )}
              {error && !feedbackMsg && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{
                    background: "#2a1a1a",
                    borderBottom: `1px solid ${BLOOD}`,
                    padding: "10px 20px",
                    fontSize: 13,
                    color: "#f87171",
                  }}
                  role="alert"
                  aria-live="assertive"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Content */}
            <div
              role="tabpanel"
              aria-label={tab === "weapons" ? "Weapons for sale" : tab === "armor" ? "Armor for sale or upgrade" : "Items to sell"}
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "16px 20px",
              }}
            >
              {isLoadingCatalog ? (
                <div style={{ textAlign: "center", color: DIM, paddingTop: 40 }}>
                  Loading shop…
                </div>
              ) : !catalog ? (
                <div style={{ textAlign: "center", color: "#f87171", paddingTop: 40 }}>
                  Could not load shop. Please try again.
                </div>
              ) : (
                <>
                  {tab === "weapons" && (
                    <ul style={{ margin: 0, padding: 0 }} aria-label="Weapons catalog">
                      {catalog.weapons.length === 0 && (
                        <li style={{ color: DIM, textAlign: "center", padding: 30, listStyle: "none" }}>
                          No weapons available.
                        </li>
                      )}
                      {catalog.weapons.map((w) => (
                        <WeaponRow
                          key={w.id}
                          weapon={w}
                          owned={catalog.ownedWeaponIds.includes(w.id)}
                          playerGold={localGold}
                          isMutating={isMutating}
                          onBuy={handleBuy}
                        />
                      ))}
                    </ul>
                  )}

                  {tab === "armor" && (
                    <ul style={{ margin: 0, padding: 0 }} aria-label="Armor catalog">
                      {catalog.armors.length === 0 && (
                        <li style={{ color: DIM, textAlign: "center", padding: 30, listStyle: "none" }}>
                          No armor available.
                        </li>
                      )}
                      {catalog.armors.map((a) => (
                        <ArmorRow
                          key={a.id}
                          armor={a}
                          ownedArmor={catalog.ownedArmors.find((o) => o.id === a.id)}
                          playerGold={localGold}
                          isMutating={isMutating}
                          onUpgrade={handleUpgrade}
                        />
                      ))}
                    </ul>
                  )}

                  {tab === "sell" && (
                    <>
                      {catalog.sellableItems.length === 0 ? (
                        <div style={{ color: DIM, textAlign: "center", paddingTop: 30 }}>
                          You have no items to sell. Consumables and misc items from your inventory will appear here.
                        </div>
                      ) : (
                        <ul style={{ margin: 0, padding: 0 }} aria-label="Items you can sell">
                          {catalog.sellableItems.map((item) => (
                            <SellRow
                              key={item.name}
                              item={item}
                              isMutating={isMutating}
                              onSell={handleSell}
                            />
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </>
              )}
            </div>

            {/* Footer hint */}
            <div
              style={{
                padding: "10px 20px",
                borderTop: `1px solid ${BORDER}`,
                fontSize: 12,
                color: DIM,
                background: "#0d1018",
              }}
            >
              Say <em>"open shop"</em>, <em>"buy Iron Sword"</em>, <em>"sell health potion"</em>, or <em>"upgrade Iron Plate"</em> at any time.
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
