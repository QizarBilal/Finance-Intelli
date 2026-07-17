import React, { useEffect, useState } from "react";
import { Route, Switch, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { Login } from "@/pages/login";
import { SetupWizard } from "@/pages/setup";
import { Dashboard } from "@/pages/dashboard";
import { Transactions } from "@/pages/transactions";
import { Budget } from "@/pages/budget";
import { Analytics } from "@/pages/analytics";
import { CalendarView } from "@/pages/calendar";
import { Goals } from "@/pages/goals";
import { Reminders } from "@/pages/reminders";
import { Reports } from "@/pages/reports";
import { Settings } from "@/pages/settings";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

// ── Auth helpers ──────────────────────────────────────────────────────────────
const TOKEN_KEY = "moneymind_token";
const SETUP_KEY = "profile_setup_complete";

async function validateToken(token: string): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Inner router (shown when authenticated) ───────────────────────────────────
function AppRouter({ token, onSetupComplete }: { token: string; onSetupComplete: () => void }) {
  const [location, setLocation] = useLocation();
  const isSetupComplete = localStorage.getItem(SETUP_KEY) === "true";

  useEffect(() => {
    if (!isSetupComplete && location !== "/setup") setLocation("/setup");
  }, [isSetupComplete, location, setLocation]);

  if (!isSetupComplete) {
    return <SetupWizard token={token} onComplete={onSetupComplete} />;
  }

  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/transactions" component={Transactions} />
      <Route path="/budget" component={Budget} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/calendar" component={CalendarView} />
      <Route path="/goals" component={Goals} />
      <Route path="/reminders" component={Reminders} />
      <Route path="/reports" component={Reports} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
type AuthState = "checking" | "unauthenticated" | "authenticated";

function App() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [token, setToken] = useState<string>("");
  const [setupDone, setSetupDone] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) { setAuthState("unauthenticated"); return; }
    validateToken(stored).then(valid => {
      if (valid) {
        setToken(stored);
        setAuthTokenGetter(() => stored);
        setAuthState("authenticated");
      } else {
        localStorage.removeItem(TOKEN_KEY);
        setAuthState("unauthenticated");
      }
    });
  }, []);

  const handleAuth = (t: string) => {
    setToken(t);
    setAuthTokenGetter(() => t);
    setAuthState("authenticated");
    queryClient.clear();
  };

  const handleSetupComplete = () => {
    setSetupDone(prev => !prev); // trigger re-render
  };

  if (authState === "checking") {
    return (
      <div className="min-h-screen bg-[#0d0d0f] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (authState === "unauthenticated") {
    return (
      <QueryClientProvider client={queryClient}>
        <Login onAuth={handleAuth} />
        <Toaster />
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppRouter token={token} onSetupComplete={handleSetupComplete} />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
