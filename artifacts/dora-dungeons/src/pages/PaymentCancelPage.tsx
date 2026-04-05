import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useEffect } from "react";
import { AudioManager } from "@/audio/AudioManager";

export function PaymentCancelPage() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    AudioManager.speak(
      "Payment cancelled. No charge was made. You can unlock Level 2 whenever you are ready. Returning to the game.",
      { interrupt: true }
    );
    const t = setTimeout(() => setLocation("/"), 4000);
    return () => clearTimeout(t);
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
        <div style={{ fontSize: "2rem", marginBottom: 16 }}>⟳</div>
        <h1 style={{ fontSize: "1.1rem", letterSpacing: "0.15em", textTransform: "uppercase", margin: 0 }}>
          Payment Cancelled
        </h1>
        <p style={{ color: "rgba(200,190,180,0.7)", fontSize: "0.8rem", marginTop: 12 }}>
          No charge was made. You can unlock Level 2 whenever you're ready.
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
      </motion.div>
    </div>
  );
}
