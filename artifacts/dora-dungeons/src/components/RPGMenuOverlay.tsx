import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Swords, Shield, Sparkles, Star } from "lucide-react";
import { useRPGProgression, Weapon, Armor } from "@/context/RPGProgressionContext";

// ─── Tab config ──────────────────────────────────────────────────────────────

type Tab = "weapons" | "armor" | "abilities";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "weapons",   label: "Weapons",   icon: <Swords size={12} /> },
  { id: "armor",     label: "Armor",     icon: <Shield size={12} /> },
  { id: "abilities", label: "Abilities", icon: <Sparkles size={12} /> },
];

// ─── Shared style tokens ─────────────────────────────────────────────────────

const GOLD      = "rgba(200,155,60,1)";
const GOLD_DIM  = "rgba(200,155,60,0.55)";
const GOLD_FAINT= "rgba(200,155,60,0.18)";
const MUTED     = "rgba(200,190,180,0.45)";
const MUTED_DIM = "rgba(200,190,180,0.25)";

// ─── Sub-components ──────────────────────────────────────────────────────────

function WeaponCard({ weapon, equipped, onEquip }: { weapon: Weapon; equipped: boolean; onEquip: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      style={{
        position: "relative",
        padding: "0.75rem 0.875rem",
        borderRadius: "0.625rem",
        border: equipped
          ? "1.5px solid rgba(200,155,60,0.8)"
          : "1px solid rgba(200,155,60,0.18)",
        background: equipped
          ? "rgba(200,155,60,0.09)"
          : "rgba(12,16,24,0.65)",
        boxShadow: equipped
          ? "0 0 16px rgba(200,155,60,0.18), inset 0 0 20px rgba(200,155,60,0.05)"
          : "none",
        transition: "border 0.18s, box-shadow 0.18s",
      }}
    >
      {/* Equipped badge */}
      {equipped && (
        <span
          style={{
            position: "absolute",
            top: "-0.55rem",
            right: "0.75rem",
            fontFamily: "'Fira Code', monospace",
            fontSize: "0.5rem",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "#0b0f14",
            background: "linear-gradient(90deg, #a87830, #f0d060, #a87830)",
            padding: "2px 8px",
            borderRadius: "999px",
            fontWeight: 700,
          }}
        >
          Equipped
        </span>
      )}

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem" }}>
        {/* Info */}
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              fontFamily: "'Cinzel', serif",
              fontSize: "0.82rem",
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: equipped ? "#f0d060" : "rgba(220,210,200,0.9)",
              marginBottom: "0.3rem",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {weapon.name}
          </p>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <span
              style={{
                fontFamily: "'Fira Code', monospace",
                fontSize: "0.65rem",
                letterSpacing: "0.1em",
                color: "rgba(248,113,113,0.75)",
              }}
            >
              DMG {weapon.damage}
            </span>
            {weapon.specialAbility && weapon.specialAbility !== "None" && (
              <span
                style={{
                  fontFamily: "'Fira Code', monospace",
                  fontSize: "0.6rem",
                  letterSpacing: "0.08em",
                  color: "rgba(167,139,250,0.7)",
                }}
              >
                ✦ {weapon.specialAbility}
              </span>
            )}
          </div>
        </div>

        {/* Equip / Equipped button */}
        {equipped ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "4px 10px",
              borderRadius: "4px",
              border: "1px solid rgba(200,155,60,0.4)",
              background: "rgba(200,155,60,0.12)",
              fontFamily: "'Fira Code', monospace",
              fontSize: "0.6rem",
              letterSpacing: "0.14em",
              color: GOLD,
              flexShrink: 0,
            }}
          >
            <Star size={9} fill="currentColor" /> Active
          </div>
        ) : (
          <button
            onClick={onEquip}
            style={{
              padding: "4px 12px",
              borderRadius: "4px",
              border: "1px solid rgba(200,155,60,0.3)",
              background: "rgba(200,155,60,0.06)",
              fontFamily: "'Fira Code', monospace",
              fontSize: "0.6rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: GOLD_DIM,
              cursor: "pointer",
              flexShrink: 0,
              minHeight: "30px",
              transition: "border 0.15s, background 0.15s, color 0.15s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.border = "1px solid rgba(200,155,60,0.7)";
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(200,155,60,0.14)";
              (e.currentTarget as HTMLButtonElement).style.color = GOLD;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.border = "1px solid rgba(200,155,60,0.3)";
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(200,155,60,0.06)";
              (e.currentTarget as HTMLButtonElement).style.color = GOLD_DIM;
            }}
            aria-label={`Equip ${weapon.name}`}
          >
            Equip
          </button>
        )}
      </div>
    </motion.div>
  );
}

function ArmorCard({ armor, equipped, onEquip }: { armor: Armor; equipped: boolean; onEquip: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      style={{
        position: "relative",
        padding: "0.75rem 0.875rem",
        borderRadius: "0.625rem",
        border: equipped
          ? "1.5px solid rgba(58,134,255,0.65)"
          : "1px solid rgba(58,134,255,0.15)",
        background: equipped
          ? "rgba(58,134,255,0.08)"
          : "rgba(12,16,24,0.65)",
        boxShadow: equipped
          ? "0 0 14px rgba(58,134,255,0.15), inset 0 0 18px rgba(58,134,255,0.04)"
          : "none",
        transition: "border 0.18s, box-shadow 0.18s",
      }}
    >
      {equipped && (
        <span
          style={{
            position: "absolute",
            top: "-0.55rem",
            right: "0.75rem",
            fontFamily: "'Fira Code', monospace",
            fontSize: "0.5rem",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "#fff",
            background: "linear-gradient(90deg, #1e3a8a, #3b82f6, #1e3a8a)",
            padding: "2px 8px",
            borderRadius: "999px",
            fontWeight: 700,
          }}
        >
          Equipped
        </span>
      )}

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem" }}>
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              fontFamily: "'Cinzel', serif",
              fontSize: "0.82rem",
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: equipped ? "#93c5fd" : "rgba(220,210,200,0.9)",
              marginBottom: "0.3rem",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {armor.name}
          </p>
          <span
            style={{
              fontFamily: "'Fira Code', monospace",
              fontSize: "0.65rem",
              letterSpacing: "0.1em",
              color: "rgba(96,165,250,0.75)",
            }}
          >
            DEF {armor.defense}
          </span>
        </div>

        {equipped ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "4px 10px",
              borderRadius: "4px",
              border: "1px solid rgba(58,134,255,0.35)",
              background: "rgba(58,134,255,0.12)",
              fontFamily: "'Fira Code', monospace",
              fontSize: "0.6rem",
              letterSpacing: "0.14em",
              color: "#60a5fa",
              flexShrink: 0,
            }}
          >
            <Star size={9} fill="currentColor" /> Active
          </div>
        ) : (
          <button
            onClick={onEquip}
            style={{
              padding: "4px 12px",
              borderRadius: "4px",
              border: "1px solid rgba(58,134,255,0.25)",
              background: "rgba(58,134,255,0.06)",
              fontFamily: "'Fira Code', monospace",
              fontSize: "0.6rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "rgba(96,165,250,0.6)",
              cursor: "pointer",
              flexShrink: 0,
              minHeight: "30px",
              transition: "border 0.15s, background 0.15s, color 0.15s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.border = "1px solid rgba(58,134,255,0.6)";
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(58,134,255,0.14)";
              (e.currentTarget as HTMLButtonElement).style.color = "#60a5fa";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.border = "1px solid rgba(58,134,255,0.25)";
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(58,134,255,0.06)";
              (e.currentTarget as HTMLButtonElement).style.color = "rgba(96,165,250,0.6)";
            }}
            aria-label={`Equip ${armor.name}`}
          >
            Equip
          </button>
        )}
      </div>
    </motion.div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: "2rem 1rem",
        textAlign: "center",
        fontFamily: "'Fira Code', monospace",
        fontSize: "0.65rem",
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        color: MUTED_DIM,
      }}
    >
      {message}
    </div>
  );
}

// ─── Main overlay ─────────────────────────────────────────────────────────────

interface RPGMenuOverlayProps {
  onClose: () => void;
}

export function RPGMenuOverlay({ onClose }: RPGMenuOverlayProps) {
  const { state, equipItem } = useRPGProgression();
  const [activeTab, setActiveTab] = useState<Tab>("weapons");

  const { playerXP, unlockedWeapons, equippedWeapon, unlockedArmor, equippedArmor, unlockedAbilities } = state;

  return (
    <>
      <motion.div
        key="rpg-overlay-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 8900,
          background: "rgba(6, 8, 16, 0.88)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
        }}
        aria-modal="true"
        role="dialog"
        aria-label="Character inventory"
      >
        {/* Panel — stop clicks propagating to backdrop */}
        <motion.div
          key="rpg-overlay-panel"
          initial={{ opacity: 0, y: 28, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          onClick={e => e.stopPropagation()}
          style={{
            width: "100%",
            maxWidth: "480px",
            maxHeight: "calc(100vh - 2rem)",
            display: "flex",
            flexDirection: "column",
            gap: 0,
            background: "rgba(10, 13, 20, 0.97)",
            border: "1px solid rgba(200,155,60,0.2)",
            borderRadius: "1rem",
            boxShadow: "0 0 60px rgba(0,0,0,0.7), 0 0 30px rgba(200,155,60,0.08)",
            overflow: "hidden",
          }}
        >
          {/* ── Header ── */}
          <div
            style={{
              padding: "1rem 1.25rem 0.875rem",
              borderBottom: "1px solid rgba(200,155,60,0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              flexShrink: 0,
            }}
          >
            <div>
              <p
                style={{
                  fontFamily: "'Fira Code', monospace",
                  fontSize: "0.6rem",
                  letterSpacing: "0.28em",
                  textTransform: "uppercase",
                  color: GOLD_FAINT,
                  marginBottom: "0.25rem",
                }}
              >
                ⚔ Character
              </p>
              <h2
                style={{
                  fontFamily: "'Cinzel', serif",
                  fontSize: "1.15rem",
                  fontWeight: 900,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  background: "linear-gradient(135deg, #a87830 0%, #f0d060 50%, #a87830 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  margin: 0,
                }}
              >
                Inventory
              </h2>
            </div>

            {/* XP badge */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "0.4rem 0.875rem",
                borderRadius: "0.625rem",
                border: "1px solid rgba(200,155,60,0.3)",
                background: "rgba(200,155,60,0.07)",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontFamily: "'Fira Code', monospace",
                  fontSize: "0.55rem",
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: GOLD_DIM,
                }}
              >
                Total XP
              </span>
              <span
                style={{
                  fontFamily: "'Cinzel', serif",
                  fontSize: "1.3rem",
                  fontWeight: 900,
                  color: "#f0d060",
                  lineHeight: 1.1,
                  textShadow: "0 0 14px rgba(200,155,60,0.5)",
                }}
              >
                {playerXP.toLocaleString()}
              </span>
            </div>

            {/* Close button */}
            <button
              onClick={onClose}
              style={{
                padding: "0.4rem",
                borderRadius: "0.375rem",
                border: "1px solid rgba(200,190,180,0.1)",
                background: "transparent",
                color: MUTED_DIM,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transition: "color 0.15s, border-color 0.15s",
                minHeight: "32px",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.color = "rgba(248,113,113,0.85)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(248,113,113,0.3)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.color = MUTED_DIM;
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(200,190,180,0.1)";
              }}
              aria-label="Close inventory"
            >
              <X size={14} />
            </button>
          </div>

          {/* ── Tab bar ── */}
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid rgba(200,155,60,0.1)",
              flexShrink: 0,
            }}
          >
            {TABS.map(tab => {
              const active = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    flex: 1,
                    padding: "0.625rem 0.5rem",
                    border: "none",
                    borderBottom: active
                      ? "2px solid rgba(200,155,60,0.8)"
                      : "2px solid transparent",
                    background: active ? "rgba(200,155,60,0.06)" : "transparent",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.375rem",
                    fontFamily: "'Fira Code', monospace",
                    fontSize: "0.62rem",
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: active ? GOLD : MUTED,
                    transition: "color 0.15s, border-bottom-color 0.15s, background 0.15s",
                    minHeight: "40px",
                  }}
                  aria-label={`${tab.label} tab`}
                  aria-selected={active}
                >
                  {tab.icon}
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* ── Scrollable content ── */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "0.875rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.625rem",
            }}
          >
            <AnimatePresence mode="wait">
              {activeTab === "weapons" && (
                <motion.div
                  key="weapons-tab"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}
                >
                  {unlockedWeapons.length === 0
                    ? <EmptyState message="No weapons unlocked" />
                    : unlockedWeapons.map(w => (
                        <WeaponCard
                          key={w.id}
                          weapon={w}
                          equipped={equippedWeapon.id === w.id}
                          onEquip={() => equipItem("weapon", w.id)}
                        />
                      ))
                  }
                </motion.div>
              )}

              {activeTab === "armor" && (
                <motion.div
                  key="armor-tab"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}
                >
                  {unlockedArmor.length === 0
                    ? <EmptyState message="No armor unlocked" />
                    : unlockedArmor.map(a => (
                        <ArmorCard
                          key={a.id}
                          armor={a}
                          equipped={equippedArmor.id === a.id}
                          onEquip={() => equipItem("armor", a.id)}
                        />
                      ))
                  }
                </motion.div>
              )}

              {activeTab === "abilities" && (
                <motion.div
                  key="abilities-tab"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
                >
                  {unlockedAbilities.length === 0 ? (
                    <EmptyState message="No abilities — they're consumed when used" />
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem", padding: "0.25rem 0" }}>
                      {unlockedAbilities.map((ability, idx) => {
                        const isDestroy = ability.startsWith(".destroy");
                        return (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, scale: 0.97 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.18, delay: idx * 0.05 }}
                            style={{
                              padding: "0.625rem 0.875rem",
                              borderRadius: "0.625rem",
                              border: isDestroy
                                ? "1px solid rgba(239,68,68,0.4)"
                                : "1px solid rgba(167,139,250,0.3)",
                              background: isDestroy
                                ? "rgba(239,68,68,0.07)"
                                : "rgba(167,139,250,0.07)",
                              display: "flex",
                              flexDirection: "column",
                              gap: "0.3rem",
                            }}
                          >
                            <span
                              style={{
                                fontFamily: "'Fira Code', monospace",
                                fontSize: "0.68rem",
                                letterSpacing: "0.1em",
                                color: isDestroy
                                  ? "rgba(248,113,113,0.9)"
                                  : "rgba(167,139,250,0.9)",
                                fontWeight: 700,
                              }}
                            >
                              ✦ {ability}
                            </span>
                            {isDestroy && (
                              <span
                                style={{
                                  fontFamily: "'Fira Code', monospace",
                                  fontSize: "0.58rem",
                                  letterSpacing: "0.06em",
                                  color: "rgba(248,113,113,0.55)",
                                  lineHeight: 1.5,
                                }}
                              >
                                Say <em>"use destroy"</em> or <em>"obliterate"</em> in combat to unleash. Two charges per level — each use depletes one charge.
                              </span>
                            )}
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </>
  );
}
