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

function Btn({
  icon, label, onClick, disabled, hot,
}: {
  icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; hot?: boolean;
}) {
  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.06 }}
      whileTap={{ scale: disabled ? 1 : 0.93 }}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="flex flex-col items-center justify-center gap-0.5 rounded-sm transition-all"
      style={{
        width: 40, height: 40,
        background: hot ? "rgba(179,18,47,0.12)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${hot ? "rgba(179,18,47,0.35)" : "rgba(255,255,255,0.08)"}`,
        color: hot ? "#f87171" : "rgba(200,190,180,0.6)",
        opacity: disabled ? 0.25 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <span style={{ fontSize: 13 }}>{icon}</span>
      <span className="font-code" style={{ fontSize: "7px", letterSpacing: "0.05em", opacity: 0.6 }}>
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
    if (e.key === "Enter" && !isPending && command.trim()) onSubmit(command);
  };

  return (
    <div
      className="flex flex-col justify-center gap-2 flex-1 px-3 py-3"
      style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
    >
      {/* Action buttons row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Combat actions (only in combat) */}
        {isCombat && (
          <>
            <Btn icon={<Swords size={13} />} label="ATK" onClick={() => onSubmit("attack")} disabled={isPending || isGameOver} hot />
            <Btn icon={<Shield size={13} />} label="DEF" onClick={() => onSubmit("defend")} disabled={isPending || isGameOver} />
            <Btn icon={<Flame size={13} />} label="MAG" onClick={() => onSubmit("cast fireball")} disabled={isPending || isGameOver} />
            <Btn icon={<Zap size={13} />} label="FLEE" onClick={() => onSubmit("flee")} disabled={isPending || isGameOver} />
            <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.06)", margin: "0 2px" }} />
          </>
        )}

        {/* Movement */}
        <Btn icon={<ArrowLeft size={12} />} label="W" onClick={() => onSubmit("move west")} disabled={isPending || isGameOver} />
        <div className="flex flex-col gap-1">
          <motion.button
            whileHover={{ scale: isPending || isGameOver ? 1 : 1.06 }}
            whileTap={{ scale: isPending || isGameOver ? 1 : 0.93 }}
            onClick={() => onSubmit("move north")}
            disabled={isPending || isGameOver}
            aria-label="Move North"
            title="Move North"
            style={{
              width: 38, height: 17,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(200,190,180,0.6)",
              opacity: isPending || isGameOver ? 0.25 : 1,
              cursor: isPending || isGameOver ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10,
            }}
          >
            <ArrowUp size={10} />
          </motion.button>
          <motion.button
            whileHover={{ scale: isPending || isGameOver ? 1 : 1.06 }}
            whileTap={{ scale: isPending || isGameOver ? 1 : 0.93 }}
            onClick={() => onSubmit("move south")}
            disabled={isPending || isGameOver}
            aria-label="Move South"
            title="Move South"
            style={{
              width: 38, height: 17,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(200,190,180,0.6)",
              opacity: isPending || isGameOver ? 0.25 : 1,
              cursor: isPending || isGameOver ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10,
            }}
          >
            <ArrowDown size={10} />
          </motion.button>
        </div>
        <Btn icon={<ArrowRight size={12} />} label="E" onClick={() => onSubmit("move east")} disabled={isPending || isGameOver} />

        <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.06)", margin: "0 2px" }} />

        {/* Repeat */}
        <Btn icon={<RotateCcw size={12} />} label="REP" onClick={() => AudioManager.repeatLast()} disabled={false} />
      </div>

      {/* Transcript hint */}
      <AnimatePresence>
        {(interimTranscript || intentHint) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="font-narration italic text-xs"
            style={{ color: "rgba(212,175,55,0.6)", lineHeight: 1.3 }}
          >
            {interimTranscript ? `"${interimTranscript}"` : intentHint}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Command input row */}
      <div className="flex items-center gap-2">
        <span className="font-code shrink-0" style={{ color: "rgba(179,18,47,0.5)", fontSize: 13 }}>›</span>
        <input
          type="text"
          value={command}
          onChange={(e) => onCommandChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isPending || isGameOver}
          placeholder={isListening ? "Listening…" : "command…"}
          autoComplete="off"
          spellCheck="false"
          className="command-input flex-1 py-1.5 px-2 font-code text-sm disabled:opacity-30"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "#e8e0d0",
            outline: "none",
            fontSize: 13,
          }}
          aria-label="Game command"
        />

        {/* Mic */}
        {isSupported && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onToggleListen}
            disabled={isGameOver}
            aria-label={isListening ? "Stop voice" : "Start voice"}
            title={isListening ? "Stop listening" : "Speak a command"}
            className={`shrink-0 rounded-full flex items-center justify-center transition-all ${
              isListening ? "mic-listening" : audioState === "speaking" ? "mic-speaking" : ""
            }`}
            style={{
              width: 36, height: 36,
              background: isListening
                ? "rgba(179,18,47,0.2)"
                : audioState === "speaking"
                ? "rgba(59,130,246,0.15)"
                : "rgba(255,255,255,0.04)",
              border: `1.5px solid ${isListening ? "rgba(179,18,47,0.7)" : audioState === "speaking" ? "rgba(59,130,246,0.5)" : "rgba(255,255,255,0.1)"}`,
              color: isListening ? "#f87171" : audioState === "speaking" ? "#60a5fa" : "rgba(200,190,180,0.4)",
              opacity: isGameOver ? 0.3 : 1,
            }}
          >
            {isListening ? <Mic size={15} /> : <MicOff size={15} />}
          </motion.button>
        )}

        {/* Execute */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => { if (command.trim()) onSubmit(command); }}
          disabled={isPending || !command.trim() || isGameOver}
          className="shrink-0 font-display text-xs tracking-widest px-3 py-1.5 transition-all"
          style={{
            background: "rgba(179,18,47,0.14)",
            border: "1px solid rgba(179,18,47,0.4)",
            color: "#f87171",
            opacity: isPending || !command.trim() || isGameOver ? 0.25 : 1,
            cursor: isPending || !command.trim() || isGameOver ? "not-allowed" : "pointer",
            letterSpacing: "0.12em",
            fontSize: 10,
          }}
          aria-label="Execute"
        >
          GO
        </motion.button>
      </div>
    </div>
  );
}
