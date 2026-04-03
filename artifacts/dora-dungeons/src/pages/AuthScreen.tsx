import { useState, useRef, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { UseJwtAuth } from "@/hooks/useJwtAuth";

interface AuthScreenProps {
  auth: UseJwtAuth;
}

type Mode = "login" | "signup";

export function AuthScreen({ auth }: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, [mode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "signup") {
        await auth.signup(email, password, firstName || undefined);
      } else {
        await auth.login(email, password);
      }
    } catch (err: any) {
      setError(err.message ?? "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const tagline = mode === "login"
    ? "Speak, and the dungeon shall answer"
    : "Your legend begins here";

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center px-4 relative overflow-hidden"
      style={{ background: "#060810" }}
    >
      {/* ── Dungeon background ── */}
      <div className="dungeon-bg" />

      {/* ── Strong vignette ── */}
      <div className="vignette" />

      {/* ── Torch flicker light (left + right walls) ── */}
      <div className="auth-torch-light" />

      {/* ── Atmospheric fog at floor ── */}
      <div className="auth-fog" />

      {/* ── Scanline ── */}
      <div className="scanline-overlay" />

      {/* ── Panel ── */}
      <motion.div
        className="auth-panel"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-7">
          <img
            src={`${import.meta.env.BASE_URL}images/logo.png`}
            alt="Dora Dungeons"
            className="auth-logo w-28 h-28 object-contain mb-4"
          />

          {/* Tagline */}
          <AnimatePresence mode="wait">
            <motion.p
              key={tagline}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.3 }}
              style={{
                fontFamily: "'Crimson Text', serif",
                fontStyle: "italic",
                fontSize: "0.95rem",
                color: "rgba(200,175,130,0.55)",
                letterSpacing: "0.04em",
                textAlign: "center",
              }}
            >
              {tagline}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Rune divider */}
        <div className="auth-divider mb-6">⬡</div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">

          {/* Name (signup only) */}
          <AnimatePresence>
            {mode === "signup" && (
              <motion.div
                className="auth-field"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.28 }}
              >
                <label className="auth-label" htmlFor="dd-firstName">
                  Name (optional)
                </label>
                <input
                  id="dd-firstName"
                  type="text"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="Adventurer"
                  className="auth-input"
                  disabled={busy}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Email */}
          <div className="auth-field">
            <label className="auth-label" htmlFor="dd-email">Email</label>
            <input
              ref={emailRef}
              id="dd-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="hero@dungeon.com"
              className="auth-input"
              disabled={busy}
            />
          </div>

          {/* Password */}
          <div className="auth-field">
            <label className="auth-label" htmlFor="dd-password">Password</label>
            <input
              id="dd-password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              minLength={8}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={mode === "signup" ? "At least 8 characters" : "• • • • • • • •"}
              className="auth-input"
              disabled={busy}
            />
          </div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.p
                className="auth-error"
                role="alert"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
              >
                ⚠ {error}
              </motion.p>
            )}
          </AnimatePresence>

          {/* Submit */}
          <button
            type="submit"
            disabled={busy}
            className="auth-btn flex items-center justify-center gap-2 mt-1"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === "login" ? "Enter the Dungeon" : "Begin Your Quest"}
          </button>

          {/* Switch mode */}
          <div className="flex items-center justify-center gap-2 mt-1">
            <span className="auth-mode-label">
              {mode === "login" ? "No Account?" : "Already a member?"}
            </span>
            <button
              type="button"
              onClick={() => { setMode(m => m === "login" ? "signup" : "login"); setError(""); }}
              className="auth-mode-btn"
            >
              {mode === "login" ? "Sign Up" : "Sign In"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
