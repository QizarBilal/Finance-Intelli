import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLogout, useGetMe, useUpdateProfile } from '@workspace/api-client-react';
import { clearToken } from '@/lib/api-client';
import { useLocation } from 'wouter';
import { LogOut, User, Sun, Database, RotateCcw, AlertTriangle, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

export default function Settings() {
  const logout = useLogout();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: profile } = useGetMe();
  const updateProfile = useUpdateProfile();

  const [isResetting, setIsResetting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editOccupation, setEditOccupation] = useState('');
  const [editJobStatus, setEditJobStatus] = useState('');

  const openEdit = () => {
    setEditName(profile?.name ?? '');
    setEditOccupation(profile?.occupation ?? '');
    setEditJobStatus(profile?.jobStatus ?? '');
    setEditOpen(true);
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile.mutate(
      { data: { name: editName, occupation: editOccupation, jobStatus: editJobStatus } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries();
          setEditOpen(false);
          toast({ title: 'Profile updated', description: 'Your details have been saved.' });
        },
        onError: () => {
          toast({ title: 'Error', description: 'Could not update profile.', variant: 'destructive' });
        },
      }
    );
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, '');
      const requestOptions: RequestInit = { credentials: 'include' };

      const [txRes, budgetsRes, goalsRes, remindersRes, catsRes] = await Promise.all([
        fetch(`${base}/api/transactions?limit=9999`, requestOptions),
        fetch(`${base}/api/budgets`, requestOptions),
        fetch(`${base}/api/goals`, requestOptions),
        fetch(`${base}/api/reminders`, requestOptions),
        fetch(`${base}/api/categories`, requestOptions),
      ]);

      const [txData, budgets, goals, reminders, categories] = await Promise.all([
        txRes.json(), budgetsRes.json(), goalsRes.json(), remindersRes.json(), catsRes.json(),
      ]);

      const exportPayload = {
        exportedAt: new Date().toISOString(),
        profile: { name: profile?.name, occupation: profile?.occupation },
        transactions: Array.isArray(txData) ? txData : (txData?.data ?? []),
        budgets: Array.isArray(budgets) ? budgets : [],
        goals: Array.isArray(goals) ? goals : [],
        reminders: Array.isArray(reminders) ? reminders : [],
        categories: Array.isArray(categories) ? categories : [],
      };

      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `finance-intelli-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast({ title: 'Export complete', description: 'Your data has been downloaded as JSON.' });
    } catch {
      toast({ title: 'Export failed', description: 'Could not export data. Try again.', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => { clearToken(); queryClient.clear(); setLocation('/login'); }
    });
  };

  const toggleTheme = () => {
    document.documentElement.classList.toggle('dark');
  };

  const handleResetData = async () => {
    setIsResetting(true);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, '');
      const res = await fetch(`${base}/api/reset`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error();
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

        {/* Profile */}
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium text-lg">Profile Details</h3>
              <p className="text-sm text-muted-foreground">
                {profile?.name ? `${profile.name}${profile.occupation ? ` · ${profile.occupation}` : ''}` : 'Update your name, occupation, and basic info'}
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={openEdit}>Edit Profile</Button>
        </div>

        {/* Appearance */}
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

        {/* Export */}
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
          <Button variant="outline" onClick={handleExport} disabled={isExporting} className="gap-2">
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {isExporting ? 'Exporting…' : 'Export Data'}
          </Button>
        </div>

      </div>

      {/* Danger Zone */}
      <div className="glass-card rounded-2xl p-6 border-destructive/20 border space-y-6">
        <div>
          <h3 className="font-medium text-lg text-destructive mb-1">Danger Zone</h3>
          <p className="text-sm text-muted-foreground">Irreversible actions — proceed with caution.</p>
        </div>

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
                  This will permanently delete every transaction, budget, goal, reminder, and category.
                  Your account credentials remain. <strong>This cannot be undone.</strong>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleResetData} disabled={isResetting} className="bg-orange-500 hover:bg-orange-600 text-white">
                  {isResetting ? 'Resetting…' : 'Yes, reset everything'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div className="flex gap-3">
          <Button variant="destructive" className="flex-1 sm:flex-none">Delete Account</Button>
          <Button variant="secondary" onClick={handleLogout} className="flex items-center gap-2">
            <LogOut className="w-4 h-4" /> Log Out
          </Button>
        </div>
      </div>

      {/* Edit Profile Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveProfile} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Full Name</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="Mohammed Qizar Bilal"
                className="bg-background/50"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-occupation">Occupation</Label>
              <Input
                id="edit-occupation"
                value={editOccupation}
                onChange={e => setEditOccupation(e.target.value)}
                placeholder="e.g. Software Engineer"
                className="bg-background/50"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-jobstatus">Job Status</Label>
              <Input
                id="edit-jobstatus"
                value={editJobStatus}
                onChange={e => setEditJobStatus(e.target.value)}
                placeholder="e.g. Full-time, Freelance"
                className="bg-background/50"
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateProfile.isPending} className="gap-2">
                {updateProfile.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
