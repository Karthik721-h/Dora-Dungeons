import { motion, AnimatePresence } from "framer-motion";
import {
  Mic, MicOff, RotateCcw, Swords, Shield, Flame, Zap,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
} from "lucide-react";
import { AudioManager } from "@/audio/AudioManager";

type AudioState = "idle" | "listening" | "speaking" | "processing";

interface VoiceControlProps {
  isSupported: boolean;
  audioState: AudioState;
  isListening: boolean;
  interimTranscript: string;
  intentHint: string | null;
  isPending: boolean;
  isGameOver: boolean;
  isModalOpen: boolean;
  isCombat: boolean;
  command: string;
  onCommandChange: (v: string) => void;
  onSubmit: (cmd: string) => void;
  onToggleListen: () => void;
}

interface ActionBtnProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "danger" | "gold" | "magic" | "default";
  small?: boolean;
}

function ActionBtn({ icon, label, onClick, disabled, variant = "default", small }: ActionBtnProps) {
  const styles = {
    danger:  { bg: "rgba(139,30,30,0.14)", border: "rgba(139,30,30,0.45)", color: "#f87171" },
    gold:    { bg: "rgba(200,155,60,0.1)",  border: "rgba(200,155,60,0.35)", color: "#c89b3c" },
    magic:   { bg: "rgba(58,134,255,0.1)",  border: "rgba(58,134,255,0.35)", color: "#3a86ff" },
    default: { bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.12)", color: "rgba(220,210,195,0.8)" },
  }[variant];

  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.06 }}
      whileTap={{ scale: disabled ? 1 : 0.93 }}
      onClick={onClick}
      disabled={disabled}
      className="action-btn flex flex-col items-center justify-center gap-1 transition-all"
      style={{
        background: styles.bg,
        border: `1px solid ${styles.border}`,
        color: styles.color,
        borderRadius: "0.5rem",
        padding: small ? "6px 8px" : "9px 11px",
        opacity: disabled ? 0.3 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        minWidth: small ? "42px" : "50px",
        boxShadow: `0 2px 10px ${styles.bg}`,
      }}
      aria-label={label}
      title={label}
    >
      <span style={{ fontSize: small ? "13px" : "15px" }}>{icon}</span>
      <span
        className="font-code uppercase tracking-widest"
        style={{ fontSize: "8px", opacity: 0.75 }}
      >
        {label}
      </span>
    </motion.button>
  );
}

export function VoiceControl({
  isSupported, audioState, isListening, interimTranscript, intentHint,
  isPending, isGameOver, isModalOpen, isCombat, command, onCommandChange, onSubmit, onToggleListen,
}: VoiceControlProps) {

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !isPending && command.trim()) {
      onSubmit(command);
    }
  };

  const micColor = isListening
    ? "#f87171"
    : audioState === "speaking"
    ? "#3a86ff"
    : "rgba(200,190,180,0.45)";

  const micBg = isListening
    ? "radial-gradient(circle, rgba(139,30,30,0.28) 0%, rgba(139,30,30,0.08) 100%)"
    : audioState === "speaking"
    ? "radial-gradient(circle, rgba(58,134,255,0.22) 0%, rgba(58,134,255,0.06) 100%)"
    : "rgba(255,255,255,0.04)";

  const micBorder = isListening
    ? "2px solid rgba(139,30,30,0.75)"
    : audioState === "speaking"
    ? "2px solid rgba(58,134,255,0.55)"
    : "2px solid rgba(255,255,255,0.12)";

  const statusLabel = isListening
    ? "● Listening"
    : audioState === "speaking"
    ? "● Speaking"
    : audioState === "processing"
    ? "… Processing"
    : "○ Idle";

  const statusColor = isListening
    ? "rgba(248,113,113,0.75)"
    : audioState === "speaking"
    ? "rgba(58,134,255,0.75)"
    : audioState === "processing"
    ? "rgba(200,155,60,0.75)"
    : "rgba(200,190,180,0.25)";

  return (
    <div
      className="glass-panel p-2 sm:p-3 flex flex-col gap-2 sm:gap-3 overflow-y-auto"
      style={{ minHeight: 0, paddingBottom: "max(env(safe-area-inset-bottom, 0px), 0.75rem)" }}
    >
      {/* ── Top row: mic + transcript ── */}
      <div className="flex items-center gap-3">
        {isSupported && (
          <motion.button
            onClick={onToggleListen}
            disabled={isGameOver || isPending}
            whileTap={{ scale: 0.91 }}
            className={`
              relative rounded-full flex items-center justify-center flex-shrink-0 transition-all
              ${isListening ? "mic-listening" : audioState === "speaking" ? "mic-speaking" : ""}
            `}
            style={{
              width: 54, height: 54,
              background: micBg,
              border: micBorder,
              color: micColor,
              opacity: isGameOver || isPending ? 0.3 : 1,
              cursor: isGameOver || isPending ? "not-allowed" : "pointer",
            }}
            aria-label={isListening ? "Stop voice input" : "Start voice input"}
            title={isListening ? "Listening — click to stop" : "Click to speak a command"}
          >
            {isListening || audioState === "speaking" || audioState === "processing"
              ? <Mic size={22} />
              : <MicOff size={22} />
            }
          </motion.button>
        )}

        <div className="flex-1 min-w-0">
          {/* Status label */}
          <div
            className="font-code uppercase tracking-widest mb-1"
            style={{ fontSize: "10px", letterSpacing: "0.2em", color: statusColor }}
          >
            {statusLabel}
          </div>

          {/* Transcript / intent hint */}
          <AnimatePresence>
            {(interimTranscript || intentHint) && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="font-narration italic text-sm truncate"
                style={{ color: "rgba(200,155,60,0.8)" }}
              >
                {interimTranscript ? `"${interimTranscript}"` : intentHint}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Repeat button */}
        <motion.button
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.93 }}
          onClick={() => AudioManager.repeatLast()}
          className="action-btn flex items-center gap-1 px-2.5 py-2 font-code text-xs uppercase tracking-widest flex-shrink-0"
          style={{
            border: "1px solid rgba(255,255,255,0.1)",
            color: "rgba(200,190,180,0.4)",
            background: "rgba(255,255,255,0.03)",
            letterSpacing: "0.14em",
            fontSize: "10px",
            borderRadius: "0.5rem",
          }}
          aria-label="Repeat last narration"
          title="Repeat the last spoken line"
        >
          <RotateCcw size={11} />
          <span className="hidden sm:inline">Repeat</span>
        </motion.button>
      </div>

      {/* ── Combat actions (when in combat) ── */}
      {isCombat && (
        <div>
          <div
            className="font-code text-xs uppercase tracking-widest mb-2"
            style={{ color: "rgba(139,30,30,0.6)", fontSize: "9px", letterSpacing: "0.2em" }}
          >
            — Combat —
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <ActionBtn icon={<Swords size={14} />} label="Attack"  onClick={() => onSubmit("attack")}        disabled={isPending || isGameOver || isModalOpen} variant="danger" />
            <ActionBtn icon={<Shield size={14} />} label="Defend"  onClick={() => onSubmit("defend")}        disabled={isPending || isGameOver || isModalOpen} />
            <ActionBtn icon={<Flame  size={14} />} label="Spell"   onClick={() => onSubmit("cast fireball")} disabled={isPending || isGameOver || isModalOpen} variant="magic" />
            <ActionBtn icon={<Zap    size={14} />} label="Flee"    onClick={() => onSubmit("flee")}           disabled={isPending || isGameOver || isModalOpen} variant="gold" small />
          </div>
        </div>
      )}

      {/* ── Movement pad — single row to save vertical space on mobile ── */}
      {!isCombat && (
        <div>
          <div
            className="font-code uppercase tracking-widest mb-1.5"
            style={{ color: "rgba(200,155,60,0.35)", fontSize: "8px", letterSpacing: "0.2em" }}
          >
            — Move —
          </div>
          <div className="flex gap-1">
            <ActionBtn icon={<ArrowUp    size={12} />} label="N" onClick={() => onSubmit("move north")} disabled={isPending || isGameOver || isModalOpen} small />
            <ActionBtn icon={<ArrowDown  size={12} />} label="S" onClick={() => onSubmit("move south")} disabled={isPending || isGameOver || isModalOpen} small />
            <ActionBtn icon={<ArrowLeft  size={12} />} label="W" onClick={() => onSubmit("move west")}  disabled={isPending || isGameOver || isModalOpen} small />
            <ActionBtn icon={<ArrowRight size={12} />} label="E" onClick={() => onSubmit("move east")}  disabled={isPending || isGameOver || isModalOpen} small />
          </div>
        </div>
      )}

      {/* ── Command input ── */}
      <div className="flex gap-2 mt-auto">
        <div className="relative flex-1">
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 font-code text-sm pointer-events-none select-none"
            style={{ color: "rgba(139,30,30,0.55)" }}
          >
            &gt;
          </span>
          <input
            type="text"
            value={command}
            onChange={(e) => onCommandChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isPending || isGameOver || isModalOpen}
            placeholder={isListening ? "Listening…" : "Command…"}
            autoComplete="off"
            spellCheck="false"
            className="command-input w-full pl-8 pr-3 py-2 font-code text-sm disabled:opacity-40 transition-all"
            style={{
              background: "rgba(11,15,20,0.7)",
              border: "1px solid rgba(200,155,60,0.2)",
              color: "#e8e0d0",
              outline: "none",
            }}
            aria-label="Type a game command"
          />
        </div>
        <motion.button
          whileHover={{ scale: isPending || !command.trim() || isGameOver || isModalOpen ? 1 : 1.04 }}
          whileTap={{ scale: isPending || !command.trim() || isGameOver || isModalOpen ? 1 : 0.95 }}
          onClick={() => { if (command.trim()) onSubmit(command); }}
          disabled={isPending || !command.trim() || isGameOver || isModalOpen}
          className="action-btn px-4 font-display text-xs tracking-widest uppercase transition-all"
          style={{
            background: "rgba(139,30,30,0.18)",
            border: "1px solid rgba(139,30,30,0.5)",
            color: "#f87171",
            borderRadius: "0.5rem",
            opacity: isPending || !command.trim() || isGameOver || isModalOpen ? 0.3 : 1,
            cursor: isPending || !command.trim() || isGameOver || isModalOpen ? "not-allowed" : "pointer",
            letterSpacing: "0.14em",
            whiteSpace: "nowrap",
          }}
          aria-label="Execute command"
        >
          Go
        </motion.button>
      </div>
    </div>
  );
}
