import { useState, useEffect, useRef, useCallback } from "react";
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

// ── Loading stage messages ────────────────────────────────────────────────────
const LOAD_STAGES = [
  "CONNECTING TO SERVER...",
  "LOADING YOUR ADVENTURE...",
  "PREPARING THE DUNGEON...",
] as const;
const STAGE_INTERVAL_MS = 2500;  // advance label every 2.5 s
const TIMEOUT_MS         = 8000; // hard timeout before showing retry UI

function GameOrchestrator({ onLogout, playerFirstName }: { onLogout: () => void; playerFirstName?: string | null }) {
  const queryClient = useQueryClient();
  const hasStartedRef = useRef(false);

  // Loading-stage animation state
  const [stageIdx, setStageIdx]       = useState(0);
  const [hasTimedOut, setHasTimedOut] = useState(false);

  const {
    data: gameState,
    isLoading: stateLoading,
    isError,
    refetch,
  } = useGetGameState({
    query: { queryKey: getGetGameStateQueryKey(), retry: false },
  });

  const {
    mutate: startGame,
    isPending: isStarting,
    error: startError,
    reset: resetStart,
  } = useStartGame({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetGameStateQueryKey() });
      },
    },
  });

  // True while any loading gate is active (same condition as before, extended)
  const isInLoadingState = stateLoading || isStarting || (!gameState && !startError);

  // Advance label every STAGE_INTERVAL_MS while loading
  useEffect(() => {
    if (!isInLoadingState) { setStageIdx(0); return; }
    const id = setInterval(
      () => setStageIdx((i) => Math.min(i + 1, LOAD_STAGES.length - 1)),
      STAGE_INTERVAL_MS,
    );
    return () => clearInterval(id);
  }, [isInLoadingState]);

  // Hard timeout: flip hasTimedOut after TIMEOUT_MS of continuous loading
  useEffect(() => {
    if (!isInLoadingState) { setHasTimedOut(false); return; }
    const id = setTimeout(() => {
      setHasTimedOut(true);
      // Speak the timeout message for screen-reader / visually impaired users
      AudioManager.speak(
        "Connection is taking longer than expected. Please tap Retry to try again.",
        { interrupt: true },
      );
    }, TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [isInLoadingState]);

  // Manual retry: reset all state and re-fetch
  const handleRetry = useCallback(() => {
    hasStartedRef.current = false;
    setStageIdx(0);
    setHasTimedOut(false);
    resetStart();
    refetch();
  }, [refetch, resetStart]);

  // When there is no existing session, auto-start immediately
  useEffect(() => {
    if (stateLoading) return;
    if (gameState) return;
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    startGame({ data: { playerName: playerFirstName || "Wanderer" } });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateLoading, gameState]);

  // ── Loading / timeout screens ─────────────────────────────────────────────
  if (isInLoadingState) {
    return (
      <div
        className="min-h-screen w-full flex items-center justify-center"
        style={{ background: "#09080c" }}
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-col items-center gap-6">
          {hasTimedOut ? (
            <>
              <p
                className="font-code text-xs tracking-widest text-center"
                style={{ color: "rgba(220,100,80,0.85)", letterSpacing: "0.25em", maxWidth: 280 }}
              >
                CONNECTION TIMED OUT
              </p>
              <p
                className="font-code text-xs text-center"
                style={{ color: "rgba(200,185,160,0.5)", letterSpacing: "0.15em", maxWidth: 280 }}
              >
                The server is taking too long to respond.
              </p>
              <button
                onClick={handleRetry}
                style={{
                  fontFamily: "'Cinzel', serif",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: "#c89b3c",
                  background: "rgba(200,155,60,0.08)",
                  border: "1px solid rgba(200,155,60,0.4)",
                  borderRadius: "4px",
                  padding: "0.75rem 2rem",
                  cursor: "pointer",
                }}
                aria-label="Retry connection"
              >
                Retry
              </button>
            </>
          ) : (
            <>
              <Loader2
                className="w-10 h-10 animate-spin"
                style={{ color: "rgba(179,18,47,0.6)" }}
                aria-hidden="true"
              />
              <p
                className="font-code text-xs animate-pulse tracking-widest"
                style={{ color: "rgba(200,190,180,0.3)", letterSpacing: "0.3em" }}
              >
                {isStarting ? "INITIALIZING SESSION..." : LOAD_STAGES[stageIdx]}
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Start-game hard error ──────────────────────────────────────────────────
  if (startError) {
    return (
      <div
        className="min-h-screen w-full flex items-center justify-center"
        style={{ background: "#09080c" }}
      >
        <div className="flex flex-col items-center gap-6">
          <p
            className="font-code text-xs tracking-widest"
            style={{ color: "rgba(220,80,60,0.85)", letterSpacing: "0.25em" }}
          >
            FAILED TO START SESSION
          </p>
          <button
            onClick={handleRetry}
            style={{
              fontFamily: "'Cinzel', serif",
              fontSize: "0.8rem",
              fontWeight: 700,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "#c89b3c",
              background: "rgba(200,155,60,0.08)",
              border: "1px solid rgba(200,155,60,0.4)",
              borderRadius: "4px",
              padding: "0.75rem 2rem",
              cursor: "pointer",
            }}
            aria-label="Retry starting session"
          >
            Retry
          </button>
        </div>
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

// sessionStorage key written by logout/exit so the intro is skipped when the
// user lands on the auth screen via an intentional action rather than a cold
// page load.  sessionStorage is tab-scoped and resets on a true refresh, which
// is exactly the behaviour we want:
//   • Fresh page load   → key absent  → intro plays
//   • Logout / exit     → key present → skip intro, go straight to auth
//   • New tab           → key absent  → intro plays  (new session)
//   • Refresh after logout → key cleared by browser → intro plays (fine)
const SKIP_INTRO_KEY = "dd_skip_intro";

function App() {
  const auth = useJwtAuth();

  // Consume the skip flag once on mount.  Reading + deleting inside useState
  // keeps this synchronous (no flash) and prevents it persisting for the
  // lifetime of the React tree.
  const [hasSeenIntro, setHasSeenIntro] = useState(() => {
    const skip = sessionStorage.getItem(SKIP_INTRO_KEY) === "true";
    if (skip) sessionStorage.removeItem(SKIP_INTRO_KEY);
    return skip;
  });

  // Logout handler: skip the intro both for THIS render (setHasSeenIntro) and
  // for any same-tab page reload that follows (sessionStorage key).
  const handleLogout = useCallback(() => {
    sessionStorage.setItem(SKIP_INTRO_KEY, "true");
    setHasSeenIntro(true);   // immediate — no intro flash within this React tree
    auth.logout();
    AudioManager.stop();
  }, [auth]);

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
              <Route path="/" component={() => <GameOrchestrator onLogout={handleLogout} playerFirstName={auth.user?.firstName} />} />
              <Route component={() => <GameOrchestrator onLogout={handleLogout} playerFirstName={auth.user?.firstName} />} />
            </Switch>
          </WouterRouter>
        </motion.div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
