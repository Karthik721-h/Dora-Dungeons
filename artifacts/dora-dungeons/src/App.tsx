import { useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StartScreen } from "@/pages/StartScreen";
import { GameScreen } from "@/pages/GameScreen";
import { IntroScene } from "@/components/IntroScene";
import { useGetGameState, getGetGameStateQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { AudioManager } from "@/audio/AudioManager";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        if (error?.status === 404 || error?.status === 400) return false;
        return failureCount < 3;
      },
      staleTime: 1000 * 60 * 5,
    },
  },
});

const INTRO_SEEN_KEY = "dd_intro_seen";

function GameOrchestrator({ skipIntro }: { skipIntro: boolean }) {
  const { data: gameState, isLoading, isError } = useGetGameState({
    query: {
      queryKey: getGetGameStateQueryKey(),
      retry: false,
    }
  });

  if (isLoading) {
    return (
      <div
        className="min-h-screen w-full flex items-center justify-center"
        style={{ background: "#09080c" }}
      >
        <div className="flex flex-col items-center gap-5">
          <Loader2
            className="w-10 h-10 animate-spin"
            style={{ color: "rgba(179,18,47,0.6)" }}
          />
          <p
            className="font-code text-xs animate-pulse tracking-widest"
            style={{ color: "rgba(200,190,180,0.3)", letterSpacing: "0.3em" }}
          >
            CONNECTING...
          </p>
        </div>
      </div>
    );
  }

  if (isError || !gameState) {
    return (
      <AnimatePresence>
        <motion.div
          key="start"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
        >
          <StartScreen />
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        key="game"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.7 }}
        className="h-screen"
      >
        <GameScreen gameState={gameState} />
      </motion.div>
    </AnimatePresence>
  );
}

function LoginGate({ onAuthenticated }: { onAuthenticated: () => void }) {
  const { isLoading, isAuthenticated, login } = useAuth();

  useEffect(() => {
    if (isAuthenticated) onAuthenticated();
  }, [isAuthenticated, onAuthenticated]);

  if (isLoading) {
    return (
      <div
        className="min-h-screen w-full flex items-center justify-center"
        style={{ background: "#09080c" }}
      >
        <Loader2 className="w-10 h-10 animate-spin" style={{ color: "rgba(179,18,47,0.6)" }} />
      </div>
    );
  }

  if (isAuthenticated) return null;

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
          className="font-body text-sm md:text-base"
          style={{ color: "rgba(200,190,180,0.5)" }}
        >
          An audio-first dungeon adventure
        </p>
      </div>

      <button
        onClick={login}
        className="px-8 py-4 font-display text-sm tracking-widest uppercase transition-all duration-200 border"
        style={{
          background: "rgba(179,18,47,0.15)",
          borderColor: "rgba(179,18,47,0.5)",
          color: "#c8beb4",
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(179,18,47,0.3)";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(179,18,47,0.15)";
        }}
      >
        Log in to play
      </button>
    </div>
  );
}

function App() {
  const [showIntro, setShowIntro] = useState(false);
  const [introComplete, setIntroComplete] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const { isLoading: authLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    // Initialize TTS voice selection as early as possible.
    // Chrome/Edge load voices asynchronously so this must fire before any speak() call.
    AudioManager.initializeVoices();
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      // Auth check done — show login gate (handled by LoginGate)
      setIsAuthReady(true);
      return;
    }
    // User is authenticated — proceed with intro
    setIsAuthReady(true);
    const seen = sessionStorage.getItem(INTRO_SEEN_KEY);
    if (!seen) {
      setShowIntro(true);
    } else {
      setIntroComplete(true);
    }
  }, [authLoading, isAuthenticated]);

  const handleIntroComplete = () => {
    sessionStorage.setItem(INTRO_SEEN_KEY, "1");
    setShowIntro(false);
    setIntroComplete(true);
  };

  if (!isAuthReady || authLoading) {
    return (
      <div
        className="min-h-screen w-full flex items-center justify-center"
        style={{ background: "#09080c" }}
      >
        <Loader2 className="w-10 h-10 animate-spin" style={{ color: "rgba(179,18,47,0.6)" }} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <QueryClientProvider client={queryClient}>
        <LoginGate onAuthenticated={() => {}} />
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="scanline-overlay" />

        {/* Cinematic intro */}
        <AnimatePresence>
          {showIntro && (
            <IntroScene onComplete={handleIntroComplete} />
          )}
        </AnimatePresence>

        {/* Main app — renders after intro */}
        <AnimatePresence>
          {introComplete && (
            <motion.div
              key="main"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8 }}
              className="h-screen"
            >
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <Switch>
                  <Route path="/" component={() => <GameOrchestrator skipIntro={!showIntro} />} />
                  <Route component={() => <GameOrchestrator skipIntro />} />
                </Switch>
              </WouterRouter>
            </motion.div>
          )}
        </AnimatePresence>

        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
