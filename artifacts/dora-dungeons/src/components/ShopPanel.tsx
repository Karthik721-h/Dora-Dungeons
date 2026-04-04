import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ShoppingBag, Sword, Package, Shield, ChevronLeft, Coins } from "lucide-react";
import {
  SHOP_WEAPONS,
  ARMOR_UPGRADE_COSTS,
  ShopWeapon,
  ShopArmor,
  buyWeapon,
  sellItem,
  upgradeArmor,
  ShopInventoryItem,
} from "@/shop";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ShopView = "main" | "buy" | "sell" | "upgrade";

// ── Props ─────────────────────────────────────────────────────────────────────

interface ShopPanelProps {
  gold: number;
  ownedWeapons: ShopWeapon[];
  ownedArmors: ShopArmor[];
  /** Server inventory items (real sellable items from the dungeon). */
  sellableItems: ShopInventoryItem[];
  /** Controlled view — managed by the parent so voice commands can drive navigation. */
  view: ShopView;
  onViewChange: (v: ShopView) => void;
  onUpdate: (next: { gold: number; weapons: ShopWeapon[]; armors: ShopArmor[]; items?: ShopInventoryItem[] }) => void;
  onLogMessage: (msg: string) => void;
  onClose: () => void;
}

// ── Shared button styles ──────────────────────────────────────────────────────

function ShopBtn({
  onClick,
  disabled,
  children,
  variant = "default",
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  variant?: "default" | "gold" | "danger";
}) {
  const colors = {
    default: { border: "rgba(200,155,60,0.3)", color: "rgba(200,185,150,0.8)", bg: "rgba(200,155,60,0.05)", hover: "rgba(200,155,60,0.12)" },
    gold:    { border: "rgba(200,155,60,0.6)", color: "#c89b3c",              bg: "rgba(200,155,60,0.1)",  hover: "rgba(200,155,60,0.2)"  },
    danger:  { border: "rgba(139,30,30,0.5)",  color: "rgba(248,113,113,0.8)", bg: "rgba(139,30,30,0.08)", hover: "rgba(139,30,30,0.15)"  },
  }[variant];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%",
        padding: "0.6rem 1rem",
        border: `1px solid ${colors.border}`,
        borderRadius: 4,
        background: colors.bg,
        color: disabled ? "rgba(200,185,150,0.3)" : colors.color,
        fontFamily: "'Cinzel', serif",
        fontSize: "0.72rem",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        textAlign: "left",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        transition: "background 0.15s, border-color 0.15s",
      }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = colors.hover; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = colors.bg; }}
    >
      {children}
    </button>
  );
}

// ── Feedback message ──────────────────────────────────────────────────────────

function FeedbackMessage({ msg }: { msg: string | null }) {
  if (!msg) return null;
  const isError = msg.startsWith("✗");
  return (
    <motion.div
      key={msg}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        padding: "0.45rem 0.8rem",
        borderRadius: 4,
        border: isError ? "1px solid rgba(139,30,30,0.4)" : "1px solid rgba(58,134,255,0.3)",
        background: isError ? "rgba(139,30,30,0.08)" : "rgba(58,134,255,0.06)",
        color: isError ? "rgba(248,113,113,0.85)" : "rgba(58,134,255,0.85)",
        fontFamily: "'Fira Code', monospace",
        fontSize: "0.7rem",
        letterSpacing: "0.06em",
        marginTop: "0.5rem",
      }}
    >
      {msg}
    </motion.div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, onBack }: { icon: React.ReactNode; title: string; onBack: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.75rem" }}>
      <button
        onClick={onBack}
        style={{ color: "rgba(200,155,60,0.5)", background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}
        aria-label="Back to shop menu"
      >
        <ChevronLeft size={14} />
      </button>
      <span style={{ color: "rgba(200,155,60,0.5)", display: "flex", alignItems: "center" }}>{icon}</span>
      <span style={{ fontFamily: "'Cinzel', serif", fontSize: "0.72rem", letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(200,155,60,0.7)" }}>
        {title}
      </span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ShopPanel({
  gold,
  ownedWeapons,
  ownedArmors,
  sellableItems,
  view,
  onViewChange,
  onUpdate,
  onLogMessage,
  onClose,
}: ShopPanelProps) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [localGold, setLocalGold] = useState(gold);
  const [localWeapons, setLocalWeapons] = useState<ShopWeapon[]>(ownedWeapons);
  const [localArmors, setLocalArmors] = useState<ShopArmor[]>(ownedArmors);
  const [localItems, setLocalItems] = useState<ShopInventoryItem[]>(sellableItems);

  function flash(msg: string) {
    setFeedback(msg);
    onLogMessage(msg);
    setTimeout(() => setFeedback(null), 3200);
  }

  function handleBuy(weaponId: string) {
    const result = buyWeapon(localGold, localWeapons, weaponId);
    if (result.success) {
      setLocalGold(result.data.gold);
      setLocalWeapons(result.data.weapons);
      onUpdate({ gold: result.data.gold, weapons: result.data.weapons, armors: localArmors });
      flash("✓ Weapon purchased successfully.");
    } else {
      flash(result.message === "NOT_ENOUGH_GOLD"
        ? "✗ You do not have enough gold."
        : "✗ That weapon could not be found.");
    }
  }

  function handleSell(itemId: string) {
    const result = sellItem(localGold, localItems, itemId);
    if (result.success) {
      setLocalGold(result.data.gold);
      setLocalItems(result.data.inventory);
      onUpdate({ gold: result.data.gold, weapons: localWeapons, armors: localArmors, items: result.data.inventory });
      flash("✓ Item sold successfully.");
    } else {
      flash("✗ That item could not be found.");
    }
  }

  function handleUpgrade(armorId: string) {
    const result = upgradeArmor(localGold, localArmors, armorId);
    if (result.success) {
      setLocalGold(result.data.gold);
      setLocalArmors(result.data.armors);
      onUpdate({ gold: result.data.gold, weapons: localWeapons, armors: result.data.armors });
      flash("✓ Armor upgraded successfully.");
    } else {
      const msg =
        result.message === "ARMOR_MAX_LEVEL" ? "✗ This armor is already at maximum level."
        : result.message === "NOT_ENOUGH_GOLD" ? "✗ You do not have enough gold."
        : "✗ Upgrade failed.";
      flash(msg);
    }
  }

  // ── Weapon list (with purchased indicator) ──────────────────────────────────

  const ownedIds = new Set(localWeapons.map((w) => w.id));

  const renderBuyView = () => (
    <>
      <SectionHeader icon={<Sword size={12} />} title="Buy Weapons" onBack={() => { onViewChange("main"); setFeedback(null); }} />
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", overflowY: "auto", maxHeight: "clamp(160px, 28vh, 340px)" }}>
        {SHOP_WEAPONS.map((w) => {
          const owned = ownedIds.has(w.id);
          const canAfford = localGold >= w.price;
          return (
            <ShopBtn
              key={w.id}
              onClick={() => handleBuy(w.id)}
              disabled={owned || !canAfford}
              variant={owned ? "danger" : canAfford ? "gold" : "default"}
            >
              <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>{w.name}</span>
                <span style={{ fontSize: "0.68rem", opacity: 0.7, fontFamily: "'Fira Code', monospace" }}>
                  {owned ? "owned" : `${w.price}g`}
                </span>
              </span>
              <span style={{ display: "block", fontFamily: "'Crimson Text', serif", fontStyle: "italic", fontSize: "0.75rem", marginTop: "0.1rem", opacity: 0.55, textTransform: "none", letterSpacing: "0.01em" }}>
                {w.description}
              </span>
            </ShopBtn>
          );
        })}
      </div>
    </>
  );

  const renderSellView = () => (
    <>
      <SectionHeader icon={<Package size={12} />} title="Sell Items" onBack={() => { onViewChange("main"); setFeedback(null); }} />
      {localItems.length === 0 ? (
        <p style={{ fontFamily: "'Crimson Text', serif", fontStyle: "italic", color: "rgba(200,185,150,0.4)", fontSize: "0.85rem", padding: "0.5rem 0" }}>
          Your inventory is empty.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", overflowY: "auto", maxHeight: "clamp(160px, 28vh, 340px)" }}>
          {localItems.map((item) => (
            <ShopBtn key={item.id} onClick={() => handleSell(item.id)} variant="gold">
              <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>{item.name}</span>
                <span style={{ fontFamily: "'Fira Code', monospace", fontSize: "0.68rem", opacity: 0.7 }}>+{item.value}g</span>
              </span>
            </ShopBtn>
          ))}
        </div>
      )}
    </>
  );

  const renderUpgradeView = () => (
    <>
      <SectionHeader icon={<Shield size={12} />} title="Upgrade Armor" onBack={() => { onViewChange("main"); setFeedback(null); }} />
      {localArmors.length === 0 ? (
        <p style={{ fontFamily: "'Crimson Text', serif", fontStyle: "italic", color: "rgba(200,185,150,0.4)", fontSize: "0.85rem", padding: "0.5rem 0" }}>
          No armor available to upgrade.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", overflowY: "auto", maxHeight: "clamp(160px, 28vh, 340px)" }}>
          {localArmors.map((armor) => {
            const cost = armor.level < 3 ? ARMOR_UPGRADE_COSTS[armor.level as 1 | 2] : null;
            const isMax = armor.level === 3;
            const canAfford = cost !== null && localGold >= cost;
            return (
              <ShopBtn
                key={armor.id}
                onClick={() => handleUpgrade(armor.id)}
                disabled={isMax || !canAfford}
                variant={isMax ? "danger" : canAfford ? "gold" : "default"}
              >
                <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>{armor.name}</span>
                  <span style={{ fontFamily: "'Fira Code', monospace", fontSize: "0.68rem", opacity: 0.7 }}>
                    Lv {armor.level} {isMax ? "(max)" : `→ ${armor.level + 1} · ${cost}g`}
                  </span>
                </span>
              </ShopBtn>
            );
          })}
        </div>
      )}
    </>
  );

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: 6 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        background: "rgba(6,8,16,0.96)",
        backdropFilter: "blur(8px)",
        border: "1px solid rgba(200,155,60,0.22)",
        borderRadius: "6px",
        overflow: "hidden",
      }}
    >
      {/* ── Header ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.6rem 0.9rem",
        borderBottom: "1px solid rgba(200,155,60,0.15)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <ShoppingBag size={13} style={{ color: "rgba(200,155,60,0.6)" }} />
          <span style={{
            fontFamily: "'Cinzel', serif",
            fontSize: "0.72rem",
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            color: "rgba(200,155,60,0.7)",
          }}>
            Merchant's Shop
          </span>
        </div>

        {/* Gold display */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginLeft: "auto", marginRight: "0.75rem" }}>
          <Coins size={11} style={{ color: "#c89b3c" }} />
          <span style={{
            fontFamily: "'Fira Code', monospace",
            fontSize: "0.75rem",
            color: "#c89b3c",
            letterSpacing: "0.06em",
          }}>
            {localGold}g
          </span>
        </div>

        <button
          onClick={onClose}
          style={{ color: "rgba(200,190,180,0.3)", background: "none", border: "none", cursor: "pointer", display: "flex", padding: 2, borderRadius: 3, transition: "color 0.15s" }}
          onMouseEnter={e => (e.currentTarget.style.color = "rgba(248,113,113,0.7)")}
          onMouseLeave={e => (e.currentTarget.style.color = "rgba(200,190,180,0.3)")}
          aria-label="Close shop"
        >
          <X size={14} />
        </button>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0.75rem 0.9rem" }}>
        <AnimatePresence mode="wait">
          {view === "main" && (
            <motion.div
              key="main"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.14 }}
            >
              <p style={{
                fontFamily: "'Crimson Text', serif",
                fontStyle: "italic",
                fontSize: "0.85rem",
                color: "rgba(200,185,150,0.45)",
                marginBottom: "0.75rem",
              }}>
                What seeks the wanderer?
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                <ShopBtn onClick={() => { onViewChange("buy"); setFeedback(null); }} variant="gold">
                  <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Sword size={11} /> Buy Weapons
                  </span>
                </ShopBtn>
                <ShopBtn onClick={() => { onViewChange("sell"); setFeedback(null); }} variant="default">
                  <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Package size={11} /> Sell Items
                  </span>
                </ShopBtn>
                <ShopBtn onClick={() => { onViewChange("upgrade"); setFeedback(null); }} variant="default">
                  <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Shield size={11} /> Upgrade Armor
                  </span>
                </ShopBtn>
              </div>
            </motion.div>
          )}

          {view === "buy" && (
            <motion.div key="buy" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.14 }}>
              {renderBuyView()}
            </motion.div>
          )}

          {view === "sell" && (
            <motion.div key="sell" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.14 }}>
              {renderSellView()}
            </motion.div>
          )}

          {view === "upgrade" && (
            <motion.div key="upgrade" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.14 }}>
              {renderUpgradeView()}
            </motion.div>
          )}
        </AnimatePresence>

        <FeedbackMessage msg={feedback} />
      </div>
    </motion.div>
  );
}
