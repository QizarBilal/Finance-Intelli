import React, { useEffect } from "react";
import { Route, Switch, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useGetProfile } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { SetupWizard } from "@/pages/setup";
import { Dashboard } from "@/pages/dashboard";
import NotFound from "@/pages/not-found";
import { CalendarView } from "@/pages/calendar";
import { Transactions } from "@/pages/transactions";
import { Budget } from "@/pages/budget";
import { Analytics } from "@/pages/analytics";
import { Goals } from "@/pages/goals";
import { Reminders } from "@/pages/reminders";
import { Reports } from "@/pages/reports";
import { Settings } from "@/pages/settings";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function AppRouter() {
  const [location, setLocation] = useLocation();
  const { data: profile, isLoading } = useGetProfile({ query: { retry: false } });

  useEffect(() => {
    if (!isLoading) {
      const isSetupComplete = localStorage.getItem("profile_setup_complete") === "true";
      if ((!profile || !isSetupComplete) && location !== "/setup") {
        setLocation("/setup");
      }
    }
  }, [profile, isLoading, location, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0d0d0f] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/setup" component={SetupWizard} />
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppRouter />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
