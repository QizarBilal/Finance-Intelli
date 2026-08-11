import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Building2, CreditCard, Landmark, Pencil, Plus, RefreshCw, Trash2, WalletCards } from 'lucide-react';
import { customFetch } from '@workspace/api-client-react/custom-fetch';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';

type Account = {
  id: number; name: string; type: string; currency: string; openingBalance: number;
  currentBalance: number; institution?: string | null; status: string;
  lastReconciledDate?: string | null; version: number;
};
const types = [
  ['bank', 'Bank account'], ['cash', 'Cash'], ['credit_card', 'Credit card'],
  ['loan', 'Loan'], ['investment', 'Investment'], ['wallet', 'Digital wallet'],
];

export default function Accounts() {
  const client = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'bank', openingBalance: '0', institution: '' });
  const [transfer, setTransfer] = useState({ fromAccountId: '', toAccountId: '', amount: '', date: new Date().toLocaleDateString('en-CA'), description: '' });
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => customFetch<Account[]>('/api/accounts', { responseType: 'json' }), staleTime: 30_000 });
  const refresh = () => { client.invalidateQueries({ queryKey: ['accounts'] }); client.invalidateQueries({ queryKey: ['/api/dashboard/summary'] }); };
  const create = useMutation({
    mutationFn: () => customFetch('/api/accounts', { method: 'POST', responseType: 'json', body: JSON.stringify({ ...form, openingBalance: Number(form.openingBalance) }) }),
    onSuccess: () => { refresh(); setCreateOpen(false); setForm({ name: '', type: 'bank', openingBalance: '0', institution: '' }); toast({ title: 'Account created' }); },
    onError: (error: Error) => toast({ title: 'Account could not be created', description: error.message, variant: 'destructive' }),
  });
  const update = useMutation({
    mutationFn: () => customFetch(`/api/accounts/${editing!.id}`, { method: 'PATCH', responseType: 'json', body: JSON.stringify({ ...form, openingBalance: Number(form.openingBalance), version: editing!.version }) }),
    onSuccess: () => { refresh(); closeEdit(); toast({ title: 'Account updated' }); },
    onError: (error: Error) => toast({ title: 'Account could not be updated', description: error.message, variant: 'destructive' }),
  });
  const remove = useMutation({
    mutationFn: (account: Account) => customFetch(`/api/accounts/${account.id}`, { method: 'DELETE' }),
    onSuccess: () => { refresh(); toast({ title: 'Account removed', description: 'Accounts with transaction history are safely archived.' }); },
    onError: (error: Error) => toast({ title: 'Account could not be removed', description: error.message, variant: 'destructive' }),
  });
  const beginEdit = (account: Account) => {
    setForm({ name: account.name, type: account.type, openingBalance: String(account.openingBalance), institution: account.institution ?? '' });
    setEditing(account);
  };
  const closeEdit = () => { setEditing(null); setForm({ name: '', type: 'bank', openingBalance: '0', institution: '' }); };
  const move = useMutation({
    mutationFn: () => customFetch('/api/transfers', { method: 'POST', responseType: 'json', body: JSON.stringify({ ...transfer, fromAccountId: Number(transfer.fromAccountId), toAccountId: Number(transfer.toAccountId), amount: Number(transfer.amount) }) }),
    onSuccess: () => { refresh(); setTransferOpen(false); toast({ title: 'Transfer posted', description: 'Both ledger entries were saved atomically.' }); },
    onError: (error: Error) => toast({ title: 'Transfer failed', description: error.message, variant: 'destructive' }),
  });
  const rows = accounts.data ?? [];
  const netWorth = rows.reduce((sum, account) => sum + account.currentBalance, 0);
  return (
    <div className="space-y-7 pb-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">Money map</p><h1 className="mt-1 text-3xl font-bold">Accounts</h1><p className="mt-1 text-sm text-muted-foreground">Opening balances plus cleared and reconciled ledger entries.</p></div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={refresh} aria-label="Refresh balances"><RefreshCw className="h-4 w-4" /></Button>
          <Dialog open={transferOpen} onOpenChange={setTransferOpen}><DialogTrigger asChild><Button variant="outline"><ArrowRightLeft className="mr-2 h-4 w-4" />Transfer</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Move money</DialogTitle></DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="From"><AccountSelect value={transfer.fromAccountId} onChange={value => setTransfer(p => ({ ...p, fromAccountId: value }))} rows={rows} /></Field>
              <Field label="To"><AccountSelect value={transfer.toAccountId} onChange={value => setTransfer(p => ({ ...p, toAccountId: value }))} rows={rows.filter(a => String(a.id) !== transfer.fromAccountId)} /></Field>
              <Field label="Amount"><Input type="number" min="0.01" step="0.01" value={transfer.amount} onChange={e => setTransfer(p => ({ ...p, amount: e.target.value }))} /></Field>
              <Field label="Date"><Input type="date" value={transfer.date} onChange={e => setTransfer(p => ({ ...p, date: e.target.value }))} /></Field>
              <div className="sm:col-span-2"><Field label="Note"><Input value={transfer.description} onChange={e => setTransfer(p => ({ ...p, description: e.target.value }))} /></Field></div>
            </div><Button onClick={() => move.mutate()} disabled={move.isPending || !transfer.fromAccountId || !transfer.toAccountId || !transfer.amount}>Post transfer</Button>
          </DialogContent></Dialog>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Add account</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Add account</DialogTitle></DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><Field label="Name"><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Everyday bank account" /></Field></div>
              <Field label="Type"><Select value={form.type} onValueChange={value => setForm(p => ({ ...p, type: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{types.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Opening balance"><Input type="number" step="0.01" value={form.openingBalance} onChange={e => setForm(p => ({ ...p, openingBalance: e.target.value }))} /></Field>
              <div className="sm:col-span-2"><Field label="Institution"><Input value={form.institution} onChange={e => setForm(p => ({ ...p, institution: e.target.value }))} /></Field></div>
            </div><Button onClick={() => create.mutate()} disabled={create.isPending || form.name.trim().length < 2}>Create account</Button>
          </DialogContent></Dialog>
        </div>
      </header>
      <Dialog open={editing !== null} onOpenChange={open => { if (!open) closeEdit(); }}><DialogContent><DialogHeader><DialogTitle>Edit account</DialogTitle></DialogHeader>
        <AccountFields form={form} setForm={setForm} />
        <Button onClick={() => update.mutate()} disabled={update.isPending || form.name.trim().length < 2}>Save changes</Button>
      </DialogContent></Dialog>
      <div className="glass-card flex items-center gap-4 rounded-2xl p-5"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><WalletCards className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground">Net worth</p><p className="font-mono text-2xl font-bold">{formatCurrency(netWorth)}</p></div></div>
      {accounts.isLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[1,2,3].map(i => <div key={i} className="h-44 animate-pulse rounded-2xl bg-muted" />)}</div> :
      rows.length === 0 ? <div className="glass-card rounded-2xl p-14 text-center"><WalletCards className="mx-auto h-10 w-10 text-primary" /><h2 className="mt-4 text-xl font-semibold">Add where your money lives</h2><Button className="mt-5" onClick={() => setCreateOpen(true)}>Add first account</Button></div> :
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{rows.map(account => { const Icon = account.type === 'bank' ? Landmark : account.type === 'credit_card' ? CreditCard : Building2; return <article key={account.id} className="glass-card-hover rounded-2xl p-5"><div className="flex justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div><div className="flex items-center gap-1"><Button variant="ghost" size="icon" aria-label={`Edit ${account.name}`} onClick={() => beginEdit(account)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" aria-label={`Delete ${account.name}`} disabled={remove.isPending} onClick={() => { if (confirm(`Remove ${account.name}? Existing transactions will be preserved.`)) remove.mutate(account); }}><Trash2 className="h-4 w-4" /></Button></div></div><p className="mt-5 text-sm text-muted-foreground">{account.institution || account.currency} · <span className="capitalize">{account.type.replace('_',' ')}</span></p><h2 className="truncate text-lg font-semibold">{account.name}</h2><p className="mt-3 font-mono text-2xl font-bold">{formatCurrency(account.currentBalance)}</p><p className="mt-4 border-t pt-3 text-xs text-muted-foreground">Opening {formatCurrency(account.openingBalance)}</p></article>; })}</div>}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }
function AccountFields({ form, setForm }: { form: { name: string; type: string; openingBalance: string; institution: string }; setForm: React.Dispatch<React.SetStateAction<{ name: string; type: string; openingBalance: string; institution: string }>> }) { return <div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><Field label="Name"><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></Field></div><Field label="Type"><Select value={form.type} onValueChange={value => setForm(p => ({ ...p, type: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{types.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field><Field label="Opening balance"><Input type="number" step="0.01" value={form.openingBalance} onChange={e => setForm(p => ({ ...p, openingBalance: e.target.value }))} /></Field><div className="sm:col-span-2"><Field label="Institution"><Input value={form.institution} onChange={e => setForm(p => ({ ...p, institution: e.target.value }))} /></Field></div></div>; }
function AccountSelect({ value, onChange, rows }: { value: string; onChange: (value: string) => void; rows: Account[] }) { return <Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue placeholder="Choose account" /></SelectTrigger><SelectContent>{rows.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name} · {formatCurrency(a.currentBalance)}</SelectItem>)}</SelectContent></Select>; }
