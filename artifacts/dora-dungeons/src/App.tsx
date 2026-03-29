import { useState, useEffect, useRef } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StartScreen } from "@/pages/StartScreen";
import { GameScreen } from "@/pages/GameScreen";
import { AuthScreen } from "@/pages/AuthScreen";
import { IntroScene } from "@/components/IntroScene";
import { useGetGameState, getGetGameStateQueryKey } from "@workspace/api-client-react";
import { useJwtAuth } from "@/hooks/useJwtAuth";
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

function GameOrchestrator({ skipIntro, onLogout }: { skipIntro: boolean; onLogout: () => void }) {
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
        <GameScreen gameState={gameState} onLogout={onLogout} />
      </motion.div>
    </AnimatePresence>
  );
}

function App() {
  const auth = useJwtAuth();
  const [showIntro, setShowIntro] = useState(false);
  const [introComplete, setIntroComplete] = useState(false);

  useEffect(() => {
    AudioManager.initializeVoices();
  }, []);

  // Wipe the React Query cache whenever the logged-in user changes so a
  // newly-signed-up or switched user never sees a stale game session from
  // the previous user.  Without this, useGetGameState can return the old
  // user's cached data, causing the game action buttons to hit the server
  // with a JWT that has no matching session → 404.
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const currentId = auth.user?.id ?? null;
    if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== currentId) {
      // User changed (logout or account switch) — wipe stale game cache and
      // silence any TTS that may still be playing.  Voice recognition stops
      // automatically when GameScreen unmounts.
      queryClient.clear();
      AudioManager.stop();
    }
    prevUserIdRef.current = currentId;
  }, [auth.user?.id]);

  useEffect(() => {
    if (auth.isLoading || !auth.isAuthenticated) return;
    const seen = sessionStorage.getItem(INTRO_SEEN_KEY);
    if (!seen) {
      setShowIntro(true);
    } else {
      setIntroComplete(true);
    }
  }, [auth.isLoading, auth.isAuthenticated]);

  const handleIntroComplete = () => {
    sessionStorage.setItem(INTRO_SEEN_KEY, "1");
    setShowIntro(false);
    setIntroComplete(true);
  };

  if (auth.isLoading) {
    return (
      <div
        className="min-h-screen w-full flex items-center justify-center"
        style={{ background: "#09080c" }}
      >
        <Loader2 className="w-10 h-10 animate-spin" style={{ color: "rgba(179,18,47,0.6)" }} />
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return <AuthScreen auth={auth} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="scanline-overlay" />

        <AnimatePresence>
          {showIntro && (
            <IntroScene onComplete={handleIntroComplete} />
          )}
        </AnimatePresence>

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
                  <Route path="/" component={() => <GameOrchestrator skipIntro={!showIntro} onLogout={auth.logout} />} />
                  <Route component={() => <GameOrchestrator skipIntro onLogout={auth.logout} />} />
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
