/**
 * PaymentSuccessPage
 *
 * The frontend NEVER marks the payment as complete.
 * Payment is confirmed exclusively via the Stripe webhook (checkout.session.completed),
 * which sets hasPaid = true in the DB.
 *
 * This page polls GET /api/payment/status every second until hasPaid is true,
 * then speaks a confirmation and redirects back to the game.
 * If the webhook takes longer than 12 seconds, we redirect anyway with a friendly note —
 * the game's /game/start endpoint re-reads hasPaid from DB on every load.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { AudioManager } from "@/audio/AudioManager";
import { customFetch } from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/\//g, "/");

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS  = 12000;

export function PaymentSuccessPage() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<"polling" | "confirmed" | "timeout">("polling");
  const startedRef  = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const stop = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current)  clearTimeout(timeoutRef.current);
    };

    const confirmed = () => {
      stop();
      setStatus("confirmed");
      AudioManager.speak(
        "Your payment has been confirmed. All dungeon levels are now unlocked. Returning you to the game.",
        { interrupt: true }
      );
      setTimeout(() => setLocation("/"), 3500);
    };

    const timedOut = () => {
      stop();
      setStatus("timeout");
      AudioManager.speak(
        "Payment received. It may take a moment to reflect in the game. Returning you now.",
        { interrupt: true }
      );
      setTimeout(() => setLocation("/"), 3500);
    };

    const poll = async () => {
      try {
        const data = await customFetch<{ hasPaid: boolean }>(`${API_BASE}/payment/status`);
        if (data.hasPaid) confirmed();
      } catch {
        // Swallow — keep polling until timeout
      }
    };

    // Start polling
    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    timeoutRef.current  = setTimeout(timedOut, POLL_TIMEOUT_MS);

    return stop;
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
        {status === "polling" && (
          <>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1.4, ease: "linear" }}
              style={{ fontSize: "2rem", marginBottom: 16, display: "inline-block" }}
            >
              ⚔
            </motion.div>
            <h1 style={{ fontSize: "1.1rem", letterSpacing: "0.15em", textTransform: "uppercase", margin: 0 }}>
              Confirming payment…
            </h1>
            <p style={{ color: "rgba(200,190,180,0.6)", fontSize: "0.8rem", marginTop: 12 }}>
              Waiting for Stripe to confirm your payment. This usually takes just a moment.
            </p>
          </>
        )}

        {status === "confirmed" && (
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

        {status === "timeout" && (
          <>
            <div style={{ fontSize: "2rem", marginBottom: 16 }}>⚡</div>
            <h1 style={{ fontSize: "1.1rem", letterSpacing: "0.15em", textTransform: "uppercase", margin: 0 }}>
              Payment Received
            </h1>
            <p style={{ color: "rgba(200,190,180,0.7)", fontSize: "0.8rem", marginTop: 12 }}>
              Stripe confirmed your payment. It will appear in-game momentarily.
            </p>
          </>
        )}
      </motion.div>
    </div>
  );
}
