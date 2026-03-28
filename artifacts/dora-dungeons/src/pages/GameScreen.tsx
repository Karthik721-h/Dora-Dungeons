import { useState, useRef, useEffect, useCallback } from "react";
import { useProcessAction, GameStateResponse } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { getGetGameStateQueryKey } from "@workspace/api-client-react";
import {
  Map, Skull, TerminalSquare, Volume2, VolumeX, Plus, Minus, Eye, Info,
} from "lucide-react";

import { AudioManager } from "@/audio/AudioManager";
import { processIntent, directionToPan } from "@/audio/IntentProcessor";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { NarrationFeed } from "@/components/NarrationFeed";
import { PlayerHUD } from "@/components/PlayerHUD";
import { VoiceControl } from "@/components/VoiceControl";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getNewLogs(prev: string[], next: string[]): string[] {
  if (next.length <= prev.length) return [];
  return next.slice(prev.length);
}

function extractDirection(cmd: string): string | null {
  const m = cmd.match(/^move\s+(north|south|east|west|up|down)$/);
  return m ? m[1]! : null;
}

// ─── Enemy HP Bar ─────────────────────────────────────────────────────────────

function EnemyBar({
  name, hp, maxHp,
}: {
  name: string; hp: number; maxHp: number;
}) {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
  const danger = pct < 30;

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span
        className="font-code shrink-0"
        style={{ color: "rgba(248,113,113,0.55)", fontSize: "8px" }}
      >
        ●
      </span>
      <span
        className="font-code truncate shrink"
        style={{ color: "rgba(248,113,113,0.8)", fontSize: "10px", minWidth: 60, maxWidth: 90 }}
      >
        {name}
      </span>
      <div
        className="flex-1 overflow-hidden"
        style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, minWidth: 40 }}
      >
        <motion.div
          style={{
            height: "100%",
            borderRadius: 2,
            background: danger
              ? "linear-gradient(to right,#7f1d1d,#ef4444)"
              : "linear-gradient(to right,#991b1b,#dc2626)",
            width: `${pct}%`,
          }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
      <span
        className="font-code shrink-0"
        style={{ color: "rgba(248,113,113,0.5)", fontSize: "9px", minWidth: 22, textAlign: "right" }}
      >
        {hp}
      </span>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GameScreen({ gameState }: { gameState: GameStateResponse }) {
  const [command, setCommand] = useState("");
  const [speechRate, setSpeechRateState] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [audioSpeaking, setAudioSpeaking] = useState(false);
  const [intentHint, setIntentHint] = useState<string | null>(null);
  const [newFromIndex, setNewFromIndex] = useState(gameState.logs.length);

  const prevLogsRef = useRef<string[]>(gameState.logs);
  const queryClient = useQueryClient();

  useEffect(() => {
    AudioManager.onStateChange(setAudioSpeaking);
  }, []);

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

  const submitCommand = useCallback((cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed || isPending) return;
    if (trimmed === "repeat") { AudioManager.repeatLast(); return; }
    if (trimmed === "look" || trimmed === "status") { sendAction({ data: { command: trimmed } }); return; }

    const dir = extractDirection(trimmed);
    if (dir && !isMuted) {
      AudioManager.playDirectionalTone(directionToPan(dir), { frequency: 520, duration: 0.14 });
    }
    sendAction({ data: { command: trimmed } });
  }, [isPending, isMuted, sendAction]);

  const { isSupported: voiceSupported, isListening, interimTranscript, toggleListening } =
    useVoiceInput({
      onFinalTranscript: (raw) => {
        if (/^(skip intro|skip|enter)$/i.test(raw.trim())) return;
        const { canonical, wasNormalized } = processIntent(raw);
        setCommand(canonical);
        if (wasNormalized) setIntentHint(`"${raw}" → "${canonical}"`);
        else setIntentHint(null);
        submitCommand(canonical);
      },
      onInterimTranscript: (interim) => setCommand(interim),
    });

  const adjustRate = (delta: number) => {
    const next = Math.max(0.5, Math.min(2.0, +(speechRate + delta).toFixed(1)));
    setSpeechRateState(next);
    AudioManager.setSpeechRate(next);
    if (!isMuted) AudioManager.speak(`Speed: ${next}`, { interrupt: true });
  };

  const toggleMute = () => {
    if (!isMuted) { AudioManager.stop(); setIsMuted(true); }
    else { setIsMuted(false); }
  };

  const { player, currentRoom, logs, gameStatus, parsedCommand } = gameState;
  const isCombat = gameStatus === "IN_COMBAT";
  const isGameOver = gameStatus === "GAME_OVER";
  const activeEnemies = currentRoom.enemies.filter(e => !e.isDefeated);

  const audioState = isListening ? "listening" : audioSpeaking ? "speaking" : "idle";

  const statusColor = isCombat
    ? { border: "rgba(179,18,47,0.5)", color: "#f87171", bg: "rgba(179,18,47,0.08)" }
    : isGameOver
    ? { border: "rgba(239,68,68,0.5)", color: "#ef4444", bg: "rgba(239,68,68,0.08)" }
    : { border: "rgba(212,175,55,0.3)", color: "rgba(212,175,55,0.7)", bg: "rgba(212,175,55,0.04)" };

  return (
    <div
      className="relative flex flex-col w-full"
      style={{ height: "100dvh", background: "#09080c", overflow: "hidden" }}
    >
      {/* ── Atmosphere layers ── */}
      <div className="vignette" />
      {isCombat && <div className="combat-overlay" />}
      <div className="scanline-overlay" />

      {/* ═══════════ TOP BAR (thin) ═══════════ */}
      <header
        className="relative z-10 flex items-center justify-between px-4 shrink-0"
        style={{
          height: 34,
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          background: "rgba(0,0,0,0.35)",
        }}
      >
        <div className="flex items-center gap-3">
          <h1
            className="font-display text-xs tracking-widest"
            style={{ color: "rgba(232,224,208,0.45)", letterSpacing: "0.3em" }}
          >
            DORA DUNGEONS
          </h1>
          <div
            className="font-code text-xs px-2 py-0"
            style={{
              border: `1px solid ${statusColor.border}`,
              color: statusColor.color,
              background: statusColor.bg,
              letterSpacing: "0.18em",
              fontSize: "9px",
              animation: isCombat ? "combat-breathe 2s infinite" : undefined,
            }}
          >
            {gameStatus.replace("_", " ")}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            className="font-code"
            style={{
              color: isListening
                ? "rgba(248,113,113,0.55)"
                : audioSpeaking
                ? "rgba(96,165,250,0.55)"
                : "rgba(200,190,180,0.18)",
              fontSize: "9px",
              letterSpacing: "0.15em",
            }}
          >
            {isListening ? "● LISTENING" : audioSpeaking ? "● SPEAKING" : "○ IDLE"}
          </span>

          <div className="flex items-center gap-1" style={{ color: "rgba(200,190,180,0.3)" }}>
            <button onClick={() => adjustRate(-0.1)} aria-label="Speak slower" className="p-0.5 hover:text-white transition-colors">
              <Minus size={9} />
            </button>
            <span className="font-code w-5 text-center" style={{ color: "rgba(200,190,180,0.4)", fontSize: "10px" }}>
              {speechRate.toFixed(1)}
            </span>
            <button onClick={() => adjustRate(0.1)} aria-label="Speak faster" className="p-0.5 hover:text-white transition-colors">
              <Plus size={9} />
            </button>
          </div>

          <button
            onClick={toggleMute}
            style={{ color: isMuted ? "rgba(200,190,180,0.18)" : "rgba(200,190,180,0.4)" }}
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
          </button>

          <div
            className="font-code hidden md:flex items-center gap-1"
            style={{ color: "rgba(200,190,180,0.15)", fontSize: "9px" }}
          >
            <TerminalSquare size={9} />
            {gameState.sessionId.slice(0, 8)}
          </div>
        </div>
      </header>

      {/* ═══════════ LOCATION STRIP (thin) ═══════════ */}
      <div
        className="relative z-10 flex items-center gap-2 px-4 shrink-0"
        style={{
          height: 28,
          borderBottom: "1px solid rgba(255,255,255,0.03)",
          background: "rgba(0,0,0,0.18)",
        }}
      >
        <Map size={10} style={{ color: "rgba(212,175,55,0.4)", flexShrink: 0 }} />
        <span
          className="font-display uppercase tracking-widest truncate"
          style={{ color: "rgba(212,175,55,0.6)", fontSize: "10px", letterSpacing: "0.18em" }}
        >
          {currentRoom.name}
        </span>

        {/* Parsed intent ghost */}
        {parsedCommand && (
          <span
            className="font-code ml-1 truncate hidden sm:block"
            style={{ color: "rgba(200,190,180,0.15)", fontSize: "9px" }}
          >
            ·&nbsp;{parsedCommand.action}{parsedCommand.direction ? ` ${parsedCommand.direction}` : ""}
          </span>
        )}

        {/* Exit buttons */}
        <div className="ml-auto flex items-center gap-1 shrink-0">
          {Object.keys(currentRoom.exits).map(dir => (
            <button
              key={dir}
              onClick={() => submitCommand(`move ${dir}`)}
              disabled={isPending || isGameOver}
              aria-label={`Move ${dir}`}
              className="font-code uppercase transition-all hover:opacity-80"
              style={{
                border: "1px solid rgba(255,255,255,0.08)",
                color: "rgba(200,190,180,0.45)",
                background: "rgba(255,255,255,0.02)",
                fontSize: "8px",
                letterSpacing: "0.12em",
                padding: "1px 6px",
                opacity: isPending || isGameOver ? 0.3 : 1,
              }}
            >
              {dir}
            </button>
          ))}
          <button
            onClick={() => submitCommand("look")}
            disabled={isPending || isGameOver}
            style={{ color: "rgba(200,190,180,0.2)", marginLeft: 2 }}
            aria-label="Look"
            title="Look"
          >
            <Eye size={10} />
          </button>
          <button
            onClick={() => submitCommand("status")}
            disabled={isPending || isGameOver}
            style={{ color: "rgba(200,190,180,0.2)" }}
            aria-label="Status"
            title="Status"
          >
            <Info size={10} />
          </button>
        </div>
      </div>

      {/* ═══════════ NARRATION FEED (dominant) ═══════════ */}
      <div className="relative z-10 flex-1 min-h-0">
        <NarrationFeed logs={logs} newFromIndex={newFromIndex} />
      </div>

      {/* ═══════════ BOTTOM HUD (compact single strip) ═══════════ */}
      <div
        className="relative z-10 flex items-stretch shrink-0"
        style={{ borderTop: "1px solid rgba(255,255,255,0.05)", background: "rgba(0,0,0,0.45)" }}
      >
        {/* LEFT: Player stats */}
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

        {/* CENTER: Enemy bars (combat) or spacer */}
        <AnimatePresence>
          {isCombat && activeEnemies.length > 0 && (
            <motion.div
              key="enemy-bars"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 180 }}
              exit={{ opacity: 0, width: 0 }}
              className="flex flex-col justify-center gap-2 px-4 py-3 overflow-hidden shrink-0"
              style={{
                borderLeft: "1px solid rgba(179,18,47,0.2)",
                borderRight: "1px solid rgba(179,18,47,0.2)",
                minWidth: 0,
              }}
            >
              <div
                className="font-code uppercase mb-0.5 flex items-center gap-1"
                style={{ color: "rgba(248,113,113,0.45)", fontSize: "8px", letterSpacing: "0.15em" }}
              >
                <Skull size={8} />
                ENEMIES
              </div>
              {activeEnemies.map(enemy => (
                <EnemyBar
                  key={enemy.id}
                  name={enemy.name}
                  hp={enemy.hp}
                  maxHp={enemy.maxHp}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* RIGHT: Voice + Actions + Command */}
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
