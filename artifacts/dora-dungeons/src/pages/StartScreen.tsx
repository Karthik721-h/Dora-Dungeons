import { useState } from "react";
import { useStartGame } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { TerminalButton } from "@/components/TerminalButton";
import { TerminalPanel } from "@/components/TerminalPanel";
import { motion } from "framer-motion";
import { Skull, Volume2 } from "lucide-react";
import { getGetGameStateQueryKey } from "@workspace/api-client-react";

export function StartScreen() {
  const [playerName, setPlayerName] = useState("");
  const queryClient = useQueryClient();
  
  const { mutate: startGame, isPending, error } = useStartGame({
    mutation: {
      onSuccess: () => {
        // Invalidate state to trigger a refetch and transition to game screen
        queryClient.invalidateQueries({ queryKey: getGetGameStateQueryKey() });
      }
    }
  });

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    startGame({ data: { playerName: playerName || "Wanderer" } });
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden bg-background">
      {/* Background image & overlays */}
      <div className="absolute inset-0 z-0">
        <img 
          src={`${import.meta.env.BASE_URL}images/dungeon-bg.png`}
          alt="Dungeon backdrop"
          className="w-full h-full object-cover opacity-20"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="z-10 w-full max-w-md"
      >
        <TerminalPanel glow className="p-8 pb-10">
          <div className="flex flex-col items-center mb-8">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3, duration: 1 }}
              className="mb-6 relative"
            >
              <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full" />
              <img 
                src={`${import.meta.env.BASE_URL}images/hero-art.png`}
                alt="Dora Dungeons Insignia"
                className="w-32 h-32 object-contain relative z-10 opacity-80 mix-blend-screen drop-shadow-[0_0_15px_rgba(200,0,0,0.5)]"
              />
            </motion.div>
            <h1 className="font-display text-4xl md:text-5xl font-bold text-center mb-2 terminal-text text-foreground">
              Dora <span className="text-primary terminal-text-primary">Dungeons</span>
            </h1>
            <p className="text-muted-foreground text-sm font-mono text-center flex items-center gap-2">
              <Volume2 className="w-4 h-4" /> Audio-First Roleplaying
            </p>
          </div>

          <form onSubmit={handleStart} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="playerName" className="text-xs font-mono text-muted-foreground uppercase tracking-widest block">
                Enter your designation [Optional]
              </label>
              <input
                id="playerName"
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Wanderer"
                className="w-full bg-secondary/50 border border-border p-3 text-foreground font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-muted-foreground/30"
                autoComplete="off"
                spellCheck="false"
              />
            </div>

            {error && (
              <div className="p-3 border border-destructive/50 bg-destructive/10 text-destructive text-sm font-mono flex items-start gap-2">
                <Skull className="w-4 h-4 mt-0.5 shrink-0" />
                <p>{error.message || "Failed to initialize game session."}</p>
              </div>
            )}

            <TerminalButton 
              type="submit" 
              variant="primary" 
              className="w-full py-6 text-lg"
              disabled={isPending}
            >
              {isPending ? "INITIALIZING..." : "ENTER THE DUNGEON"}
            </TerminalButton>
          </form>
        </TerminalPanel>
      </motion.div>
    </div>
  );
}
