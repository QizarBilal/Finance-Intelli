import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, FileUp, PiggyBank, RefreshCw, ShieldCheck, TrendingUp } from 'lucide-react';
import { customFetch } from '@workspace/api-client-react/custom-fetch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';

type Account = { id: number; name: string; currentBalance: number };
type Forecast = { currentBalance: number; dailyAverage: number; scheduledOutflow: number; projectedBalance: number; days: number; explanation: string };
type Preview = { batchId: number; validRows: number; rows: Array<{ row: number; date: string; amount: number; type: string; description: string; duplicate: boolean; valid: boolean; fingerprint: string }> };

export default function Plan() {
  const { toast } = useToast();
  const client = useQueryClient();
  const [days, setDays] = useState('90');
  const [strategy, setStrategy] = useState('snowball');
  const [accountId, setAccountId] = useState('');
  const [filename, setFilename] = useState('');
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => customFetch<Account[]>('/api/accounts', { responseType: 'json' }) });
  const forecast = useQuery({ queryKey: ['forecast', days], queryFn: () => customFetch<Forecast>(`/api/planning/forecast?days=${days}`, { responseType: 'json' }) });
  const debts = useQuery({ queryKey: ['debt-payoff', strategy], queryFn: () => customFetch<any>(`/api/planning/debt-payoff?strategy=${strategy}`, { responseType: 'json' }) });
  const previewImport = useMutation({
    mutationFn: () => customFetch<Preview>('/api/imports/preview', { method: 'POST', responseType: 'json', body: JSON.stringify({ accountId: Number(accountId), filename, csv }) }),
    onSuccess: setPreview,
    onError: (error: Error) => toast({ title: 'Import preview failed', description: error.message, variant: 'destructive' }),
  });
  const commitImport = useMutation({
    mutationFn: () => customFetch<{ imported: number }>(`/api/imports/${preview!.batchId}/commit`, { method: 'POST', responseType: 'json', body: JSON.stringify({ rows: preview!.rows }) }),
    onSuccess: data => { toast({ title: `${data.imported} transactions imported`, description: 'Duplicates were skipped automatically.' }); setPreview(null); setCsv(''); client.invalidateQueries(); },
    onError: (error: Error) => toast({ title: 'Import failed', description: error.message, variant: 'destructive' }),
  });
  const projectedChange = (forecast.data?.projectedBalance ?? 0) - (forecast.data?.currentBalance ?? 0);
  const importSummary = useMemo(() => preview ? {
    duplicates: preview.rows.filter(row => row.duplicate).length,
    invalid: preview.rows.filter(row => !row.valid).length,
  } : null, [preview]);
  const readFile = async (file?: File) => { if (!file) return; setFilename(file.name); setCsv(await file.text()); setPreview(null); };

  return <div className="space-y-7 pb-10">
    <header><p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">Plan ahead</p><h1 className="mt-1 text-3xl font-bold">Financial plan</h1><p className="mt-1 text-sm text-muted-foreground">Forecast cash flow, choose a debt strategy, and bring statement history into one reliable ledger.</p></header>
    <Tabs defaultValue="forecast">
      <TabsList className="grid w-full grid-cols-3 sm:w-auto"><TabsTrigger value="forecast">Forecast</TabsTrigger><TabsTrigger value="debt">Debt plan</TabsTrigger><TabsTrigger value="import">Import</TabsTrigger></TabsList>
      <TabsContent value="forecast" className="mt-5 space-y-4">
        <div className="flex items-end gap-3"><div className="space-y-1.5"><Label>Forecast window</Label><Select value={days} onValueChange={setDays}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="30">30 days</SelectItem><SelectItem value="90">90 days</SelectItem><SelectItem value="180">6 months</SelectItem><SelectItem value="365">1 year</SelectItem></SelectContent></Select></div><Button variant="outline" size="icon" onClick={() => forecast.refetch()}><RefreshCw className="h-4 w-4" /></Button></div>
        <div className="grid gap-4 sm:grid-cols-3"><Metric label="Current cleared balance" value={forecast.data?.currentBalance} icon={PiggyBank} /><Metric label="Scheduled outflow" value={forecast.data?.scheduledOutflow} icon={CalendarClock} /><Metric label={`Projected in ${days} days`} value={forecast.data?.projectedBalance} icon={TrendingUp} /></div>
        <div className="glass-card rounded-2xl p-5 text-sm text-muted-foreground"><p className="font-medium text-foreground">How this is calculated</p><p className="mt-1">{forecast.data?.explanation}</p><p className={`mt-3 font-mono font-semibold ${projectedChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{projectedChange >= 0 ? '+' : ''}{formatCurrency(projectedChange)} projected movement</p></div>
      </TabsContent>
      <TabsContent value="debt" className="mt-5 space-y-4">
        <div className="max-w-xs space-y-1.5"><Label>Payoff strategy</Label><Select value={strategy} onValueChange={setStrategy}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="snowball">Snowball · smallest first</SelectItem><SelectItem value="avalanche">Avalanche · highest interest first</SelectItem></SelectContent></Select></div>
        {(debts.data?.order ?? []).length === 0 ? <div className="glass-card rounded-2xl p-12 text-center"><ShieldCheck className="mx-auto h-10 w-10 text-emerald-400" /><h2 className="mt-3 text-lg font-semibold">No debt accounts</h2><p className="text-sm text-muted-foreground">Add a loan or credit-card account to build a payoff order.</p></div> :
        <div className="space-y-3">{debts.data.order.map((debt: any, index: number) => <div key={debt.id} className="glass-card flex items-center gap-4 rounded-2xl p-4"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">{index + 1}</div><div className="flex-1"><p className="font-semibold">{debt.name}</p><p className="text-xs text-muted-foreground">{debt.interestRate}% APR · minimum {formatCurrency(debt.minimumPayment)}</p></div><p className="font-mono font-bold">{formatCurrency(debt.balance)}</p></div>)}</div>}
      </TabsContent>
      <TabsContent value="import" className="mt-5">
        <div className="glass-card rounded-2xl p-5 sm:p-6"><div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Destination account</Label><Select value={accountId} onValueChange={setAccountId}><SelectTrigger><SelectValue placeholder="Choose account" /></SelectTrigger><SelectContent>{(accounts.data ?? []).map(account => <SelectItem key={account.id} value={String(account.id)}>{account.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>CSV statement</Label><Input type="file" accept=".csv,text/csv" onChange={event => readFile(event.target.files?.[0])} /></div>
        </div>
        <div className="mt-5 flex items-center justify-between gap-3 rounded-xl bg-muted/50 p-4"><div><p className="font-medium">{filename || 'No statement selected'}</p><p className="text-xs text-muted-foreground">Expected columns: Date, Amount, Description, Type, Category. Preview never writes transactions.</p></div><Button onClick={() => previewImport.mutate()} disabled={!accountId || !csv || previewImport.isPending}><FileUp className="mr-2 h-4 w-4" />Preview</Button></div>
        {preview && <div className="mt-5 space-y-4"><div className="grid grid-cols-3 gap-3"><Small label="Ready" value={preview.validRows} /><Small label="Duplicates" value={importSummary!.duplicates} /><Small label="Invalid" value={importSummary!.invalid} /></div><div className="max-h-72 overflow-auto rounded-xl border"><table className="w-full text-sm"><thead className="sticky top-0 bg-card"><tr><th className="p-3 text-left">Date</th><th className="p-3 text-left">Description</th><th className="p-3 text-right">Amount</th><th className="p-3 text-right">State</th></tr></thead><tbody>{preview.rows.slice(0, 100).map(row => <tr key={row.row} className="border-t"><td className="p-3">{row.date}</td><td className="max-w-56 truncate p-3">{row.description}</td><td className="p-3 text-right font-mono">{formatCurrency(row.amount)}</td><td className="p-3 text-right text-xs">{row.duplicate ? 'Duplicate' : !row.valid ? 'Invalid' : 'Ready'}</td></tr>)}</tbody></table></div><Button onClick={() => commitImport.mutate()} disabled={!preview.validRows || commitImport.isPending}>Import {preview.validRows} transactions</Button></div>}
        </div>
      </TabsContent>
    </Tabs>
  </div>;
}
function Metric({ label, value, icon: Icon }: { label: string; value?: number; icon: typeof PiggyBank }) { return <div className="glass-card rounded-2xl p-5"><Icon className="h-5 w-5 text-primary" /><p className="mt-4 text-xs text-muted-foreground">{label}</p><p className="mt-1 font-mono text-2xl font-bold">{value == null ? '—' : formatCurrency(value)}</p></div>; }
function Small({ label, value }: { label: string; value: number }) { return <div className="rounded-xl bg-muted/50 p-3 text-center"><p className="text-xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>; }
