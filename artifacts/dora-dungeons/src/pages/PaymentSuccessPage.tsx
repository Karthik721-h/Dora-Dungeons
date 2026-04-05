import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { AudioManager } from "@/audio/AudioManager";
import { customFetch } from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/\//g, "/");

export function PaymentSuccessPage() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<"pending" | "success" | "error">("pending");
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id") ?? undefined;

    (async () => {
      try {
        await customFetch(`${API_BASE}/payment/mark-paid`, {
          method: "POST",
          body: JSON.stringify({ sessionId }),
        });

        setStatus("success");

        AudioManager.speak(
          "Payment confirmed. Your full adventure awaits. Say next level to descend into Level 2.",
          { interrupt: true }
        );

        setTimeout(() => setLocation("/"), 4000);
      } catch {
        setStatus("error");
        AudioManager.speak(
          "There was an issue confirming your payment. Please contact support.",
          { interrupt: true }
        );
      }
    })();
  }, [setLocation]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#060810",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        fontFamily: "'Fira Code', monospace",
        color: "#c89b3c",
      }}
      role="main"
      aria-live="polite"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        style={{ textAlign: "center", maxWidth: 480, padding: "0 24px" }}
      >
        {status === "pending" && (
          <>
            <div style={{ fontSize: "2rem", marginBottom: 16 }}>⚔</div>
            <h1 style={{ fontSize: "1.1rem", letterSpacing: "0.15em", textTransform: "uppercase", margin: 0 }}>
              Confirming payment…
            </h1>
            <p style={{ color: "rgba(200,190,180,0.6)", fontSize: "0.8rem", marginTop: 12 }}>
              One moment while we unlock your adventure.
            </p>
          </>
        )}
        {status === "success" && (
          <>
            <div style={{ fontSize: "2rem", marginBottom: 16 }}>✦</div>
            <h1 style={{ fontSize: "1.1rem", letterSpacing: "0.15em", textTransform: "uppercase", margin: 0 }}>
              Payment Confirmed
            </h1>
            <p style={{ color: "rgba(200,190,180,0.7)", fontSize: "0.8rem", marginTop: 12 }}>
              All dungeon levels are now unlocked. Returning to the game…
            </p>
          </>
        )}
        {status === "error" && (
          <>
            <div style={{ fontSize: "2rem", marginBottom: 16 }}>✕</div>
            <h1 style={{ fontSize: "1.1rem", letterSpacing: "0.15em", textTransform: "uppercase", margin: 0, color: "#8b1e1e" }}>
              Confirmation Failed
            </h1>
            <p style={{ color: "rgba(200,190,180,0.7)", fontSize: "0.8rem", marginTop: 12 }}>
              Please contact support if your payment went through.
            </p>
            <button
              onClick={() => setLocation("/")}
              style={{
                marginTop: 24,
                padding: "10px 28px",
                background: "transparent",
                border: "1px solid rgba(200,155,60,0.5)",
                color: "#c89b3c",
                fontFamily: "'Fira Code', monospace",
                fontSize: "0.75rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Return to Game
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}
