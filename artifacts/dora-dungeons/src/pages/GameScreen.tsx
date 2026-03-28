import { useState, useRef, useEffect, useCallback } from "react";
import { useProcessAction, GameStateResponse } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { getGetGameStateQueryKey } from "@workspace/api-client-react";
import { Map, Skull, TerminalSquare, Volume2, VolumeX, Plus, Minus, Eye, Info } from "lucide-react";

import { AudioManager } from "@/audio/AudioManager";
import { processIntent, directionToPan } from "@/audio/IntentProcessor";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { NarrationFeed } from "@/components/NarrationFeed";
import { PlayerHUD } from "@/components/PlayerHUD";
import { VoiceControl } from "@/components/VoiceControl";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getNewLogs(prev: string[], next: string[]): string[] {
  if (next.length <= prev.length) return [];
  return next.slice(prev.length);
}

function extractDirection(cmd: string): string | null {
  const m = cmd.match(/^move\s+(north|south|east|west|up|down)$/);
  return m ? m[1]! : null;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function GameScreen({ gameState }: { gameState: GameStateResponse }) {
  const [command, setCommand] = useState("");
  const [speechRate, setSpeechRateState] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [audioSpeaking, setAudioSpeaking] = useState(false);
  const [intentHint, setIntentHint] = useState<string | null>(null);
  const [newFromIndex, setNewFromIndex] = useState(gameState.logs.length);

  const prevLogsRef = useRef<string[]>(gameState.logs);
  const queryClient = useQueryClient();

  // Hook up AudioManager state listener
  useEffect(() => {
    AudioManager.onStateChange(setAudioSpeaking);
  }, []);

  // ── Mutation ────────────────────────────────────────────────────────────────
  const { mutate: sendAction, isPending } = useProcessAction({
    mutation: {
      onSuccess: (newData) => {
        queryClient.setQueryData(getGetGameStateQueryKey(), newData);
        setCommand("");
        setIntentHint(null);

        const prevLen = prevLogsRef.current.length;
        const newLines = getNewLogs(prevLogsRef.current, newData.logs);
        prevLogsRef.current = newData.logs;
        setNewFromIndex(prevLen);

        if (!isMuted && newLines.length > 0) {
          AudioManager.speakLines(newLines, { interrupt: true });
        }
        if (!isMuted) {
          if (newData.gameStatus === "IN_COMBAT" && gameState.gameStatus !== "IN_COMBAT") {
            AudioManager.playCombatAlert();
          }
          if (newLines.some(l => l.toLowerCase().includes("experience") || l.toLowerCase().includes("level"))) {
            AudioManager.playRewardChime();
          }
        }
      },
    },
  });

  // ── Submit command ──────────────────────────────────────────────────────────
  const submitCommand = useCallback((cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed || isPending) return;

    if (trimmed === "repeat") {
      AudioManager.repeatLast();
      return;
    }

    if (trimmed === "look" || trimmed === "status") {
      sendAction({ data: { command: trimmed } });
      return;
    }

    const dir = extractDirection(trimmed);
    if (dir && !isMuted) {
      AudioManager.playDirectionalTone(directionToPan(dir), { frequency: 520, duration: 0.14 });
    }

    sendAction({ data: { command: trimmed } });
  }, [isPending, isMuted, sendAction]);

  // ── Voice ───────────────────────────────────────────────────────────────────
  const { isSupported: voiceSupported, isListening, interimTranscript, toggleListening } =
    useVoiceInput({
      onFinalTranscript: (raw) => {
        // Handle "skip intro" or "repeat" directly
        if (/^(skip intro|skip|enter)$/i.test(raw.trim())) return;
        const { canonical, wasNormalized } = processIntent(raw);
        setCommand(canonical);
        if (wasNormalized) setIntentHint(`"${raw}" → "${canonical}"`);
        else setIntentHint(null);
        submitCommand(canonical);
      },
      onInterimTranscript: (interim) => setCommand(interim),
    });

  // ── Speech rate ─────────────────────────────────────────────────────────────
  const adjustRate = (delta: number) => {
    const next = Math.max(0.5, Math.min(2.0, +(speechRate + delta).toFixed(1)));
    setSpeechRateState(next);
    AudioManager.setSpeechRate(next);
    if (!isMuted) AudioManager.speak(`Speed: ${next}`, { interrupt: true });
  };

  const toggleMute = () => {
    if (!isMuted) {
      AudioManager.stop();
      setIsMuted(true);
    } else {
      setIsMuted(false);
    }
  };

  const { player, currentRoom, logs, gameStatus, parsedCommand } = gameState;
  const isCombat = gameStatus === "IN_COMBAT";
  const isGameOver = gameStatus === "GAME_OVER";

  const audioState = isListening ? "listening" : audioSpeaking ? "speaking" : "idle";

  const statusColor = isCombat
    ? { border: "rgba(179,18,47,0.5)", color: "#f87171", bg: "rgba(179,18,47,0.08)" }
    : isGameOver
    ? { border: "rgba(239,68,68,0.5)", color: "#ef4444", bg: "rgba(239,68,68,0.08)" }
    : { border: "rgba(212,175,55,0.35)", color: "rgba(212,175,55,0.8)", bg: "rgba(212,175,55,0.05)" };

  return (
    <div
      className="relative flex flex-col min-h-screen w-full"
      style={{ background: "#09080c", overflow: "hidden" }}
    >
      {/* ── Vignette ── */}
      <div className="vignette" />

      {/* ── Combat red overlay ── */}
      {isCombat && <div className="combat-overlay" />}

      {/* ── Scanline ── */}
      <div className="scanline-overlay" />

      {/* ═══════════ TOP BAR ═══════════ */}
      <header
        className="relative z-10 flex items-center justify-between px-5 py-2"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", background: "rgba(0,0,0,0.3)" }}
      >
        {/* Left: title + status */}
        <div className="flex items-center gap-3">
          <h1
            className="font-display text-sm tracking-widest"
            style={{ color: "rgba(232,224,208,0.6)", letterSpacing: "0.3em" }}
          >
            DORA DUNGEONS
          </h1>
          <div
            className="font-code text-xs px-2 py-0.5 uppercase tracking-widest"
            style={{
              border: `1px solid ${statusColor.border}`,
              color: statusColor.color,
              background: statusColor.bg,
              letterSpacing: "0.2em",
              fontSize: "10px",
              animation: isCombat ? "combat-breathe 2s infinite" : undefined,
            }}
          >
            {gameStatus.replace("_", " ")}
          </div>
        </div>

        {/* Right: audio controls */}
        <div className="flex items-center gap-3">
          {/* Audio indicator */}
          <div
            className="font-code text-xs uppercase tracking-widest"
            style={{
              color: isListening
                ? "rgba(248,113,113,0.6)"
                : audioSpeaking
                ? "rgba(96,165,250,0.6)"
                : "rgba(200,190,180,0.2)",
              fontSize: "10px",
              letterSpacing: "0.2em",
            }}
          >
            {isListening ? "● LISTENING" : audioSpeaking ? "● SPEAKING" : "○ IDLE"}
          </div>

          {/* Rate */}
          <div className="flex items-center gap-1" style={{ color: "rgba(200,190,180,0.35)" }}>
            <button
              onClick={() => adjustRate(-0.1)}
              className="p-0.5 hover:text-white transition-colors"
              aria-label="Speak slower"
              style={{ fontSize: "12px" }}
            >
              <Minus size={10} />
            </button>
            <span className="font-code text-xs w-6 text-center" style={{ color: "rgba(200,190,180,0.45)", fontSize: "11px" }}>
              {speechRate.toFixed(1)}
            </span>
            <button
              onClick={() => adjustRate(0.1)}
              className="p-0.5 hover:text-white transition-colors"
              aria-label="Speak faster"
              style={{ fontSize: "12px" }}
            >
              <Plus size={10} />
            </button>
          </div>

          {/* Mute */}
          <button
            onClick={toggleMute}
            className="transition-colors"
            style={{ color: isMuted ? "rgba(200,190,180,0.2)" : "rgba(200,190,180,0.45)" }}
            aria-label={isMuted ? "Unmute" : "Mute audio"}
          >
            {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>

          {/* Session */}
          <div
            className="font-code hidden md:flex items-center gap-1"
            style={{ color: "rgba(200,190,180,0.2)", fontSize: "10px" }}
          >
            <TerminalSquare size={10} />
            {gameState.sessionId.slice(0, 8)}
          </div>
        </div>
      </header>

      {/* ═══════════ MAIN AREA ═══════════ */}
      <div className="relative z-10 flex flex-col flex-1 overflow-hidden" style={{ minHeight: 0 }}>

        {/* ── Location strip (thin) ── */}
        <div
          className="px-5 py-2 flex items-center gap-3"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}
        >
          <Map size={12} style={{ color: "rgba(212,175,55,0.5)" }} />
          <span
            className="font-display text-xs tracking-widest uppercase"
            style={{ color: "rgba(212,175,55,0.65)", letterSpacing: "0.2em", fontSize: "11px" }}
          >
            {currentRoom.name}
          </span>
          {currentRoom.enemies.filter(e => !e.isDefeated).length > 0 && (
            <>
              <span style={{ color: "rgba(255,255,255,0.1)" }}>·</span>
              <Skull size={11} style={{ color: "rgba(248,113,113,0.5)" }} />
              <span
                className="font-code text-xs"
                style={{ color: "rgba(248,113,113,0.5)", fontSize: "11px" }}
              >
                {currentRoom.enemies.filter(e => !e.isDefeated).map(e => `${e.name} ${e.hp}HP`).join(", ")}
              </span>
            </>
          )}
          <div className="ml-auto flex gap-1.5">
            {Object.keys(currentRoom.exits).map(dir => (
              <button
                key={dir}
                onClick={() => submitCommand(`move ${dir}`)}
                disabled={isPending || isGameOver}
                className="font-code text-xs uppercase px-2 py-0.5 transition-all hover:scale-105"
                style={{
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "rgba(200,190,180,0.5)",
                  background: "rgba(255,255,255,0.02)",
                  fontSize: "10px",
                  letterSpacing: "0.15em",
                }}
                aria-label={`Move ${dir}`}
              >
                {dir}
              </button>
            ))}
            <button
              onClick={() => submitCommand("look")}
              disabled={isPending || isGameOver}
              className="ml-1 transition-colors"
              style={{ color: "rgba(200,190,180,0.25)" }}
              aria-label="Look around"
              title="Look around"
            >
              <Eye size={12} />
            </button>
            <button
              onClick={() => submitCommand("status")}
              disabled={isPending || isGameOver}
              className="transition-colors"
              style={{ color: "rgba(200,190,180,0.25)" }}
              aria-label="Show status"
              title="Show status"
            >
              <Info size={12} />
            </button>
          </div>
        </div>

        {/* ── Narration Feed ── */}
        <NarrationFeed logs={logs} newFromIndex={newFromIndex} />

        {/* ── Parsed command debug (hidden when clean) ── */}
        {parsedCommand && (
          <div
            className="px-5 py-1 flex items-center gap-3"
            style={{ borderTop: "1px solid rgba(255,255,255,0.03)" }}
          >
            <span className="font-code text-xs" style={{ color: "rgba(200,190,180,0.2)", fontSize: "10px", letterSpacing: "0.15em" }}>
              {parsedCommand.action}
              {parsedCommand.direction ? ` · ${parsedCommand.direction}` : ""}
              {parsedCommand.target ? ` · ${parsedCommand.target}` : ""}
            </span>
          </div>
        )}
      </div>

      {/* ═══════════ BOTTOM HUD ═══════════ */}
      <div
        className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-3 p-3 shrink-0"
        style={{ borderTop: "1px solid rgba(255,255,255,0.04)", background: "rgba(0,0,0,0.35)" }}
      >
        {/* Left: Player HUD */}
        <PlayerHUD
          name={player.name}
          level={player.level}
          hp={player.hp}
          maxHp={player.maxHp}
          mp={player.mp}
          maxMp={player.maxMp}
          xp={player.xp}
          xpToNextLevel={player.xpToNextLevel}
          attack={player.attack}
          defense={player.defense}
          isCombat={isCombat}
        />

        {/* Right: Voice + Controls */}
        <VoiceControl
          isSupported={voiceSupported}
          audioState={audioState}
          isListening={isListening}
          interimTranscript={interimTranscript}
          intentHint={intentHint}
          isPending={isPending}
          isGameOver={isGameOver}
          isCombat={isCombat}
          command={command}
          onCommandChange={setCommand}
          onSubmit={submitCommand}
          onToggleListen={toggleListening}
        />
      </div>

      {/* ── Game over overlay ── */}
      <AnimatePresence>
        {isGameOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center"
            style={{ background: "rgba(5,3,8,0.88)", backdropFilter: "blur(4px)" }}
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
              className="text-center space-y-4"
            >
              <div className="rune-divider w-48 mx-auto">✦</div>
              <h2
                className="font-display text-5xl font-black tracking-widest"
                style={{
                  color: "#b3122f",
                  textShadow: "0 0 40px rgba(179,18,47,0.6), 0 0 80px rgba(179,18,47,0.2)",
                }}
              >
                FALLEN
              </h2>
              <p className="font-narration italic text-xl" style={{ color: "rgba(212,175,55,0.7)" }}>
                The dungeon claims another soul.
              </p>
              <div className="rune-divider w-48 mx-auto">✦</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
