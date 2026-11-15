import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLogout, useGetMe, useUpdateProfile } from '@workspace/api-client-react';
import { clearToken } from '@/lib/api-client';
import { useLocation } from 'wouter';
import { LogOut, User, Palette, Database, RotateCcw, AlertTriangle, Download, Loader2, Check, BellRing } from 'lucide-react';
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
import { appThemes, applyTheme, resolveTheme, type AppThemeId } from '@/lib/themes';
import { customFetch } from '@workspace/api-client-react/custom-fetch';
import { Switch } from '@/components/ui/switch';

type AlertPreferences = { lowBalance?: boolean; bills?: boolean; budgets?: boolean; subscriptions?: boolean; lowBalanceThreshold?: number };

export default function Settings() {
  const logout = useLogout();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: profile } = useGetMe();
  const updateProfile = useUpdateProfile();
  const alerts = useQuery({ queryKey: ['notification-preferences'], queryFn: () => customFetch<{ preferences?: AlertPreferences }>('/api/notifications', { responseType: 'json' }) });
  const saveAlerts = useMutation({ mutationFn: (preferences: AlertPreferences) => customFetch<AlertPreferences>('/api/notification-preferences', { method: 'PUT', responseType: 'json', body: JSON.stringify(preferences) }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['notification-preferences'] }); queryClient.invalidateQueries({ queryKey: ['command-center'] }); toast({ title: 'Alert preferences saved' }); }, onError: (error: Error) => toast({ title: 'Could not save alert preferences', description: error.message, variant: 'destructive' }) });
  const setAlert = (key: keyof AlertPreferences, value: boolean | number) => {
    const current = alerts.data?.preferences ?? {};
    saveAlerts.mutate({ lowBalance: current.lowBalance !== false, bills: current.bills !== false, budgets: current.budgets !== false, subscriptions: current.subscriptions !== false, lowBalanceThreshold: Number(current.lowBalanceThreshold ?? 500), [key]: value });
  };

  const [isResetting, setIsResetting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editOccupation, setEditOccupation] = useState('');
  const [editJobStatus, setEditJobStatus] = useState('');
  const [themeOpen, setThemeOpen] = useState(false);
  const [activeTheme, setActiveTheme] = useState<AppThemeId>(() => resolveTheme());
  const [threshold, setThreshold] = useState('500');
  useEffect(() => { if (alerts.data?.preferences?.lowBalanceThreshold != null) setThreshold(String(alerts.data.preferences.lowBalanceThreshold)); }, [alerts.data?.preferences?.lowBalanceThreshold]);

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
      const response = await fetch(`${base}/api/privacy/export`, { credentials: 'include' });
      if (!response.ok) throw new Error('Your data could not be downloaded. Please sign in again and retry.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `finance-intelli-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast({ title: 'Export complete', description: 'Your full financial data archive has been downloaded.' });
    } catch (error) {
      toast({ title: 'Export failed', description: error instanceof Error ? error.message : 'Could not export data. Try again.', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => { clearToken(); queryClient.clear(); setLocation('/login'); }
    });
  };

  const selectTheme = (theme: AppThemeId) => {
    applyTheme(theme);
    setActiveTheme(theme);
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
              <Palette className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium text-lg">Appearance</h3>
              <p className="text-sm text-muted-foreground">Choose from eight complete visual styles</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => setThemeOpen(true)}>Change theme</Button>
        </div>

        {/* Alerts */}
        <div className="p-6">
          <div className="mb-5 flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10"><BellRing className="h-5 w-5 text-primary" /></div>
            <div><h3 className="text-lg font-medium">What should need your attention?</h3><p className="text-sm text-muted-foreground">Choose which items appear in your Today action queue.</p></div>
          </div>
          <div className="space-y-3 sm:pl-14">
            <AlertToggle label="Upcoming bills" description="Reminders due within the next 7 days" checked={alerts.data?.preferences?.bills !== false} disabled={saveAlerts.isPending || alerts.isLoading} onChange={value => setAlert('bills', value)} />
            <AlertToggle label="Budget warnings" description="Categories approaching or past a budget limit" checked={alerts.data?.preferences?.budgets !== false} disabled={saveAlerts.isPending || alerts.isLoading} onChange={value => setAlert('budgets', value)} />
            <AlertToggle label="Low balances" description="Accounts below your chosen amount" checked={alerts.data?.preferences?.lowBalance !== false} disabled={saveAlerts.isPending || alerts.isLoading} onChange={value => setAlert('lowBalance', value)} />
            <div className="flex flex-col gap-2 rounded-xl bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium">Low balance threshold</p><p className="text-xs text-muted-foreground">The amount is interpreted in each account’s own currency.</p></div><div className="flex items-center gap-2"><Input aria-label="Low balance threshold" type="number" min="0" step="100" className="h-9 w-32" value={threshold} disabled={saveAlerts.isPending || alerts.isLoading} onChange={event => setThreshold(event.target.value)} onBlur={() => { const value = Number(threshold); if (!Number.isFinite(value) || value < 0) { setThreshold('500'); setAlert('lowBalanceThreshold', 500); } else setAlert('lowBalanceThreshold', value); }} /></div></div>
            <p className="text-xs text-muted-foreground">These are in-app reminders and warnings. Finance Intelli does not send payments or contact your bank.</p>
          </div>
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
      <Dialog open={themeOpen} onOpenChange={setThemeOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Change theme</DialogTitle>
            <p className="text-sm text-muted-foreground">Choose a complete visual system. Your selection is applied instantly and remembered on this device.</p>
          </DialogHeader>
          <div className="grid gap-3 py-2 sm:grid-cols-2">
            {appThemes.map((theme) => {
              const selected = activeTheme === theme.id;
              return (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => selectTheme(theme.id)}
                  className={`group rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg ${selected ? 'border-primary bg-primary/10 ring-2 ring-primary/20' : 'border-border bg-card/70 hover:border-primary/40'}`}
                  aria-pressed={selected}
                >
                  <div className="mb-4 flex h-16 overflow-hidden rounded-xl border border-black/10 shadow-inner">
                    <span className="flex-[2]" style={{ background: theme.colors[0] }} />
                    <span className="flex-1" style={{ background: theme.colors[1] }} />
                    <span className="flex-1" style={{ background: theme.colors[2] }} />
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{theme.name}</h3>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{theme.mode}</span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{theme.description}</p>
                    </div>
                    {selected && <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" />}
                  </div>
                </button>
              );
            })}
          </div>
          <DialogFooter><Button onClick={() => setThemeOpen(false)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>

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

function AlertToggle({ label, description, checked, disabled, onChange }: { label: string; description: string; checked: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/30 p-3"><div><p className="text-sm font-medium">{label}</p><p className="text-xs text-muted-foreground">{description}</p></div><Switch checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={label} /></div>;
}
