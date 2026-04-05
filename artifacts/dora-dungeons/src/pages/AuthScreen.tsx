import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Mic, MicOff, Volume2 } from "lucide-react";
import type { UseJwtAuth } from "@/hooks/useJwtAuth";
import { AudioManager } from "@/audio/AudioManager";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { normalizeEmailSpeech, isValidEmail } from "@/audio/emailNormalizer";

interface AuthScreenProps {
  auth: UseJwtAuth;
}

// ── Flow step type ────────────────────────────────────────────────────────────
type Step =
  | "welcome"
  | "signup_name"
  | "signup_email"
  | "signup_confirm"
  | "login_email"
  | "login_confirm"
  | "processing";

// ── Step labels shown to the user ────────────────────────────────────────────
const STEP_LABEL: Record<Step, string> = {
  welcome:        "Say 'create account' or 'log in'",
  signup_name:    "Say your character's name",
  signup_email:   "Say your email address",
  signup_confirm: "Say 'yes' to confirm or 'no' to cancel",
  login_email:    "Say your email address",
  login_confirm:  "Say 'yes' to enter or 'no' to cancel",
  processing:     "Please wait…",
};

// ── Intent helpers ────────────────────────────────────────────────────────────
const isSignup  = (t: string) => /create|sign.?up|new account|register|begin|new|start/i.test(t);
const isLogin   = (t: string) => /log.?in|login|continue|existing|sign.?in|enter/i.test(t);
const isYes     = (t: string) => /^(yes|yeah|yep|correct|confirm|proceed|create|go|sure|do it|absolutely|affirmative)$/i.test(t.trim());
const isNo      = (t: string) => /^(no|nope|cancel|stop|wrong|incorrect|start over|restart|negative|never mind)$/i.test(t.trim());

// ── Component ─────────────────────────────────────────────────────────────────
export function AuthScreen({ auth }: AuthScreenProps) {
  // ── Voice-mode state ──────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>("welcome");
  const [capturedEmail, setCapturedEmail] = useState("");
  const [capturedName, setCapturedName] = useState("");
  const [voiceError, setVoiceError] = useState("");

  // ── Manual fallback state ─────────────────────────────────────────────────
  const [useManual, setUseManual] = useState(false);
  const [manualMode, setManualMode] = useState<"login" | "signup">("login");
  const [manualEmail, setManualEmail] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  const [manualError, setManualError] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);

  // ── Always-fresh refs for use inside speech callbacks ─────────────────────
  const stepRef         = useRef<Step>("welcome");
  const capturedEmailRef = useRef("");
  const capturedNameRef  = useRef("");
  stepRef.current         = step;
  capturedEmailRef.current = capturedEmail;
  capturedNameRef.current  = capturedName;

  // Forward-ref for speakThenListen — set after hook init
  const speakThenListenRef = useRef<(msg: string) => void>(() => {});
  const doLoginRef         = useRef<() => void>(() => {});
  const doSignupRef        = useRef<() => void>(() => {});
  const hasStartedRef      = useRef(false);

  // ── Audio unlock gate ─────────────────────────────────────────────────────
  // Browsers block Web Speech API until a user gesture occurs.
  // The gate provides that gesture on first tap/click.
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  // ── Transcript handler — all deps via refs (zero stale closures) ──────────
  const handleTranscript = useCallback((raw: string) => {
    const text = raw.trim();
    const lower = text.toLowerCase();
    const s = speakThenListenRef.current;

    switch (stepRef.current) {

      case "welcome":
        if (isSignup(lower)) {
          setStep("signup_name");
          s("Let us begin your journey. What name shall your character be known by? Speak any name.");
        } else if (isLogin(lower)) {
          setStep("login_email");
          s("Please say the email address associated with your account.");
        } else {
          s("I didn't catch that. Say create account to begin a new adventure, or say log in to continue an existing one.");
        }
        break;

      case "signup_name": {
        if (!text) {
          s("I didn't catch a name. Please say your character's name.");
          break;
        }
        setCapturedName(text);
        capturedNameRef.current = text;
        setStep("signup_email");
        s(`${text} — a fine name. Now speak the email address you would like to link to your account. Say 'dot' for periods and 'at' for the at symbol.`);
        break;
      }

      case "signup_email": {
        const email = normalizeEmailSpeech(raw);
        if (!isValidEmail(email)) {
          s("That email doesn't look right. Please say your email address again — for example: name at gmail dot com.");
          break;
        }
        if (!email.endsWith("@gmail.com")) {
          s("That email address is not supported. Please provide a valid Gmail address ending with at gmail dot com.");
          break;
        }
        setCapturedEmail(email);
        capturedEmailRef.current = email;
        setStep("signup_confirm");
        const namePart = capturedNameRef.current
          ? ` Your character name is ${capturedNameRef.current}.`
          : "";
        s(`Your email is ${email}.${namePart} Shall I create your account? Say yes to confirm, or no to start over.`);
        break;
      }

      case "signup_confirm":
        if (isYes(lower)) {
          doSignupRef.current();
        } else if (isNo(lower)) {
          setCapturedEmail(""); setCapturedName("");
          setStep("welcome");
          s("Account creation cancelled. Say create account to try again, or log in to enter the dungeon.");
        } else {
          s("Please say yes to create your account, or no to cancel and start over.");
        }
        break;

      case "login_email": {
        const email = normalizeEmailSpeech(raw);
        if (!isValidEmail(email)) {
          s("That email doesn't look right. Please say your email address again — for example: name at gmail dot com.");
          break;
        }
        if (!email.endsWith("@gmail.com")) {
          s("That email address is not supported. Please provide a valid Gmail address ending with at gmail dot com.");
          break;
        }
        setCapturedEmail(email);
        capturedEmailRef.current = email;
        setStep("login_confirm");
        s(`Your email is ${email}. Shall I proceed to enter the dungeon? Say yes or no.`);
        break;
      }

      case "login_confirm":
        if (isYes(lower)) {
          doLoginRef.current();
        } else if (isNo(lower)) {
          setCapturedEmail("");
          setStep("welcome");
          s("Login cancelled. Say log in to try again, or create account to begin a new adventure.");
        } else {
          s("Please say yes to enter the dungeon, or no to cancel.");
        }
        break;
    }
  }, []); // zero dependencies — all reads via refs

  // ── Voice input hook ──────────────────────────────────────────────────────
  const {
    isSupported,
    voiceState,
    interimTranscript,
    startListening,
    stopListening,
  } = useVoiceInput({ onFinalTranscript: handleTranscript });

  // ── speakThenListen helper ────────────────────────────────────────────────
  const speakThenListen = useCallback((msg: string) => {
    stopListening();
    AudioManager.speak(msg, { interrupt: true });
    AudioManager.onQueueDrained(() => startListening());
  }, [startListening, stopListening]);

  speakThenListenRef.current = speakThenListen;

  // ── API: signup ───────────────────────────────────────────────────────────
  const doSignup = useCallback(async () => {
    const email = capturedEmailRef.current;
    const name  = capturedNameRef.current;
    setStep("processing");
    stopListening();
    AudioManager.speak("Creating your account now. One moment.", { interrupt: true });
    try {
      await auth.signup(email, name || undefined);
      AudioManager.speak("Your account has been created. Entering the dungeon now.", { interrupt: true });
    } catch (err: any) {
      const code = err?.data?.error;
      if (code === "EMAIL_TAKEN") {
        setStep("login_confirm");
        speakThenListenRef.current(
          "An account with this email already exists. Please log in or use a different Gmail address. Say yes to log in with this email, or no to try a different one."
        );
      } else if (code === "INVALID_DOMAIN") {
        setCapturedEmail("");
        setStep("signup_email");
        speakThenListenRef.current(
          "That email address is not supported. Please provide a valid Gmail address."
        );
      } else {
        setVoiceError(err.message ?? "Something went wrong.");
        setStep("welcome");
        speakThenListenRef.current(
          "There was a problem creating your account. Say create account to try again, or log in to enter."
        );
      }
    }
  }, [auth, stopListening]);

  doSignupRef.current = doSignup;

  // ── API: login ────────────────────────────────────────────────────────────
  const doLogin = useCallback(async () => {
    const email = capturedEmailRef.current;
    setStep("processing");
    stopListening();
    AudioManager.speak("Logging in. One moment.", { interrupt: true });
    try {
      await auth.login(email);
      AudioManager.speak("Welcome back. Restoring your journey.", { interrupt: true });
    } catch (err: any) {
      const code = err?.data?.error;
      if (code === "NOT_FOUND") {
        setStep("signup_confirm");
        setCapturedName("");
        speakThenListenRef.current(
          "No account was found with that email. Please try again or create a new account. Say yes to create one, or no to try a different email."
        );
      } else if (code === "INVALID_DOMAIN") {
        setCapturedEmail("");
        setStep("login_email");
        speakThenListenRef.current(
          "That email address is not supported. Please provide a valid Gmail address."
        );
      } else {
        setVoiceError(err.message ?? "Something went wrong.");
        setStep("welcome");
        speakThenListenRef.current(
          "There was a problem logging in. Say log in to try again, or create account to begin anew."
        );
      }
    }
  }, [auth, stopListening]);

  doLoginRef.current = doLogin;

  // ── Audio gate unlock handler ─────────────────────────────────────────────
  // Called on the first tap/click (the user gesture that satisfies the browser).
  // TTS is triggered INSIDE this click handler so the browser permits it.
  const handleAudioUnlock = useCallback(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    setAudioUnlocked(true);
    AudioManager.initializeVoices();
    // Small delay so React has flushed the gate removal before TTS starts
    setTimeout(() => {
      speakThenListenRef.current(
        "Welcome to Dora Dungeons. Would you like to create a new account, or log in to an existing one?"
      );
    }, 120);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch to manual mode if voice not supported
  useEffect(() => {
    if (!isSupported) setUseManual(true);
  }, [isSupported]);

  // When switching back to voice mode, restart from welcome
  const handleSwitchToVoice = () => {
    setUseManual(false);
    setStep("welcome");
    setCapturedEmail(""); setCapturedName("");
    hasStartedRef.current = false;
    setTimeout(() => {
      if (!hasStartedRef.current) {
        hasStartedRef.current = true;
        speakThenListen(
          "Voice mode active. Say create account to begin, or log in to continue."
        );
      }
    }, 200);
  };

  // Cleanup TTS on unmount
  useEffect(() => () => { AudioManager.stop(); }, []);

  // ── Manual submit ─────────────────────────────────────────────────────────
  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    setManualError(""); setManualBusy(true);
    try {
      if (manualMode === "signup") {
        await auth.signup(manualEmail, manualName || undefined);
      } else {
        await auth.login(manualEmail);
      }
    } catch (err: any) {
      setManualError(err.message ?? "Something went wrong.");
    } finally {
      setManualBusy(false);
    }
  }

  useEffect(() => {
    if (useManual) emailRef.current?.focus();
  }, [useManual, manualMode]);

  // ── Mic indicator colour ──────────────────────────────────────────────────
  const micColor =
    step === "processing" ? "rgba(200,155,60,0.6)"
    : voiceState === "listening"   ? "#34d399"
    : voiceState === "speaking"    ? "#3a86ff"
    : voiceState === "processing"  ? "#c89b3c"
    : "rgba(200,185,160,0.25)";

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center px-4 relative overflow-hidden"
      style={{ background: "#060810" }}
    >
      {/* Backgrounds */}
      <div className="dungeon-bg" />
      <div className="vignette" />
      <div className="auth-torch-light" />
      <div className="auth-fog" />
      <div className="scanline-overlay" />

      {/* ── Audio gate — shown until first user gesture ── */}
      <AnimatePresence>
        {!audioUnlocked && (
          <motion.div
            key="audio-gate"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 200,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: "radial-gradient(ellipse at center, #0e1420 0%, #060810 100%)",
              cursor: "pointer",
            }}
            onClick={handleAudioUnlock}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleAudioUnlock(); }}
            role="button"
            tabIndex={0}
            aria-label="Tap to begin Dora Dungeons"
          >
            <div className="dungeon-bg" style={{ opacity: 0.4 }} />
            <div className="vignette" />
            <div className="scanline-overlay" />

            <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "2rem" }}>
              <motion.img
                src={`${import.meta.env.BASE_URL}images/logo.png`}
                alt="Dora Dungeons"
                initial={{ opacity: 0, scale: 0.88 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                style={{ width: 120, height: 120, objectFit: "contain" }}
              />

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                style={{ textAlign: "center" }}
              >
                <p style={{
                  fontFamily: "'Cinzel', serif",
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  letterSpacing: "0.15em",
                  color: "#c89b3c",
                  textTransform: "uppercase",
                  marginBottom: "0.5rem",
                }}>
                  Dora Dungeons
                </p>
                <p style={{
                  fontFamily: "'Crimson Text', serif",
                  fontStyle: "italic",
                  fontSize: "0.95rem",
                  color: "rgba(200,175,130,0.55)",
                  letterSpacing: "0.04em",
                }}>
                  Speak, and the dungeon shall answer
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.55, duration: 0.45 }}
              >
                <motion.button
                  autoFocus
                  animate={{ boxShadow: ["0 0 18px rgba(200,155,60,0.25)", "0 0 32px rgba(200,155,60,0.5)", "0 0 18px rgba(200,155,60,0.25)"] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                  onClick={handleAudioUnlock}
                  style={{
                    fontFamily: "'Cinzel', serif",
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    letterSpacing: "0.22em",
                    textTransform: "uppercase",
                    color: "#c89b3c",
                    background: "rgba(200,155,60,0.08)",
                    border: "1px solid rgba(200,155,60,0.4)",
                    borderRadius: "4px",
                    padding: "0.85rem 2.4rem",
                    cursor: "pointer",
                  }}
                >
                  Tap to Enter
                </motion.button>
              </motion.div>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9, duration: 0.5 }}
                style={{
                  fontFamily: "'Fira Code', monospace",
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  color: "rgba(220,210,190,0.90)",
                  textTransform: "uppercase",
                  textAlign: "center",
                }}
              >
                Voice mode is ready. Press Enter or tap anywhere to begin your adventure.
              </motion.p>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.2, duration: 0.5 }}
                style={{
                  fontFamily: "'Fira Code', monospace",
                  fontSize: "0.62rem",
                  fontWeight: 600,
                  letterSpacing: "0.09em",
                  color: "rgba(200,185,160,0.70)",
                  textTransform: "uppercase",
                  textAlign: "center",
                  maxWidth: 280,
                }}
                aria-label="Your device requires a single interaction to activate voice. Once started, the game will be fully voice-controlled."
              >
                Your device requires a single interaction to activate voice.
                Once started, the game is fully voice-controlled.
              </motion.p>

              {/* Silent muted audio — plays automatically to prime the AudioContext
                  for spatial chimes before the first user gesture. Muted autoplay
                  is permitted by browsers without a gesture. */}
              <audio
                autoPlay
                muted
                aria-hidden="true"
                style={{ display: "none" }}
                src="data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA="
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Panel ── */}
      <motion.div
        className="auth-panel"
        initial={{ opacity: 0, y: 28, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-5">
          <img
            src={`${import.meta.env.BASE_URL}images/logo.png`}
            alt="Dora Dungeons"
            className="auth-logo w-24 h-24 object-contain mb-3"
          />
          <p style={{
            fontFamily: "'Crimson Text', serif",
            fontStyle: "italic",
            fontSize: "0.9rem",
            color: "rgba(200,175,130,0.5)",
            letterSpacing: "0.04em",
          }}>
            Speak, and the dungeon shall answer
          </p>
        </div>

        <div className="auth-divider mb-5">⬡</div>

        {/* ── VOICE MODE ── */}
        {!useManual && (
          <div className="flex flex-col items-center gap-4">

            {/* Mic circle + step label */}
            <div className="flex flex-col items-center gap-2">
              <motion.div
                animate={{
                  boxShadow: voiceState === "listening"
                    ? ["0 0 0 0 rgba(52,211,153,0.5)", "0 0 0 14px rgba(52,211,153,0)", "0 0 0 0 rgba(52,211,153,0.5)"]
                    : voiceState === "speaking"
                    ? ["0 0 0 0 rgba(58,134,255,0.5)", "0 0 0 12px rgba(58,134,255,0)", "0 0 0 0 rgba(58,134,255,0.5)"]
                    : "none",
                }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                style={{
                  width: 56, height: 56,
                  borderRadius: "50%",
                  background: "rgba(16,20,28,0.9)",
                  border: `2px solid ${micColor}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "border-color 0.3s ease",
                }}
              >
                {step === "processing" || voiceState === "processing"
                  ? <Loader2 size={22} className="animate-spin" style={{ color: micColor }} />
                  : voiceState === "listening" || voiceState === "speaking"
                  ? <Mic size={22} style={{ color: micColor }} />
                  : <MicOff size={22} style={{ color: micColor }} />
                }
              </motion.div>

              {/* Step instruction */}
              <AnimatePresence mode="wait">
                <motion.p
                  key={step}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.25 }}
                  style={{
                    fontFamily: "'Cinzel', serif",
                    fontWeight: 700,
                    fontSize: "0.7rem",
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: step === "processing" ? "rgba(200,155,60,0.7)" : "rgba(200,185,160,0.7)",
                    textAlign: "center",
                  }}
                >
                  {STEP_LABEL[step]}
                </motion.p>
              </AnimatePresence>
            </div>

            {/* Interim transcript — what the mic is hearing */}
            <AnimatePresence>
              {interimTranscript && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{
                    fontFamily: "'Crimson Text', serif",
                    fontStyle: "italic",
                    fontSize: "1rem",
                    color: "rgba(200,185,160,0.45)",
                    textAlign: "center",
                    maxWidth: "100%",
                    wordBreak: "break-word",
                  }}
                >
                  "{interimTranscript}"
                </motion.p>
              )}
            </AnimatePresence>

            {/* Captured values display */}
            <AnimatePresence>
              {(capturedName || capturedEmail) && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="w-full flex flex-col gap-2"
                >
                  {capturedName && (
                    <div className="flex items-center gap-2 px-3 py-2"
                      style={{
                        background: "rgba(200,155,60,0.07)",
                        border: "1px solid rgba(200,155,60,0.2)",
                        borderRadius: "0.5rem",
                      }}
                    >
                      <span style={{ fontFamily: "'Fira Code', monospace", fontSize: "0.65rem", color: "rgba(200,155,60,0.5)", letterSpacing: "0.15em", textTransform: "uppercase", flexShrink: 0 }}>
                        NAME
                      </span>
                      <span style={{ fontFamily: "'Crimson Text', serif", fontSize: "1rem", color: "#e8dcc8" }}>
                        {capturedName}
                      </span>
                    </div>
                  )}
                  {capturedEmail && (
                    <div className="flex items-center gap-2 px-3 py-2"
                      style={{
                        background: "rgba(200,155,60,0.07)",
                        border: "1px solid rgba(200,155,60,0.2)",
                        borderRadius: "0.5rem",
                      }}
                    >
                      <span style={{ fontFamily: "'Fira Code', monospace", fontSize: "0.65rem", color: "rgba(200,155,60,0.5)", letterSpacing: "0.15em", textTransform: "uppercase", flexShrink: 0 }}>
                        EMAIL
                      </span>
                      <span style={{ fontFamily: "'Fira Code', monospace", fontSize: "0.82rem", color: "#e8dcc8" }}>
                        {capturedEmail}
                      </span>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error */}
            <AnimatePresence>
              {voiceError && (
                <motion.p
                  className="auth-error text-center"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                >
                  ⚠ {voiceError}
                </motion.p>
              )}
            </AnimatePresence>

            {/* Switch to manual */}
            <button
              type="button"
              onClick={() => { stopListening(); AudioManager.stop(); setUseManual(true); }}
              style={{
                marginTop: "0.5rem",
                background: "none", border: "none", cursor: "pointer",
                fontFamily: "'Cinzel', serif",
                fontSize: "0.65rem",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "rgba(200,155,60,0.3)",
                transition: "color 0.2s",
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "rgba(200,155,60,0.7)")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(200,155,60,0.3)")}
            >
              Switch to manual input
            </button>
          </div>
        )}

        {/* ── MANUAL FALLBACK MODE ── */}
        {useManual && (
          <form onSubmit={handleManualSubmit} noValidate className="flex flex-col gap-4">
            {manualMode === "signup" && (
              <div className="auth-field">
                <label className="auth-label" htmlFor="dd-name">Name (optional)</label>
                <input
                  id="dd-name"
                  type="text"
                  autoComplete="given-name"
                  value={manualName}
                  onChange={e => setManualName(e.target.value)}
                  placeholder="Adventurer"
                  className="auth-input"
                  disabled={manualBusy}
                />
              </div>
            )}

            <div className="auth-field">
              <label className="auth-label" htmlFor="dd-email">Email</label>
              <input
                ref={emailRef}
                id="dd-email"
                type="email"
                autoComplete="email"
                required
                value={manualEmail}
                onChange={e => setManualEmail(e.target.value)}
                placeholder="hero@dungeon.com"
                className="auth-input"
                disabled={manualBusy}
              />
            </div>

            <AnimatePresence>
              {manualError && (
                <motion.p
                  className="auth-error"
                  role="alert"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  ⚠ {manualError}
                </motion.p>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={manualBusy}
              className="auth-btn flex items-center justify-center gap-2 mt-1"
            >
              {manualBusy && <Loader2 className="w-4 h-4 animate-spin" />}
              {manualMode === "login" ? "Enter the Dungeon" : "Begin Your Quest"}
            </button>

            {/* Mode switch */}
            <div className="flex items-center justify-center gap-2 mt-1">
              <span className="auth-mode-label">
                {manualMode === "login" ? "No Account?" : "Already a member?"}
              </span>
              <button
                type="button"
                onClick={() => { setManualMode(m => m === "login" ? "signup" : "login"); setManualError(""); }}
                className="auth-mode-btn"
              >
                {manualMode === "login" ? "Create Account" : "Sign In"}
              </button>
            </div>

            {/* Back to voice */}
            {isSupported && (
              <button
                type="button"
                onClick={handleSwitchToVoice}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "0.35rem",
                  fontFamily: "'Cinzel', serif",
                  fontSize: "0.65rem",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "rgba(200,155,60,0.35)",
                  transition: "color 0.2s",
                  marginTop: "0.25rem",
                }}
                onMouseEnter={e => (e.currentTarget.style.color = "rgba(200,155,60,0.75)")}
                onMouseLeave={e => (e.currentTarget.style.color = "rgba(200,155,60,0.35)")}
              >
                <Volume2 size={11} /> Switch to voice mode
              </button>
            )}
          </form>
        )}
      </motion.div>
    </div>
  );
}
