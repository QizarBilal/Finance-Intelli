import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { lazy, Suspense, useEffect, type ComponentType } from 'react';

import Shell from '@/components/layout/Shell';

const Dashboard = lazy(() => import('@/pages/dashboard'));
const Signup = lazy(() => import('@/pages/signup'));
const Login = lazy(() => import('@/pages/login'));
const Transactions = lazy(() => import('@/pages/transactions'));
const Budgets = lazy(() => import('@/pages/budgets'));
const Goals = lazy(() => import('@/pages/goals'));
const Calendar = lazy(() => import('@/pages/calendar'));
const Reminders = lazy(() => import('@/pages/reminders'));
const Analytics = lazy(() => import('@/pages/analytics'));
const Reports = lazy(() => import('@/pages/reports'));
const Settings = lazy(() => import('@/pages/settings'));
const Insights = lazy(() => import('@/pages/insights'));
const Accounts = lazy(() => import('@/pages/accounts'));
const Plan = lazy(() => import('@/pages/plan'));
const CommandCenter = lazy(() => import('@/pages/command-center'));
const Wealth = lazy(() => import('@/pages/wealth'));
const Organize = lazy(() => import('@/pages/organize'));
const Studio = lazy(() => import('@/pages/studio'));
const NotFound = lazy(() => import('@/pages/not-found'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 15 * 60_000,
      retry: (count, error: any) => error?.status >= 400 && error?.status < 500 ? false : count < 2,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: { retry: 0 },
  },
});

function AuthGuard({ component: Component, isPublic = false }: { component: ComponentType; isPublic?: boolean }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (!isPublic && !isAuthenticated) setLocation('/login');
    if (isPublic && isAuthenticated) setLocation('/command');
  }, [isLoading, isAuthenticated, isPublic, setLocation]);

  if (isLoading) return <Spinner />;
  if (!isPublic && !isAuthenticated) return null;
  if (isPublic && isAuthenticated) return null;
  return <Component />;
}

function Spinner() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function RootRedirect() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    setLocation(isAuthenticated ? '/command' : '/login');
  }, [isLoading, isAuthenticated, setLocation]);

  return <Spinner />;
}

function MainApp() {
  return (
    <Shell>
      <Switch>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/command" component={CommandCenter} />
        <Route path="/wealth" component={Wealth} />
        <Route path="/organize" component={Organize} />
        <Route path="/studio" component={Studio} />
        <Route path="/transactions" component={Transactions} />
        <Route path="/accounts" component={Accounts} />
        <Route path="/plan" component={Plan} />
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
  return (
    <Switch>
      <Route path="/" component={RootRedirect} />
      <Route path="/login">
        <AuthGuard component={Login} isPublic />
      </Route>
      <Route path="/signup">
        <AuthGuard component={Signup} isPublic />
      </Route>
      <Route path="/setup">
        <AuthGuard component={Signup} isPublic />
      </Route>
      <Route path="/:rest*">
        <AuthGuard component={MainApp} />
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Suspense fallback={<Spinner />}>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
        </Suspense>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
