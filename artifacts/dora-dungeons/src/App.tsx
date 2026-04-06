import { useState, useEffect, useRef } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GameScreen } from "@/pages/GameScreen";
import { AuthScreen } from "@/pages/AuthScreen";
import { IntroVideo } from "@/components/IntroVideo";
import { PaymentSuccessPage } from "@/pages/PaymentSuccessPage";
import { PaymentCancelPage } from "@/pages/PaymentCancelPage";
import { useGetGameState, useStartGame, getGetGameStateQueryKey } from "@workspace/api-client-react";
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

function GameOrchestrator({ onLogout, playerFirstName }: { onLogout: () => void; playerFirstName?: string | null }) {
  const queryClient = useQueryClient();
  const hasStartedRef = useRef(false);

  const { data: gameState, isLoading: stateLoading, isError } = useGetGameState({
    query: {
      queryKey: getGetGameStateQueryKey(),
      retry: false,
    }
  });

  const { mutate: startGame, isPending: isStarting, error: startError } = useStartGame({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetGameStateQueryKey() });
      },
    },
  });

  // When there is no existing session, auto-start immediately using the player's auth name
  useEffect(() => {
    if (stateLoading) return;
    if (gameState) return;
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    startGame({ data: { playerName: playerFirstName || "Wanderer" } });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateLoading, gameState]);

  if (stateLoading || isStarting || (!gameState && !startError)) {
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
            {isError || isStarting ? "INITIALIZING SESSION..." : "CONNECTING..."}
          </p>
        </div>
      </div>
    );
  }

  if (startError) {
    return (
      <div
        className="min-h-screen w-full flex items-center justify-center"
        style={{ background: "#09080c" }}
      >
        <p className="font-mono text-sm" style={{ color: "rgba(220,60,60,0.8)" }}>
          Failed to start game session. Please refresh.
        </p>
      </div>
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
        <GameScreen gameState={gameState!} onLogout={onLogout} />
      </motion.div>
    </AnimatePresence>
  );
}

function App() {
  const auth = useJwtAuth();
  // Pre-auth video intro — shown once per page load for unauthenticated users.
  // React state only (no persistence) so it re-shows on every unauthenticated
  // page load. Authenticated users never reach this branch.
  const [hasSeenIntro, setHasSeenIntro] = useState(false);

  useEffect(() => {
    AudioManager.initializeVoices();
  }, []);

  // Wipe the React Query cache whenever the logged-in user changes so a
  // newly-signed-up or switched user never sees a stale game session from
  // the previous user.
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const currentId = auth.user?.id ?? null;
    if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== currentId) {
      queryClient.clear();
      AudioManager.stop();
    }
    prevUserIdRef.current = currentId;
  }, [auth.user?.id]);

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
    // Cinematic intro video plays before the tap-anywhere / login screen.
    // IntroVideo never renders for authenticated users.
    if (!hasSeenIntro) {
      return <IntroVideo onComplete={() => setHasSeenIntro(true)} />;
    }
    return <AuthScreen auth={auth} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="scanline-overlay" />
        <motion.div
          key="main"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35 }}
          className="h-screen"
        >
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Switch>
              <Route path="/payment-success" component={() => <PaymentSuccessPage />} />
              <Route path="/payment-cancel" component={() => <PaymentCancelPage />} />
              <Route path="/" component={() => <GameOrchestrator onLogout={auth.logout} playerFirstName={auth.user?.firstName} />} />
              <Route component={() => <GameOrchestrator onLogout={auth.logout} playerFirstName={auth.user?.firstName} />} />
            </Switch>
          </WouterRouter>
        </motion.div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
