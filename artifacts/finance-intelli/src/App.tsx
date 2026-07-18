import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { useEffect } from 'react';

// Pages
import Dashboard from '@/pages/dashboard';
import Setup from '@/pages/setup';
import Login from '@/pages/login';
import Transactions from '@/pages/transactions';
import Budgets from '@/pages/budgets';
import Goals from '@/pages/goals';
import Calendar from '@/pages/calendar';
import Reminders from '@/pages/reminders';
import Analytics from '@/pages/analytics';
import Reports from '@/pages/reports';
import Settings from '@/pages/settings';
import Insights from '@/pages/insights';

import Shell from '@/components/layout/Shell';

const queryClient = new QueryClient();

function AuthGuard({ component: Component, isPublic = false, requireSetup = false }: { component: any, isPublic?: boolean, requireSetup?: boolean }) {
  const { isAuthenticated, isSetup, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading) return;

    if (!isPublic && !isAuthenticated) {
      if (isSetup === false) {
        setLocation('/setup');
      } else {
        setLocation('/login');
      }
    } else if (isPublic && isAuthenticated) {
      setLocation('/dashboard');
    } else if (isPublic && !isAuthenticated && !requireSetup && isSetup === false) {
      setLocation('/setup');
    }
  }, [isLoading, isAuthenticated, isSetup, isPublic, requireSetup, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isPublic && !isAuthenticated) return null;
  if (isPublic && isAuthenticated) return null;

  return <Component />;
}

function MainApp() {
  return (
    <Shell>
      <Switch>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/transactions" component={Transactions} />
        <Route path="/budgets" component={Budgets} />
        <Route path="/goals" component={Goals} />
        <Route path="/calendar" component={Calendar} />
        <Route path="/reminders" component={Reminders} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/reports" component={Reports} />
        <Route path="/settings" component={Settings} />
        <Route path="/insights" component={Insights} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

function Router() {
  const [, setLocation] = useLocation();
  
  return (
    <Switch>
      <Route path="/">
        {() => {
          // Just a redirector based on auth state handled in App shell or simple logic
          return <AuthGuard component={() => null} />; // Effect will handle redirect
        }}
      </Route>
      <Route path="/setup">
        <AuthGuard component={Setup} isPublic requireSetup />
      </Route>
      <Route path="/login">
        <AuthGuard component={Login} isPublic />
      </Route>
      <Route path="/:rest*">
        <AuthGuard component={MainApp} />
      </Route>
    </Switch>
  );
}

function App() {
  useEffect(() => {
    // Force dark mode
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
