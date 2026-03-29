import { useState, useRef, useEffect } from "react";
import { Loader2 } from "lucide-react";
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

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(200,190,180,0.15)",
    color: "#c8beb4",
    padding: "0.75rem 1rem",
    width: "100%",
    fontSize: "0.875rem",
    outline: "none",
    letterSpacing: "0.02em",
    fontFamily: "inherit",
  };

  const labelStyle: React.CSSProperties = {
    color: "rgba(200,190,180,0.5)",
    fontSize: "0.7rem",
    letterSpacing: "0.2em",
    textTransform: "uppercase",
    display: "block",
    marginBottom: "0.4rem",
  };

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center gap-8 px-4"
      style={{ background: "#09080c" }}
    >
      <div className="text-center">
        <h1
          className="font-display text-4xl md:text-6xl font-bold mb-3"
          style={{ color: "#c8beb4", letterSpacing: "0.05em" }}
        >
          Dora Dungeons
        </h1>
        <p
          className="font-body text-sm"
          style={{ color: "rgba(200,190,180,0.4)" }}
        >
          {mode === "login" ? "Enter the dungeon" : "Create your account"}
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm flex flex-col gap-4"
        noValidate
      >
        {mode === "signup" && (
          <div>
            <label style={labelStyle} htmlFor="dd-firstName">Name (optional)</label>
            <input
              id="dd-firstName"
              type="text"
              autoComplete="given-name"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              placeholder="Adventurer"
              style={inputStyle}
              disabled={busy}
            />
          </div>
        )}

        <div>
          <label style={labelStyle} htmlFor="dd-email">Email</label>
          <input
            ref={emailRef}
            id="dd-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="hero@dungeon.com"
            style={inputStyle}
            disabled={busy}
          />
        </div>

        <div>
          <label style={labelStyle} htmlFor="dd-password">Password</label>
          <input
            id="dd-password"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            minLength={8}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={mode === "signup" ? "At least 8 characters" : ""}
            style={inputStyle}
            disabled={busy}
          />
        </div>

        {error && (
          <p style={{ color: "rgba(179,18,47,0.9)", fontSize: "0.8rem", letterSpacing: "0.02em" }} role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="flex items-center justify-center gap-2 py-3 font-display text-sm tracking-widest uppercase transition-all duration-200 border"
          style={{
            background: "rgba(179,18,47,0.15)",
            borderColor: "rgba(179,18,47,0.5)",
            color: "#c8beb4",
            cursor: busy ? "not-allowed" : "pointer",
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {mode === "login" ? "Log in" : "Create account"}
        </button>

        <button
          type="button"
          onClick={() => { setMode(m => m === "login" ? "signup" : "login"); setError(""); }}
          style={{
            background: "none",
            border: "none",
            color: "rgba(200,190,180,0.35)",
            fontSize: "0.75rem",
            letterSpacing: "0.1em",
            cursor: "pointer",
            textAlign: "center",
            padding: "0.25rem",
          }}
        >
          {mode === "login" ? "No account? Sign up" : "Already have an account? Log in"}
        </button>
      </form>
    </div>
  );
}
