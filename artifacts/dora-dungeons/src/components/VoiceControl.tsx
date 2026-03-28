import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, RotateCcw, Swords, Shield, Flame, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Zap } from "lucide-react";
import { AudioManager } from "@/audio/AudioManager";

type AudioState = "idle" | "listening" | "speaking";

interface VoiceControlProps {
  isSupported: boolean;
  audioState: AudioState;
  isListening: boolean;
  interimTranscript: string;
  intentHint: string | null;
  isPending: boolean;
  isGameOver: boolean;
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
  crimson?: boolean;
  gold?: boolean;
  small?: boolean;
}

function ActionBtn({ icon, label, onClick, disabled, crimson, gold, small }: ActionBtnProps) {
  const bg = crimson
    ? "rgba(179,18,47,0.12)"
    : gold
    ? "rgba(212,175,55,0.08)"
    : "rgba(255,255,255,0.04)";
  const borderColor = crimson
    ? "rgba(179,18,47,0.4)"
    : gold
    ? "rgba(212,175,55,0.3)"
    : "rgba(255,255,255,0.1)";
  const textColor = crimson ? "#f87171" : gold ? "#fbbf24" : "rgba(220,210,195,0.8)";

  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.05 }}
      whileTap={{ scale: disabled ? 1 : 0.95 }}
      onClick={onClick}
      disabled={disabled}
      className="action-btn flex flex-col items-center justify-center gap-1 rounded-sm transition-all"
      style={{
        background: bg,
        border: `1px solid ${borderColor}`,
        color: textColor,
        padding: small ? "6px 8px" : "10px 12px",
        opacity: disabled ? 0.3 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        minWidth: small ? "44px" : "52px",
      }}
      aria-label={label}
      title={label}
    >
      <span style={{ fontSize: small ? "14px" : "16px" }}>{icon}</span>
      <span
        className="font-code uppercase tracking-widest"
        style={{ fontSize: "9px", opacity: 0.7 }}
      >
        {label}
      </span>
    </motion.button>
  );
}

export function VoiceControl({
  isSupported, audioState, isListening, interimTranscript, intentHint,
  isPending, isGameOver, isCombat, command, onCommandChange, onSubmit, onToggleListen,
}: VoiceControlProps) {

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !isPending && command.trim()) {
      onSubmit(command);
    }
  };

  return (
    <div className="glass-panel p-4 flex flex-col gap-4">

      {/* ── Mic button ── */}
      <div className="flex flex-col items-center gap-3">
        {isSupported ? (
          <motion.button
            onClick={onToggleListen}
            disabled={isGameOver}
            whileTap={{ scale: 0.92 }}
            className={`
              relative rounded-full flex items-center justify-center transition-all
              ${isListening ? "mic-listening" : audioState === "speaking" ? "mic-speaking" : ""}
            `}
            style={{
              width: 64, height: 64,
              background: isListening
                ? "radial-gradient(circle, rgba(179,18,47,0.25) 0%, rgba(179,18,47,0.08) 100%)"
                : audioState === "speaking"
                ? "radial-gradient(circle, rgba(59,130,246,0.2) 0%, rgba(59,130,246,0.06) 100%)"
                : "rgba(255,255,255,0.05)",
              border: isListening
                ? "2px solid rgba(179,18,47,0.7)"
                : audioState === "speaking"
                ? "2px solid rgba(59,130,246,0.5)"
                : "2px solid rgba(255,255,255,0.12)",
              color: isListening ? "#f87171" : audioState === "speaking" ? "#60a5fa" : "rgba(200,190,180,0.5)",
              opacity: isGameOver ? 0.3 : 1,
            }}
            aria-label={isListening ? "Stop voice input" : "Start voice input"}
            title={isListening ? "Listening — click to stop" : "Click to speak a command"}
          >
            {isListening ? <Mic size={26} /> : <MicOff size={26} />}
          </motion.button>
        ) : null}

        {/* Audio state label */}
        <div
          className="font-code text-xs uppercase tracking-widest text-center"
          style={{
            color: isListening
              ? "rgba(248,113,113,0.7)"
              : audioState === "speaking"
              ? "rgba(96,165,250,0.7)"
              : "rgba(200,190,180,0.25)",
            letterSpacing: "0.2em",
            fontSize: "10px",
          }}
        >
          {isListening ? "listening" : audioState === "speaking" ? "speaking" : "idle"}
        </div>
      </div>

      {/* ── Transcript strip ── */}
      <AnimatePresence>
        {(interimTranscript || intentHint) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="font-narration italic text-sm text-center"
            style={{ color: "rgba(212,175,55,0.7)", lineHeight: 1.4 }}
          >
            {interimTranscript ? `"${interimTranscript}"` : intentHint}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Quick actions ── */}
      <div className="space-y-2">
        {/* Combat row */}
        {isCombat && (
          <div className="flex gap-1.5 justify-center">
            <ActionBtn icon={<Swords size={15} />} label="Attack" onClick={() => onSubmit("attack")} disabled={isPending || isGameOver} crimson />
            <ActionBtn icon={<Shield size={15} />} label="Defend" onClick={() => onSubmit("defend")} disabled={isPending || isGameOver} />
            <ActionBtn icon={<Flame size={15} />} label="Spell" onClick={() => onSubmit("cast fireball")} disabled={isPending || isGameOver} gold />
            <ActionBtn icon={<Zap size={15} />} label="Flee" onClick={() => onSubmit("flee")} disabled={isPending || isGameOver} small />
          </div>
        )}

        {/* Movement row */}
        <div className="flex items-center justify-center gap-1">
          <ActionBtn icon={<ArrowLeft size={13} />} label="West" onClick={() => onSubmit("move west")} disabled={isPending || isGameOver} small />
          <div className="flex flex-col gap-1">
            <ActionBtn icon={<ArrowUp size={13} />} label="North" onClick={() => onSubmit("move north")} disabled={isPending || isGameOver} small />
            <ActionBtn icon={<ArrowDown size={13} />} label="South" onClick={() => onSubmit("move south")} disabled={isPending || isGameOver} small />
          </div>
          <ActionBtn icon={<ArrowRight size={13} />} label="East" onClick={() => onSubmit("move east")} disabled={isPending || isGameOver} small />
        </div>
      </div>

      {/* ── Repeat button ── */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.96 }}
        onClick={() => AudioManager.repeatLast()}
        className="action-btn flex items-center justify-center gap-2 py-2 font-code text-xs uppercase tracking-widest"
        style={{
          border: "1px solid rgba(255,255,255,0.08)",
          color: "rgba(200,190,180,0.4)",
          background: "rgba(255,255,255,0.02)",
          letterSpacing: "0.18em",
        }}
        aria-label="Repeat last narration"
        title="Repeat the last spoken line"
      >
        <RotateCcw size={11} /> Repeat
      </motion.button>

      {/* ── Command input ── */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 font-code text-sm pointer-events-none"
            style={{ color: "rgba(179,18,47,0.5)" }}
          >
            &gt;
          </span>
          <input
            type="text"
            value={command}
            onChange={(e) => onCommandChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isPending || isGameOver}
            placeholder={isListening ? "Listening..." : "Type command..."}
            autoComplete="off"
            spellCheck="false"
            className="command-input w-full pl-8 pr-3 py-2.5 font-code text-sm disabled:opacity-40 transition-all"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#e8e0d0",
              outline: "none",
            }}
            aria-label="Type a game command"
          />
        </div>
        <motion.button
          whileHover={{ scale: isPending || !command.trim() || isGameOver ? 1 : 1.03 }}
          whileTap={{ scale: isPending || !command.trim() || isGameOver ? 1 : 0.96 }}
          onClick={() => { if (command.trim()) onSubmit(command); }}
          disabled={isPending || !command.trim() || isGameOver}
          className="px-4 font-display text-xs tracking-widest uppercase transition-all"
          style={{
            background: "rgba(179,18,47,0.15)",
            border: "1px solid rgba(179,18,47,0.45)",
            color: "#f87171",
            opacity: isPending || !command.trim() || isGameOver ? 0.3 : 1,
            cursor: isPending || !command.trim() || isGameOver ? "not-allowed" : "pointer",
            letterSpacing: "0.15em",
            whiteSpace: "nowrap",
          }}
          aria-label="Execute command"
        >
          Execute
        </motion.button>
      </div>
    </div>
  );
}
