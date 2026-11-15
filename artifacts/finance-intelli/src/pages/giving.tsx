import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HandHeart, Heart, Plus, Sparkles } from 'lucide-react';
import { customFetch } from '@workspace/api-client-react/custom-fetch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, formatDate } from '@/lib/utils';

type Account = { id: number; name: string; currency: string };
type Donation = { id: number; amount: number; date: string; description?: string; currency: string; category?: string };
type Reminder = { id: number; title: string; dueDate: string; amount?: number | null; notes?: string | null };
type GivingData = { today: Array<{ currency: string; amount: number }>; month: Array<{ currency: string; amount: number }>; year: Array<{ currency: string; amount: number }>; totalCount: number; recent: Donation[]; reminders: Reminder[] };
type Budget = { id: number; name: string; amount: number; spent: number; period: string; category?: string | null; alertThreshold?: number; version?: number };

const today = () => new Date().toLocaleDateString('en-CA');

export default function Giving() {
  const client = useQueryClient();
  const { toast } = useToast();
  const [cause, setCause] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [accountId, setAccountId] = useState('');
  const [saving, setSaving] = useState(false);
  const [reminderId, setReminderId] = useState<number | null>(null);
  const [reminderTitle, setReminderTitle] = useState('Daily donation');
  const [reminderAmount, setReminderAmount] = useState('');
  const [reminderDate, setReminderDate] = useState(today());
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetAmount, setBudgetAmount] = useState('');
  const data = useQuery({ queryKey: ['giving'], queryFn: () => customFetch<GivingData>('/api/giving', { responseType: 'json' }) });
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => customFetch<Account[]>('/api/accounts', { responseType: 'json' }) });
  const budgets = useQuery({ queryKey: ['budgets'], queryFn: () => customFetch<Budget[]>('/api/budgets', { responseType: 'json' }) });
  const monthlyBudget = budgets.data?.find(budget => budget.period === 'monthly' && budget.category?.toLowerCase() === 'giving');
  const activeAccount = accounts.data?.find(account => String(account.id) === accountId);
  const selectedCurrency = activeAccount?.currency ?? 'INR';
  const monthTotal = useMemo(() => data.data?.month.find(item => item.currency === selectedCurrency)?.amount ?? 0, [data.data, selectedCurrency]);

  const donation = useMutation({
    mutationFn: () => customFetch('/api/transactions', { method: 'POST', responseType: 'json', body: JSON.stringify({
      type: 'expense', amount: Number(amount), date, accountId: Number(accountId), category: 'Giving',
      description: cause.trim() ? `Donation · ${cause.trim()}` : 'Donation', needOrWant: 'want', tags: 'giving',
      notes: 'Recorded from the Giving page',
    }) }),
    onSuccess: async () => {
      let reminderSaved = true;
      if (reminderId) {
        try { await customFetch(`/api/reminders/${reminderId}/complete`, { method: 'POST', responseType: 'json', body: '{}' }); }
        catch { reminderSaved = false; }
      }
      toast({ title: 'Donation recorded', description: reminderSaved ? 'Added to your Giving category.' : 'Donation is saved, but its reminder still needs to be marked complete.' });
      setCause(''); setAmount(''); setReminderId(null); setDate(today());
      await client.invalidateQueries();
    },
    onError: (error: Error) => toast({ title: 'Donation not recorded', description: error.message, variant: 'destructive' }),
  });

  const createReminder = useMutation({
    mutationFn: () => customFetch('/api/reminders', { method: 'POST', responseType: 'json', body: JSON.stringify({
      title: `Giving · ${reminderTitle.trim() || 'Daily donation'}`, type: 'personal', amount: reminderAmount ? Number(reminderAmount) : undefined,
      dueDate: reminderDate, recurring: true, recurringFrequency: 'daily', notes: 'Reminder only. No payment is made automatically.',
    }) }),
    onSuccess: () => { toast({ title: 'Daily reminder added', description: 'Finance Intelli will remind you to record a donation. It will not send money.' }); setReminderTitle('Daily donation'); setReminderAmount(''); client.invalidateQueries({ queryKey: ['giving'] }); client.invalidateQueries({ queryKey: ['/api/dashboard/upcoming-reminders'] }); },
    onError: (error: Error) => toast({ title: 'Reminder not created', description: error.message, variant: 'destructive' }),
  });

  const saveBudget = async () => {
    setSaving(true);
    try {
      const payload = { name: 'Monthly Giving', amount: Number(budgetAmount), period: 'monthly', category: 'Giving', alertThreshold: 80 };
      if (monthlyBudget) {
        await customFetch(`/api/budgets/${monthlyBudget.id}`, { method: 'PATCH', responseType: 'json', body: JSON.stringify({ ...payload, version: monthlyBudget.version }) });
      } else {
        await customFetch('/api/budgets', { method: 'POST', responseType: 'json', body: JSON.stringify(payload) });
      }
      toast({ title: 'Giving limit saved', description: 'You will see a warning as spending approaches this monthly limit.' });
      setBudgetOpen(false); setBudgetAmount(''); await client.invalidateQueries();
    } catch (error) {
      toast({ title: 'Limit not saved', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const recordReminder = (reminder: Reminder) => {
    setReminderId(reminder.id);
    setCause(reminder.title.replace(/^Giving · /i, ''));
    setAmount(reminder.amount ? String(reminder.amount) : '');
    setDate(reminder.dueDate);
    document.getElementById('donation-amount')?.focus();
  };

  return <div className="space-y-7 pb-12">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">Values & generosity</p><h1 className="mt-1 text-3xl font-bold">Giving</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Keep a thoughtful record of donations, set a giving limit, or create a daily reminder. Finance Intelli never sends a payment.</p></div><Button variant="outline" onClick={() => { setBudgetAmount(monthlyBudget ? String(monthlyBudget.amount) : ''); setBudgetOpen(true); }}><Heart className="mr-2 h-4 w-4" />{monthlyBudget ? 'Adjust monthly limit' : 'Set a monthly limit'}</Button></header>

    <section className="grid gap-4 sm:grid-cols-3">
      <Summary icon={HandHeart} label="Given today" values={data.data?.today ?? []} />
      <Summary icon={Heart} label="Given this month" values={data.data?.month ?? []} />
      <Summary icon={Sparkles} label="Given this year" values={data.data?.year ?? []} />
    </section>

    {monthlyBudget && <section className="glass-card rounded-2xl p-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-semibold">Monthly giving limit</p><p className="mt-1 text-xs text-muted-foreground">A spending guardrail, not a target you have to reach.</p></div><p className="font-mono text-sm">{formatCurrency(monthlyBudget.spent)} of {formatCurrency(monthlyBudget.amount)}</p></div><Progress className="mt-4" value={Math.min(100, monthlyBudget.amount ? monthlyBudget.spent / monthlyBudget.amount * 100 : 0)} /><p className="mt-2 text-xs text-muted-foreground">{monthlyBudget.amount > monthlyBudget.spent ? `${formatCurrency(monthlyBudget.amount - monthlyBudget.spent)} remains` : 'Monthly giving limit reached'}</p></section>}

    <section className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
      <form className="glass-card space-y-4 rounded-2xl p-5 sm:p-6" onSubmit={event => { event.preventDefault(); donation.mutate(); }}>
        <div><h2 className="text-lg font-semibold">Record a donation</h2><p className="text-xs text-muted-foreground">This adds an expense to the selected account and the Giving category.</p></div>
        {reminderId && <div className="rounded-lg bg-primary/10 p-3 text-xs text-primary">Recording a scheduled gift. The daily reminder will move forward after this entry is saved.</div>}
        <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="donation-amount">Amount</Label><Input id="donation-amount" className="mt-1" type="number" min="0.01" step="0.01" required value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" /></div><div><Label htmlFor="donation-date">Date</Label><Input id="donation-date" className="mt-1" type="date" required value={date} onChange={event => setDate(event.target.value)} /></div></div>
        <div><Label htmlFor="donation-cause">Cause or organization</Label><Input id="donation-cause" className="mt-1" value={cause} onChange={event => setCause(event.target.value)} placeholder="Community kitchen, local shelter…" /></div>
        <div><Label>Paid from</Label><Select value={accountId} onValueChange={setAccountId}><SelectTrigger className="mt-1"><SelectValue placeholder="Choose an account" /></SelectTrigger><SelectContent>{(accounts.data ?? []).map(account => <SelectItem key={account.id} value={String(account.id)}>{account.name} · {account.currency}</SelectItem>)}</SelectContent></Select></div>
        <Button disabled={donation.isPending || !accountId || !amount} className="w-full sm:w-auto"><Plus className="mr-2 h-4 w-4" />{donation.isPending ? 'Saving…' : 'Record donation'}</Button>
      </form>

      <div className="space-y-5">
        <form className="glass-card space-y-3 rounded-2xl p-5" onSubmit={event => { event.preventDefault(); createReminder.mutate(); }}><div><h2 className="text-lg font-semibold">Daily giving reminder</h2><p className="text-xs text-muted-foreground">A gentle prompt only. Nothing is automatically paid or recorded.</p></div><div><Label htmlFor="reminder-cause">Reminder name</Label><Input id="reminder-cause" className="mt-1" value={reminderTitle} onChange={event => setReminderTitle(event.target.value)} /></div><div className="grid grid-cols-2 gap-3"><div><Label htmlFor="reminder-amount">Suggested amount</Label><Input id="reminder-amount" className="mt-1" type="number" min="0" step="0.01" value={reminderAmount} onChange={event => setReminderAmount(event.target.value)} placeholder="Optional" /></div><div><Label htmlFor="reminder-date">Start date</Label><Input id="reminder-date" className="mt-1" type="date" required value={reminderDate} onChange={event => setReminderDate(event.target.value)} /></div></div><Button variant="outline" className="w-full" disabled={createReminder.isPending}>{createReminder.isPending ? 'Saving…' : 'Set daily reminder'}</Button></form>
        <div className="glass-card rounded-2xl p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Upcoming giving reminders</h2><p className="text-xs text-muted-foreground">Record the donation to complete each reminder.</p></div><a className="text-xs text-primary hover:underline" href="/reminders">All reminders</a></div><div className="mt-3 space-y-2">{data.data?.reminders.map(reminder => <div key={reminder.id} className="flex items-center gap-3 rounded-xl bg-muted/40 p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{reminder.title.replace(/^Giving · /i, '')}</p><p className="text-xs text-muted-foreground">Due {formatDate(reminder.dueDate)}{reminder.amount ? ` · ${formatCurrency(Number(reminder.amount))}` : ''}</p></div><Button size="sm" variant="outline" onClick={() => recordReminder(reminder)}>Record</Button></div>)}{!data.data?.reminders.length && <p className="py-3 text-center text-xs text-muted-foreground">No upcoming giving reminders.</p>}</div></div>
      </div>
    </section>

    <section className="glass-card overflow-hidden rounded-2xl"><div className="border-b border-border/50 p-5"><h2 className="font-semibold">Recent donations</h2><p className="text-xs text-muted-foreground">{data.data?.totalCount ?? 0} recorded contributions in your ledger.</p></div>{data.data?.recent.length ? <div className="divide-y divide-border/50">{data.data.recent.map(item => <div key={item.id} className="flex items-center gap-3 p-4"><div className="rounded-xl bg-rose-500/10 p-2 text-rose-400"><Heart className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.description || 'Donation'}</p><p className="text-xs text-muted-foreground">{formatDate(item.date)} · {item.category || 'Giving'}</p></div><p className="font-mono font-semibold">{formatCurrency(item.amount, item.currency)}</p></div>)}</div> : <div className="p-10 text-center text-sm text-muted-foreground">Your recorded donations will appear here.</div>}</section>

    <Dialog open={budgetOpen} onOpenChange={setBudgetOpen}><DialogContent><DialogHeader><DialogTitle>{monthlyBudget ? 'Adjust monthly giving limit' : 'Set a monthly giving limit'}</DialogTitle></DialogHeader><div className="space-y-3"><p className="text-sm text-muted-foreground">The limit applies to expenses in the Giving category. It creates a warning as you approach the amount.</p><div><Label htmlFor="giving-budget">Monthly limit</Label><Input id="giving-budget" className="mt-1" type="number" min="1" step="0.01" value={budgetAmount} onChange={event => setBudgetAmount(event.target.value)} /></div><Button className="w-full" disabled={saving || !budgetAmount || Number(budgetAmount) <= 0} onClick={() => void saveBudget()}>{saving ? 'Saving…' : 'Save limit'}</Button></div></DialogContent></Dialog>
  </div>;
}

function Summary({ icon: Icon, label, values }: { icon: typeof Heart; label: string; values: Array<{ currency: string; amount: number }> }) {
  return <div className="glass-card rounded-2xl p-5"><Icon className="h-5 w-5 text-primary"/><p className="mt-4 text-xs text-muted-foreground">{label}</p>{values.length ? <div className="mt-1 space-y-1">{values.map(item => <p key={item.currency} className="font-mono text-xl font-bold">{formatCurrency(item.amount, item.currency)}</p>)}</div> : <p className="mt-1 font-mono text-xl font-bold">{formatCurrency(0)}</p>}</div>;
}
