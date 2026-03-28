import { useState, useRef, useEffect, useCallback } from "react";
import { useProcessAction, GameStateResponse } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { TerminalPanel } from "@/components/TerminalPanel";
import { StatBar } from "@/components/StatBar";
import { TerminalButton } from "@/components/TerminalButton";
import { motion, AnimatePresence } from "framer-motion";
import { getGetGameStateQueryKey } from "@workspace/api-client-react";
import {
  Shield, Swords, Map, Zap, Skull, ChevronRight, TerminalSquare,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Eye, Info, Flame,
  Mic, MicOff, Volume2, VolumeX, Plus, Minus, RotateCcw,
} from "lucide-react";

import { AudioManager } from "@/audio/AudioManager";
import { processIntent, directionToPan } from "@/audio/IntentProcessor";
import { useVoiceInput } from "@/hooks/useVoiceInput";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getNewLogs(prev: string[], next: string[]): string[] {
  if (next.length <= prev.length) return [];
  return next.slice(prev.length);
}

function extractDirection(command: string): string | null {
  const m = command.match(/^move\s+(north|south|east|west|up|down)$/);
  return m ? m[1]! : null;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function GameScreen({ gameState }: { gameState: GameStateResponse }) {
  const [command, setCommand] = useState("");
  const [speechRate, setSpeechRateState] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [audioSpeaking, setAudioSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [intentHint, setIntentHint] = useState<string | null>(null);

  const logEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevLogsRef = useRef<string[]>(gameState.logs);
  const queryClient = useQueryClient();

  // ── TTS state listener ───────────────────────────────────────────────────
  useEffect(() => {
    AudioManager.onStateChange(setAudioSpeaking);
  }, []);

  // ── Speech rate ──────────────────────────────────────────────────────────
  const adjustRate = (delta: number) => {
    const next = Math.max(0.5, Math.min(2.0, +(speechRate + delta).toFixed(1)));
    setSpeechRateState(next);
    AudioManager.setSpeechRate(next);
    AudioManager.speak(`Speech rate: ${next}`, { interrupt: true });
  };

  // ── Mute toggle ──────────────────────────────────────────────────────────
  const toggleMute = () => {
    if (!isMuted) {
      AudioManager.stop();
      setIsMuted(true);
    } else {
      setIsMuted(false);
      AudioManager.speak("Audio enabled.", { interrupt: false });
    }
  };

  // ── Action mutation ──────────────────────────────────────────────────────
  const { mutate: sendAction, isPending } = useProcessAction({
    mutation: {
      onSuccess: (newData) => {
        queryClient.setQueryData(getGetGameStateQueryKey(), newData);
        setCommand("");
        setIntentHint(null);
        setTimeout(() => inputRef.current?.focus(), 10);

        if (!isMuted) {
          const newLines = getNewLogs(prevLogsRef.current, newData.logs);
          prevLogsRef.current = newData.logs;
          if (newLines.length > 0) {
            AudioManager.speakLines(newLines, { interrupt: true });
          }
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

  // Keep prevLogs in sync when gameState changes externally
  useEffect(() => {
    prevLogsRef.current = gameState.logs;
  }, []);

  // ── Submit a canonical command string ────────────────────────────────────
  const submitCommand = useCallback((cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed || isPending) return;

    if (trimmed === "repeat") {
      AudioManager.repeatLast();
      return;
    }

    const dir = extractDirection(trimmed);
    if (dir && !isMuted) {
      const pan = directionToPan(dir);
      AudioManager.playDirectionalTone(pan, { frequency: 520, duration: 0.14 });
    }

    sendAction({ data: { command: trimmed } });
  }, [isPending, isMuted, sendAction]);

  // ── Text input form submit ───────────────────────────────────────────────
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitCommand(command);
  };

  // ── Quick macro buttons ──────────────────────────────────────────────────
  const handleQuickAction = (actionCmd: string) => {
    submitCommand(actionCmd);
  };

  // ── Voice input ──────────────────────────────────────────────────────────
  const { isSupported: voiceSupported, isListening, interimTranscript, toggleListening } =
    useVoiceInput({
      onFinalTranscript: (raw) => {
        const { canonical, wasNormalized } = processIntent(raw);
        setCommand(canonical);
        if (wasNormalized) {
          setIntentHint(`"${raw}" → "${canonical}"`);
        }
        setVoiceError(null);
        submitCommand(canonical);
      },
      onInterimTranscript: (interim) => {
        setCommand(interim);
      },
      onError: (err) => {
        setVoiceError(err);
      },
    });

  // ── Auto-scroll logs ─────────────────────────────────────────────────────
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [gameState.logs]);

  const { player, currentRoom, logs, gameStatus, parsedCommand } = gameState;
  const isCombat = gameStatus === "IN_COMBAT";
  const isGameOver = gameStatus === "GAME_OVER";

  // ─── Audio status label ────────────────────────────────────────────────
  const audioStatusLabel = isListening
    ? "LISTENING"
    : audioSpeaking
    ? "SPEAKING"
    : "SILENT";

  const audioStatusColor = isListening
    ? "border-green-500 text-green-500 bg-green-500/10"
    : audioSpeaking
    ? "border-blue-400 text-blue-400 bg-blue-400/10"
    : "border-border text-muted-foreground";

  return (
    <div className="min-h-screen w-full bg-background p-2 md:p-4 lg:p-6 flex flex-col relative z-10">

      {/* ── Header ── */}
      <header className="flex flex-wrap justify-between items-center mb-4 pb-2 border-b border-border/50 gap-2">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-xl text-foreground tracking-widest terminal-text">DORA DUNGEONS</h1>
          <div className={`px-2 py-0.5 text-xs font-mono font-bold uppercase tracking-wider border ${
            isCombat ? "border-primary text-primary bg-primary/10 animate-pulse" :
            isGameOver ? "border-destructive text-destructive bg-destructive/10" :
            "border-accent text-accent bg-accent/10"
          }`}>
            {gameStatus.replace("_", " ")}
          </div>
          {/* Audio Status Indicator */}
          <div className={`px-2 py-0.5 text-xs font-mono font-bold uppercase tracking-wider border transition-all ${audioStatusColor}`}>
            {audioStatusLabel}
          </div>
        </div>

        {/* Right side: session info + audio rate controls */}
        <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
          <div className="flex items-center gap-1">
            <TerminalSquare className="w-4 h-4" />
            SESSION: <span className="text-foreground">{gameState.sessionId.slice(0, 8)}</span>
            <span className="mx-2 opacity-30">|</span>
            TURN: <span className="text-foreground">{gameState.turnCount}</span>
          </div>

          {/* Speech rate controls */}
          <div className="flex items-center gap-1 border border-border/40 px-2 py-0.5">
            <span className="text-muted-foreground/60 text-[10px] uppercase tracking-wider">RATE</span>
            <button
              onClick={() => adjustRate(-0.1)}
              className="text-foreground hover:text-primary transition-colors p-0.5"
              aria-label="Decrease speech rate"
              title="Speak slower"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="text-foreground w-6 text-center">{speechRate.toFixed(1)}</span>
            <button
              onClick={() => adjustRate(0.1)}
              className="text-foreground hover:text-primary transition-colors p-0.5"
              aria-label="Increase speech rate"
              title="Speak faster"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          {/* Mute toggle */}
          <button
            onClick={toggleMute}
            className={`p-1.5 border transition-colors ${isMuted ? "border-muted-foreground/20 text-muted-foreground/30" : "border-blue-500/40 text-blue-400 hover:bg-blue-500/10"}`}
            aria-label={isMuted ? "Unmute audio" : "Mute audio"}
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* ── Main Grid ── */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 h-full max-h-[calc(100vh-110px)]">

        {/* ── LEFT: Logs + Input ── */}
        <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-3 min-h-[50vh]">

          {/* Terminal Log */}
          <TerminalPanel title="TERMINAL OUTPUT" className="flex-1" glow={isCombat}>
            <div
              className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3 font-mono text-sm md:text-base leading-relaxed scroll-smooth"
              role="log"
              aria-live="polite"
              aria-label="Game output"
            >
              {logs.map((log, i) => {
                const isSystem = log.startsWith(">");
                const isDanger = log.toLowerCase().includes("damage") || log.toLowerCase().includes("attack");
                const isSuccess = log.toLowerCase().includes("defeated") || log.toLowerCase().includes("found") || log.toLowerCase().includes("experience");
                return (
                  <motion.div
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    key={i}
                    className={`
                      ${isSystem ? "text-primary/80 font-bold mb-4 mt-6" : "text-foreground/90"}
                      ${isDanger && !isSystem ? "text-primary" : ""}
                      ${isSuccess && !isSystem ? "text-accent" : ""}
                    `}
                  >
                    {log}
                  </motion.div>
                );
              })}
              <div ref={logEndRef} className="h-4" />
            </div>

            {/* Parsed command debug strip */}
            {parsedCommand && (
              <div className="px-4 py-2 bg-secondary/30 border-t border-border/30 text-xs font-mono text-muted-foreground flex items-center gap-2">
                <span className="text-primary/70">LAST_PARSE:</span>
                <span className="text-foreground uppercase">{parsedCommand.action}</span>
                {parsedCommand.target && <span className="text-accent">TARGET:{parsedCommand.target}</span>}
                {parsedCommand.direction && <span className="text-blue-400">DIR:{parsedCommand.direction}</span>}
              </div>
            )}
          </TerminalPanel>

          {/* ── Voice transcript strip ── */}
          <AnimatePresence>
            {(isListening || interimTranscript || intentHint || voiceError) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className={`px-4 py-2 border font-mono text-xs flex items-start gap-2 ${
                  voiceError
                    ? "border-destructive/50 bg-destructive/10 text-destructive"
                    : isListening
                    ? "border-green-500/40 bg-green-500/5 text-green-400"
                    : "border-border/40 bg-secondary/20 text-muted-foreground"
                }`}
              >
                {voiceError ? (
                  <><Skull className="w-4 h-4 mt-0.5 shrink-0" /><span>{voiceError}</span></>
                ) : (
                  <>
                    <Mic className="w-4 h-4 mt-0.5 shrink-0 animate-pulse" />
                    <div className="flex flex-col gap-0.5">
                      {interimTranscript && (
                        <span className="italic text-foreground/60">"{interimTranscript}"</span>
                      )}
                      {intentHint && (
                        <span className="text-accent/80">Intent: {intentHint}</span>
                      )}
                      {!interimTranscript && !intentHint && isListening && (
                        <span className="text-green-400/70">Listening... Speak a command.</span>
                      )}
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Command Input ── */}
          <form onSubmit={handleSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <ChevronRight className="h-5 w-5 text-primary" />
              </div>
              <input
                ref={inputRef}
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                disabled={isPending || isGameOver}
                className="block w-full bg-card border-2 border-border pl-10 pr-4 py-4 text-lg font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-colors disabled:opacity-50"
                placeholder={isListening ? "Listening for voice command..." : "Enter command (e.g. 'move north', 'attack goblin')..."}
                autoComplete="off"
                spellCheck="false"
                autoFocus
                aria-label="Game command input"
              />
            </div>

            {/* Repeat last */}
            <button
              type="button"
              onClick={() => AudioManager.repeatLast()}
              className="px-3 border border-border/40 text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
              title="Repeat last narration"
              aria-label="Repeat last spoken message"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Mic toggle */}
            {voiceSupported && (
              <button
                type="button"
                onClick={toggleListening}
                disabled={isGameOver}
                className={`px-4 border-2 transition-all font-mono text-sm font-bold ${
                  isListening
                    ? "border-green-500 text-green-400 bg-green-500/10 animate-pulse"
                    : "border-border text-muted-foreground hover:border-green-500/50 hover:text-green-400"
                }`}
                title={isListening ? "Stop listening (click to stop)" : "Start voice input"}
                aria-label={isListening ? "Stop voice input" : "Start voice input"}
              >
                {isListening ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </button>
            )}

            <TerminalButton
              type="submit"
              variant="primary"
              size="lg"
              disabled={isPending || !command.trim() || isGameOver}
              className="px-8"
            >
              EXECUTE
            </TerminalButton>
          </form>

          {/* Unsupported warning */}
          {!voiceSupported && (
            <p className="text-xs font-mono text-muted-foreground/50 px-1">
              Voice input unavailable in this browser. Use Chrome or Edge for full audio experience.
            </p>
          )}
        </div>

        {/* ── RIGHT: State Panels ── */}
        <div className="lg:col-span-4 xl:col-span-3 flex flex-col gap-4 overflow-y-auto pr-1">

          {/* Player Stats */}
          <TerminalPanel title="ENTITY_STATUS: PLAYER">
            <div className="p-4 space-y-4">
              <div className="flex justify-between items-center mb-2">
                <h2 className="font-display font-bold text-lg text-primary">{player.name}</h2>
                <span className="text-xs font-mono text-muted-foreground border border-border px-2 py-1">LVL {player.level}</span>
              </div>
              <div className="space-y-3">
                <StatBar label="INTEGRITY (HP)" value={player.hp} max={player.maxHp} colorClass="bg-primary" />
                <StatBar label="AETHER (MP)" value={player.mp} max={player.maxMp} colorClass="bg-blue-500" />
                <StatBar label="EXPERIENCE" value={player.xp} max={player.xpToNextLevel} colorClass="bg-accent" />
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50 mt-4">
                <div className="flex items-center gap-2 text-sm font-mono text-muted-foreground">
                  <Swords className="w-4 h-4 text-foreground" /> ATK: <span className="text-foreground">{player.attack}</span>
                </div>
                <div className="flex items-center gap-2 text-sm font-mono text-muted-foreground">
                  <Shield className="w-4 h-4 text-foreground" /> DEF: <span className="text-foreground">{player.defense}</span>
                </div>
              </div>
            </div>
          </TerminalPanel>

          {/* Location */}
          <TerminalPanel title="LOCATION_DATA">
            <div className="p-4 flex flex-col gap-4">
              <div>
                <h3 className="font-mono font-bold text-foreground mb-1 flex items-center gap-2">
                  <Map className="w-4 h-4 text-primary" /> {currentRoom.name}
                </h3>
                <p className="text-sm text-muted-foreground font-mono leading-relaxed line-clamp-3" title={currentRoom.description}>
                  {currentRoom.description}
                </p>
              </div>

              <div className="space-y-1">
                <div className="text-xs text-primary font-bold uppercase tracking-widest">Available Paths</div>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(currentRoom.exits).length > 0 ? (
                    Object.keys(currentRoom.exits).map(dir => (
                      <button
                        key={dir}
                        onClick={() => handleQuickAction(`move ${dir}`)}
                        disabled={isPending || isGameOver}
                        className="text-xs bg-secondary border border-border px-2 py-1 uppercase font-mono text-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title={`Move ${dir}`}
                        aria-label={`Move ${dir}`}
                      >
                        {dir}
                      </button>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground italic">No obvious exits</span>
                  )}
                </div>
              </div>

              {currentRoom.enemies.length > 0 && (
                <div className="space-y-2 mt-2 pt-3 border-t border-border/50">
                  <div className="text-xs text-destructive font-bold uppercase tracking-widest flex items-center gap-2">
                    <Skull className="w-3 h-3" /> Hostiles Detected
                  </div>
                  <div className="space-y-2">
                    {currentRoom.enemies.map(enemy => (
                      <div key={enemy.id} className={`flex flex-col p-2 border ${enemy.isDefeated ? "border-border/30 opacity-50" : "border-destructive/30 bg-destructive/5"}`}>
                        <div className="flex justify-between items-center mb-1">
                          <span className={`font-mono text-sm ${enemy.isDefeated ? "line-through" : "text-destructive"}`}>
                            {enemy.name}
                          </span>
                          {!enemy.isDefeated && <span className="text-xs font-mono">{enemy.hp}/{enemy.maxHp} HP</span>}
                        </div>
                        {!enemy.isDefeated && (
                          <div className="h-1 w-full bg-secondary overflow-hidden">
                            <div className="h-full bg-destructive" style={{ width: `${(enemy.hp / enemy.maxHp) * 100}%` }} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TerminalPanel>

          {/* Quick Actions */}
          <TerminalPanel title="QUICK_MACROS" className="flex-1 min-h-[200px]">
            <div className="p-3 grid grid-cols-3 gap-2">
              <div className="col-span-3 text-xs text-muted-foreground/50 text-center mb-1">MOVEMENT</div>
              <TerminalButton variant="action" size="sm" onClick={() => handleQuickAction("move west")} disabled={isPending || isGameOver} title="Move West">
                <ArrowLeft className="w-4 h-4" />
              </TerminalButton>
              <div className="flex flex-col gap-2">
                <TerminalButton variant="action" size="sm" onClick={() => handleQuickAction("move north")} disabled={isPending || isGameOver} title="Move North">
                  <ArrowUp className="w-4 h-4" />
                </TerminalButton>
                <TerminalButton variant="action" size="sm" onClick={() => handleQuickAction("move south")} disabled={isPending || isGameOver} title="Move South">
                  <ArrowDown className="w-4 h-4" />
                </TerminalButton>
              </div>
              <TerminalButton variant="action" size="sm" onClick={() => handleQuickAction("move east")} disabled={isPending || isGameOver} title="Move East">
                <ArrowRight className="w-4 h-4" />
              </TerminalButton>

              <div className="col-span-3 text-xs text-muted-foreground/50 text-center mt-2 mb-1 border-t border-border/30 pt-2">COMBAT & EXPLORATION</div>
              <TerminalButton variant="action" size="sm" className="col-span-1 border-primary/30 text-primary hover:bg-primary/10" onClick={() => handleQuickAction("attack")} disabled={isPending || isGameOver || !isCombat}>
                <Swords className="w-4 h-4 mr-1" /> ATK
              </TerminalButton>
              <TerminalButton variant="action" size="sm" className="col-span-1 border-blue-500/30 text-blue-500 hover:bg-blue-500/10" onClick={() => handleQuickAction("cast fireball")} disabled={isPending || isGameOver || !isCombat}>
                <Flame className="w-4 h-4 mr-1" /> MAG
              </TerminalButton>
              <TerminalButton variant="action" size="sm" className="col-span-1" onClick={() => handleQuickAction("defend")} disabled={isPending || isGameOver || !isCombat}>
                <Shield className="w-4 h-4 mr-1" /> DEF
              </TerminalButton>

              <TerminalButton variant="action" size="sm" className="col-span-2" onClick={() => handleQuickAction("look")} disabled={isPending || isGameOver}>
                <Eye className="w-4 h-4 mr-2" /> EXAMINE
              </TerminalButton>
              <TerminalButton variant="action" size="sm" className="col-span-1" onClick={() => handleQuickAction("status")} disabled={isPending || isGameOver}>
                <Info className="w-4 h-4" />
              </TerminalButton>

              <div className="col-span-3 border-t border-border/30 pt-2 mt-1">
                <TerminalButton
                  variant="action"
                  size="sm"
                  className="col-span-3 w-full border-blue-500/20 text-blue-400 hover:bg-blue-500/10"
                  onClick={() => AudioManager.repeatLast()}
                >
                  <RotateCcw className="w-4 h-4 mr-2" /> REPEAT LAST
                </TerminalButton>
              </div>
            </div>
          </TerminalPanel>

        </div>
      </div>
    </div>
  );
}
