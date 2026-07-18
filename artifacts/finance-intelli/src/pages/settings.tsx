import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLogout } from '@workspace/api-client-react';
import { clearToken } from '@/lib/api-client';
import { useLocation } from 'wouter';
import { LogOut, User, Sun, Database, RotateCcw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

export default function Settings() {
  const logout = useLogout();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isResetting, setIsResetting] = useState(false);

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        clearToken();
        queryClient.clear();
        setLocation('/login');
      }
    });
  };

  const toggleTheme = () => {
    const html = document.documentElement;
    if (html.classList.contains('dark')) {
      html.classList.remove('dark');
    } else {
      html.classList.add('dark');
    }
  };

  const handleResetData = async () => {
    setIsResetting(true);
    try {
      const token = localStorage.getItem('finance_token');
      const base = import.meta.env.BASE_URL.replace(/\/$/, '');
      const res = await fetch(`${base}/api/reset`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Reset failed');
      // Invalidate all queries so UI reflects empty state
      await queryClient.invalidateQueries();
      toast({ title: 'Data reset', description: 'All your financial data has been cleared.' });
    } catch {
      toast({ title: 'Error', description: 'Could not reset data. Please try again.', variant: 'destructive' });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your app preferences and account.</p>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden divide-y divide-border/50">

        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium text-lg">Profile Details</h3>
              <p className="text-sm text-muted-foreground">Update your name, occupation, and basic info</p>
            </div>
          </div>
          <Button variant="outline">Edit Profile</Button>
        </div>

        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Sun className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium text-lg">Appearance</h3>
              <p className="text-sm text-muted-foreground">Toggle between light and dark mode</p>
            </div>
          </div>
          <Button variant="outline" onClick={toggleTheme}>Toggle Theme</Button>
        </div>

        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Database className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium text-lg">Export Data</h3>
              <p className="text-sm text-muted-foreground">Download all your financial data as JSON</p>
            </div>
          </div>
          <Button variant="outline">Export Data</Button>
        </div>

      </div>

      <div className="glass-card rounded-2xl p-6 border-destructive/20 border space-y-6">
        <div>
          <h3 className="font-medium text-lg text-destructive mb-1">Danger Zone</h3>
          <p className="text-sm text-muted-foreground">Irreversible actions — proceed with caution.</p>
        </div>

        {/* Reset Data */}
        <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-orange-500/5 border border-orange-500/20">
          <div className="flex items-start gap-3">
            <RotateCcw className="w-5 h-5 text-orange-400 mt-0.5 shrink-0" />
            <div>
              <h4 className="font-medium text-sm text-orange-300">Reset All Data</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Wipes all transactions, budgets, goals, reminders and categories. Your login stays intact.
              </p>
            </div>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="shrink-0 border-orange-500/40 text-orange-400 hover:bg-orange-500/10">
                Reset Data
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-orange-400" />
                  Reset all data?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete every transaction, budget, goal, reminder, and category you've created.
                  Your account and login credentials will remain. <strong>This cannot be undone.</strong>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleResetData}
                  disabled={isResetting}
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                >
                  {isResetting ? 'Resetting…' : 'Yes, reset everything'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Delete Account + Logout */}
        <div className="flex gap-3">
          <Button variant="destructive" className="flex-1 sm:flex-none">Delete Account</Button>
          <Button variant="secondary" onClick={handleLogout} className="flex items-center gap-2">
            <LogOut className="w-4 h-4" /> Log Out
          </Button>
        </div>
      </div>
    </div>
  );
}
