import { useState, useRef, useEffect } from "react";
import { useProcessAction, GameStateResponse } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { TerminalPanel } from "@/components/TerminalPanel";
import { StatBar } from "@/components/StatBar";
import { TerminalButton } from "@/components/TerminalButton";
import { motion, AnimatePresence } from "framer-motion";
import { getGetGameStateQueryKey } from "@workspace/api-client-react";
import { 
  Shield, 
  Swords, 
  Map, 
  Heart, 
  Zap, 
  Skull, 
  ChevronRight, 
  TerminalSquare,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Eye, Info, Flame
} from "lucide-react";

export function GameScreen({ gameState }: { gameState: GameStateResponse }) {
  const [command, setCommand] = useState("");
  const logEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { mutate: sendAction, isPending } = useProcessAction({
    mutation: {
      onSuccess: (newData) => {
        // Optimistically update or just let React Query handle it via invalidation
        queryClient.setQueryData(getGetGameStateQueryKey(), newData);
        setCommand("");
        // Keep focus on input after action
        setTimeout(() => inputRef.current?.focus(), 10);
      }
    }
  });

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [gameState.logs]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || isPending) return;
    sendAction({ data: { command: command.trim() } });
  };

  const handleQuickAction = (actionCmd: string) => {
    sendAction({ data: { command: actionCmd } });
  };

  const { player, currentRoom, logs, gameStatus, parsedCommand } = gameState;

  const isCombat = gameStatus === "IN_COMBAT";
  const isGameOver = gameStatus === "GAME_OVER";
  
  return (
    <div className="min-h-screen w-full bg-background p-2 md:p-4 lg:p-6 flex flex-col relative z-10">
      
      {/* Header Bar */}
      <header className="flex justify-between items-center mb-4 pb-2 border-b border-border/50">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-xl text-foreground tracking-widest terminal-text">DORA DUNGEONS</h1>
          <div className={`px-2 py-0.5 text-xs font-mono font-bold uppercase tracking-wider border ${
            isCombat ? 'border-primary text-primary bg-primary/10 animate-pulse' : 
            isGameOver ? 'border-destructive text-destructive bg-destructive/10' :
            'border-accent text-accent bg-accent/10'
          }`}>
            {gameStatus.replace('_', ' ')}
          </div>
        </div>
        <div className="text-xs font-mono text-muted-foreground flex items-center gap-2">
          <TerminalSquare className="w-4 h-4" /> 
          SESSION: <span className="text-foreground">{gameState.sessionId.slice(0,8)}</span>
          <span className="mx-2 opacity-30">|</span>
          TURN: <span className="text-foreground">{gameState.turnCount}</span>
        </div>
      </header>

      {/* Main Grid Layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 h-full max-h-[calc(100vh-100px)]">
        
        {/* LEFT COLUMN: Logs & Input (Takes up most space) */}
        <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-4 min-h-[50vh]">
          
          {/* Main Log Output */}
          <TerminalPanel title="TERMINAL OUTPUT" className="flex-1" glow={isCombat}>
            <div 
              className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3 font-mono text-sm md:text-base leading-relaxed scroll-smooth"
              role="log"
              aria-live="polite"
            >
              {logs.map((log, i) => {
                const isSystem = log.startsWith(">");
                const isDanger = log.toLowerCase().includes("damage") || log.toLowerCase().includes("attack");
                const isSuccess = log.toLowerCase().includes("defeated") || log.toLowerCase().includes("found");
                
                return (
                  <motion.div 
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    key={i}
                    className={`
                      ${isSystem ? 'text-primary/80 font-bold mb-4 mt-6' : 'text-foreground/90'}
                      ${isDanger && !isSystem ? 'text-primary' : ''}
                      ${isSuccess && !isSystem ? 'text-accent' : ''}
                    `}
                  >
                    {log}
                  </motion.div>
                );
              })}
              <div ref={logEndRef} className="h-4" />
            </div>
            
            {/* Parsed Command Feedback (Optional but cool) */}
            {parsedCommand && (
              <div className="px-4 py-2 bg-secondary/30 border-t border-border/30 text-xs font-mono text-muted-foreground flex items-center gap-2">
                <span className="text-primary/70">LAST_PARSE:</span>
                <span className="text-foreground uppercase">{parsedCommand.action}</span>
                {parsedCommand.target && <span className="text-accent">TARGET:{parsedCommand.target}</span>}
                {parsedCommand.direction && <span className="text-blue-400">DIR:{parsedCommand.direction}</span>}
              </div>
            )}
          </TerminalPanel>

          {/* Command Input Area */}
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
                placeholder="Enter command (e.g. 'move north', 'attack goblin')..."
                autoComplete="off"
                spellCheck="false"
                autoFocus
              />
            </div>
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
        </div>

        {/* RIGHT COLUMN: State Panels */}
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

          {/* Current Room */}
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

              {/* Exits */}
              <div className="space-y-1">
                <div className="text-xs text-primary font-bold uppercase tracking-widest">Available Paths</div>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(currentRoom.exits).length > 0 ? (
                    Object.keys(currentRoom.exits).map(dir => (
                      <span key={dir} className="text-xs bg-secondary border border-border px-2 py-1 uppercase font-mono text-foreground">
                        {dir}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground italic">No obvious exits</span>
                  )}
                </div>
              </div>

              {/* Enemies */}
              {currentRoom.enemies.length > 0 && (
                <div className="space-y-2 mt-2 pt-3 border-t border-border/50">
                  <div className="text-xs text-destructive font-bold uppercase tracking-widest flex items-center gap-2">
                    <Skull className="w-3 h-3" /> Hostiles Detected
                  </div>
                  <div className="space-y-2">
                    {currentRoom.enemies.map(enemy => (
                      <div key={enemy.id} className={`flex flex-col p-2 border ${enemy.isDefeated ? 'border-border/30 opacity-50' : 'border-destructive/30 bg-destructive/5'}`}>
                        <div className="flex justify-between items-center mb-1">
                          <span className={`font-mono text-sm ${enemy.isDefeated ? 'line-through' : 'text-destructive'}`}>
                            {enemy.name}
                          </span>
                          {!enemy.isDefeated && <span className="text-xs font-mono">{enemy.hp}/{enemy.maxHp} HP</span>}
                        </div>
                        {!enemy.isDefeated && (
                          <div className="h-1 w-full bg-secondary overflow-hidden">
                            <div className="h-full bg-destructive" style={{ width: `${(enemy.hp/enemy.maxHp)*100}%` }} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TerminalPanel>

          {/* Quick Actions (Debug / Accessibility helpers) */}
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
            </div>
          </TerminalPanel>

        </div>
      </div>
    </div>
  );
}
