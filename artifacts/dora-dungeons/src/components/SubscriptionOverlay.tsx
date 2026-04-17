import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { IAP_IDS } from "@/config/iap";
import { AudioManager } from "@/audio/AudioManager";

interface Tier {
  id: "weekly" | "monthly" | "yearly" | "lifetime";
  title: string;
  price: string;
  period: string;
  subtext: string;
  badge?: string;
  ctaLabel: string;
  ctaSub: string;
}

const TIERS: Tier[] = [
  {
    id:       "weekly",
    title:    "Weekly",
    price:    "$1.99",
    period:   "/ week",
    subtext:  "7-Day Free Trial",
    ctaLabel: "START FREE TRIAL",
    ctaSub:   "Then $1.99/week · Auto-renews · Cancel anytime",
  },
  {
    id:       "monthly",
    title:    "Monthly",
    price:    "$4.99",
    period:   "/ month",
    subtext:  "7-Day Free Trial",
    ctaLabel: "START FREE TRIAL",
    ctaSub:   "Then $4.99/mo · Auto-renews · Cancel anytime",
  },
  {
    id:       "yearly",
    title:    "Yearly",
    price:    "$19.99",
    period:   "/ year",
    subtext:  "7-Day Free Trial",
    ctaLabel: "START FREE TRIAL",
    ctaSub:   "Then $19.99/year · Auto-renews · Cancel anytime",
  },
  {
    id:       "lifetime",
    title:    "Lifetime",
    price:    "$49.99",
    period:   "",
    subtext:  "Pay once, play forever",
    badge:    "MOST POPULAR",
    ctaLabel: "UNLOCK FOREVER",
    ctaSub:   "One-time secure payment · No recurring charges",
  },
];

const FEATURES = [
  { icon: "⚡", label: "Zero Voice Latency" },
  { icon: "♾️", label: "Unlimited Dungeon Commands" },
  { icon: "🛡️", label: "Unrestricted Archive Access" },
];

interface SubscriptionOverlayProps {
  onClose?: () => void;
  /** Fired after a successful purchase with the tier id (e.g. "lifetime"). */
  onPurchase?: (tier: string) => void;
  /** Triggered when the user taps "Restore Purchases". Provided by useIAP. */
  onRestorePurchases?: () => void;
}

export function SubscriptionOverlay({ onClose, onPurchase, onRestorePurchases }: SubscriptionOverlayProps) {
  const [selectedId, setSelectedId] = useState<Tier["id"]>("lifetime");
  const [, navigate] = useLocation();

  const selected = TIERS.find(t => t.id === selectedId)!;

  function completePurchase(tierId: string) {
    // Persist premium status so it survives page refreshes.
    try {
      localStorage.setItem("dora_isPremium", "true");
      localStorage.setItem("dora_premiumTier", tierId);
    } catch { /* localStorage unavailable */ }
    onPurchase?.(tierId);
    onClose?.();
  }

  function handlePurchase() {
    // @ts-ignore — CdvPurchase is injected by Capacitor In-App Purchases plugin
    if (typeof CdvPurchase !== "undefined") {
      // Use the full Apple product ID, not the short tier key.
      // @ts-ignore
      CdvPurchase.store.order(IAP_IDS[selectedId]);
      // Unlock happens in the useIAP `approved` listener → onPurchase callback.
    } else {
      // Web / dev mock path.
      console.log("Mock Purchase triggered for", selectedId, IAP_IDS[selectedId]);
      alert(`Premium Unlocked: ${selected.title} (Web Simulation)`);
      completePurchase(selectedId);
    }
  }

  function handleRestore() {
    if (onRestorePurchases) {
      // useIAP handles TTS + native store.restorePurchases().
      onRestorePurchases();
    } else {
      // Fallback for web / dev: speak feedback directly.
      AudioManager.speak("Checking for previous purchases.", { interrupt: true });
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        key="sub-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9000,
          background: "rgba(6, 8, 16, 0.92)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          overflowY: "auto",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 32, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          style={{
            width: "100%",
            maxWidth: "520px",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          {/* ── Header ── */}
          <div style={{ textAlign: "center" }}>
            <p
              style={{
                fontFamily: "'Fira Code', monospace",
                fontSize: "0.65rem",
                letterSpacing: "0.3em",
                textTransform: "uppercase",
                color: "rgba(200,155,60,0.6)",
                marginBottom: "0.5rem",
              }}
            >
              ⚔ Trial Ended
            </p>
            <h2
              style={{
                fontFamily: "'Cinzel', serif",
                fontSize: "clamp(1.3rem, 4vw, 1.75rem)",
                fontWeight: 900,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                background: "linear-gradient(135deg, #a87830 0%, #f0d060 45%, #e8b840 75%, #a87830 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                filter: "drop-shadow(0 0 18px rgba(200,155,60,0.45))",
                margin: 0,
              }}
            >
              Unlock Dora Dungeons
            </h2>
            <p
              style={{
                fontFamily: "'Crimson Text', Georgia, serif",
                fontSize: "1rem",
                color: "rgba(200,190,180,0.55)",
                marginTop: "0.4rem",
                letterSpacing: "0.04em",
              }}
            >
              Continue your adventure — no limits.
            </p>
          </div>

          {/* ── Feature list ── */}
          <div
            style={{
              background: "rgba(200,155,60,0.05)",
              border: "1px solid rgba(200,155,60,0.15)",
              borderRadius: "0.75rem",
              padding: "0.875rem 1.25rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
            }}
          >
            {FEATURES.map(f => (
              <div
                key={f.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  fontFamily: "'Crimson Text', Georgia, serif",
                  fontSize: "1rem",
                  color: "rgba(200,190,180,0.8)",
                  letterSpacing: "0.03em",
                }}
              >
                <span style={{ fontSize: "1.1rem" }}>{f.icon}</span>
                {f.label}
              </div>
            ))}
          </div>

          {/* ── Tier grid — 2×2 on small, 4-col on wide ── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "0.625rem",
            }}
          >
            {TIERS.map(tier => {
              const active = tier.id === selectedId;
              return (
                <button
                  key={tier.id}
                  type="button"
                  onClick={() => setSelectedId(tier.id)}
                  style={{
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.2rem",
                    padding: "0.875rem 0.5rem",
                    borderRadius: "0.75rem",
                    border: active
                      ? "2px solid rgba(200,155,60,0.85)"
                      : "1px solid rgba(200,155,60,0.2)",
                    background: active
                      ? "rgba(200,155,60,0.12)"
                      : "rgba(16,20,30,0.7)",
                    cursor: "pointer",
                    transition: "border 0.18s, background 0.18s, box-shadow 0.18s",
                    boxShadow: active
                      ? "0 0 18px rgba(200,155,60,0.22), inset 0 0 24px rgba(200,155,60,0.06)"
                      : "none",
                    minHeight: "44px",
                  }}
                >
                  {/* MOST POPULAR badge */}
                  {tier.badge && (
                    <span
                      style={{
                        position: "absolute",
                        top: "-0.6rem",
                        left: "50%",
                        transform: "translateX(-50%)",
                        fontFamily: "'Fira Code', monospace",
                        fontSize: "0.52rem",
                        letterSpacing: "0.18em",
                        textTransform: "uppercase",
                        color: "#0b0f14",
                        background: "linear-gradient(90deg, #a87830, #f0d060, #a87830)",
                        padding: "2px 8px",
                        borderRadius: "999px",
                        whiteSpace: "nowrap",
                        fontWeight: 700,
                      }}
                    >
                      {tier.badge}
                    </span>
                  )}

                  <span
                    style={{
                      fontFamily: "'Cinzel', serif",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: active ? "#f0d060" : "rgba(200,190,180,0.6)",
                    }}
                  >
                    {tier.title}
                  </span>

                  <span
                    style={{
                      fontFamily: "'Cinzel', serif",
                      fontSize: "1.2rem",
                      fontWeight: 900,
                      color: active ? "#f0d060" : "rgba(200,190,180,0.85)",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {tier.price}
                  </span>

                  {tier.period && (
                    <span
                      style={{
                        fontFamily: "'Fira Code', monospace",
                        fontSize: "0.55rem",
                        color: active ? "rgba(200,155,60,0.7)" : "rgba(200,190,180,0.35)",
                        letterSpacing: "0.08em",
                      }}
                    >
                      {tier.period}
                    </span>
                  )}

                  <span
                    style={{
                      fontFamily: "'Fira Code', monospace",
                      fontSize: "0.52rem",
                      letterSpacing: "0.1em",
                      color: active ? "rgba(200,155,60,0.75)" : "rgba(200,190,180,0.3)",
                      marginTop: "0.15rem",
                    }}
                  >
                    {tier.subtext}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ── CTA button ── */}
          <button
            type="button"
            onClick={handlePurchase}
            style={{
              width: "100%",
              padding: "1rem 1.5rem",
              borderRadius: "0.875rem",
              border: "1px solid rgba(200,155,60,0.5)",
              background: "linear-gradient(135deg, #8b6014 0%, #c89b3c 50%, #8b6014 100%)",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.2rem",
              boxShadow: "0 0 32px rgba(200,155,60,0.3), 0 4px 24px rgba(0,0,0,0.4)",
              transition: "filter 0.2s, box-shadow 0.2s",
              minHeight: "44px",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.15)";
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 44px rgba(200,155,60,0.5), 0 4px 24px rgba(0,0,0,0.5)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.filter = "brightness(1)";
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 32px rgba(200,155,60,0.3), 0 4px 24px rgba(0,0,0,0.4)";
            }}
          >
            <span
              style={{
                fontFamily: "'Cinzel', serif",
                fontSize: "clamp(0.85rem, 3vw, 1.05rem)",
                fontWeight: 900,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "#0b0f14",
              }}
            >
              {selected.ctaLabel}
            </span>
            <span
              style={{
                fontFamily: "'Fira Code', monospace",
                fontSize: "0.6rem",
                letterSpacing: "0.08em",
                color: "rgba(0,0,0,0.55)",
              }}
            >
              {selected.ctaSub}
            </span>
          </button>

          {/* ── Compliance footer ── */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              alignItems: "center",
              gap: "0.5rem 1rem",
              paddingTop: "0.25rem",
            }}
          >
            {[
              { label: "Restore Purchases", action: handleRestore },
              { label: "Terms of Service", action: () => window.open("https://doradungeons.com/terms", "_blank") },
              { label: "Privacy Policy", action: () => navigate("/privacy") },
            ].map(link => (
              <button
                key={link.label}
                type="button"
                onClick={link.action}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "'Fira Code', monospace",
                  fontSize: "0.6rem",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "rgba(200,190,180,0.25)",
                  textDecoration: "underline",
                  textUnderlineOffset: "3px",
                  transition: "color 0.2s",
                  minHeight: "44px",
                }}
                onMouseEnter={e => (e.currentTarget.style.color = "rgba(200,190,180,0.55)")}
                onMouseLeave={e => (e.currentTarget.style.color = "rgba(200,190,180,0.25)")}
              >
                {link.label}
              </button>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
