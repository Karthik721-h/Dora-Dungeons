import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StartScreen } from "@/pages/StartScreen";
import { GameScreen } from "@/pages/GameScreen";
import { useGetGameState, getGetGameStateQueryKey } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";

// Configure query client to not retry on 404s so we can immediately show StartScreen
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        // Don't retry 404s or 400s
        if (error?.status === 404 || error?.status === 400) return false;
        return failureCount < 3;
      },
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

function GameOrchestrator() {
  const { data: gameState, isLoading, isError, error } = useGetGameState({
    query: {
      queryKey: getGetGameStateQueryKey(),
      retry: false,
    }
  });

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background text-primary">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 animate-spin" />
          <p className="font-mono animate-pulse tracking-widest text-sm">CONNECTING TO NEURAL LINK...</p>
        </div>
      </div>
    );
  }

  // If there's no active game (404), or we failed to fetch, show Start Screen
  if (isError || !gameState) {
    return <StartScreen />;
  }

  // Active game found, show main UI
  return <GameScreen gameState={gameState} />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={GameOrchestrator} />
      {/* Fallback route re-renders orchestrator, which handles state logic anyway */}
      <Route component={GameOrchestrator} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {/* Global atmospheric effects */}
        <div className="scanline-overlay" />
        <div className="crt-overlay" />
        
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
