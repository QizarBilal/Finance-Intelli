import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileUp, Loader2, ShieldCheck, Undo2 } from 'lucide-react';
import { customFetch } from '@workspace/api-client-react/custom-fetch';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { formatCurrency } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

type ImportRow = { date: string; amount: number; description: string; type: 'income' | 'expense'; reference?: string; occurrence: number };
type Preview = { batchId: number; validRows: number; rows: Array<{ row: number; date: string; amount: number; type: string; description: string; category?: string | null; categorySource?: 'rule' | 'statement' | null; categoryEdited?: boolean; duplicate: boolean; valid: boolean; fingerprint: string; reason?: string | null }> };
type Account = { id: number; name: string; currency: string };
type ImportBatch = { id: number; filename: string; accountName: string; importedRows?: number; status: string; createdAt: string };
type Category = { id: number; name: string; type: string };

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') { cell += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if ((char === ',' || char === '\t') && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; cell = '';
    } else cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function toDate(value: string): string | null {
  const raw = value.trim();
  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  const dmy = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  const parts = iso ? [iso[1], iso[2], iso[3]] : dmy ? [dmy[3], dmy[2], dmy[1]] : null;
  if (!parts) return null;
  const [year, month, day] = parts.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseStatement(text: string): { rows: ImportRow[]; ignored: number } {
  const grid = parseCsv(text.replace(/^\uFEFF/, ''));
  if (grid.length < 2) throw new Error('This file has no transaction rows.');
  const headers = grid[0].map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const find = (...names: string[]) => headers.findIndex(h => names.includes(h));
  const dateAt = find('date', 'transactiondate', 'txndate');
  const amountAt = find('amount', 'transactionamount', 'paidamount');
  const textAt = find('transactiondetails', 'description', 'narration', 'remarks', 'merchant', 'transactiondescription');
  const typeAt = find('type', 'transactiontype', 'transactiondirection', 'drcr');
  const refAt = find('transactionid', 'txnid', 'referenceno', 'referenceid', 'upiid');
  const statusAt = find('status', 'transactionstatus', 'txnstatus');
  if (dateAt < 0 || amountAt < 0 || textAt < 0 || typeAt < 0) throw new Error('Could not identify Date, Amount, Transaction Details, and Type columns. Please save the Paytm statement as CSV and check its header row.');
  const occurrences = new Map<string, number>();
  const parsed: ImportRow[] = [];
  let ignored = 0;
  for (const line of grid.slice(1)) {
    const status = (line[statusAt] ?? '').toLowerCase();
    if (status && /fail|declin|cancel|revers|pending/.test(status)) { ignored++; continue; }
    const date = toDate(line[dateAt] ?? '');
    const description = (line[textAt] ?? '').trim();
    const rawAmount = (line[amountAt] ?? '').replace(/[₹,\s]/g, '');
    const amount = Math.abs(Number(rawAmount.replace(/[+]/g, '')));
    if (!date || !description || !Number.isFinite(amount) || amount <= 0) { ignored++; continue; }
    const direction = (line[typeAt] ?? '').toLowerCase();
    const type = /credit|received|refund|cashback|deposit|\bcr\b/.test(direction) ? 'income'
      : /debit|paid|sent|withdraw|\bdr\b/.test(direction) ? 'expense'
      : rawAmount.startsWith('-') ? 'expense' : rawAmount.startsWith('+') ? 'income' : null;
    if (!type) { ignored++; continue; }
    const reference = line[refAt] || undefined;
    const key = `${date}|${amount.toFixed(2)}|${description.toLocaleLowerCase()}|${reference ?? ''}`;
    const occurrence = occurrences.get(key) ?? 0;
    occurrences.set(key, occurrence + 1);
    parsed.push({ date, amount, description, type, reference, occurrence });
  }
  if (!parsed.length) throw new Error('No usable rows found. Check the date format, transaction type, and amount columns.');
  if (parsed.length > 5000) throw new Error('This file has more than 5,000 usable rows. Split it into smaller date ranges and import each separately.');
  return { rows: parsed, ignored };
}

const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

export function PaytmStatementImport() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [fileName, setFileName] = useState('');
  const [accountId, setAccountId] = useState('');
  const [error, setError] = useState('');
  const [ignored, setIgnored] = useState(0);
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [bulkCategory, setBulkCategory] = useState('');
  const { toast } = useToast();
  const client = useQueryClient();
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => customFetch<Account[]>('/api/accounts', { responseType: 'json' }) });
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => customFetch<Category[]>('/api/categories', { responseType: 'json' }) });
  const history = useQuery({ queryKey: ['imports'], queryFn: () => customFetch<ImportBatch[]>('/api/imports', { responseType: 'json' }), enabled: open });
  const normalizedCsv = useMemo(() => [
    ['Date', 'Amount', 'Description', 'Type', 'Category'].join(','),
    ...rows.map(row => [row.date, row.type === 'expense' ? -row.amount : row.amount, row.description, row.type, ''].map(value => csvCell(String(value))).join(',')),
  ].join('\n'), [rows]);
  const previewImport = useMutation({
    mutationFn: () => customFetch<Preview>('/api/imports/preview', { method: 'POST', responseType: 'json', body: JSON.stringify({ accountId: Number(accountId), filename: fileName, csv: normalizedCsv }) }),
    onSuccess: setPreview,
    onError: (cause: Error) => setError(cause.message),
  });
  const commitImport = useMutation({
    mutationFn: () => customFetch<{ imported: number; duplicatesSkipped: number; invalidSkipped: number }>(`/api/imports/${preview!.batchId}/commit`, { method: 'POST', responseType: 'json', body: JSON.stringify({ rows: preview!.rows }) }),
    onSuccess: result => {
      toast({ title: `${result.imported} transactions imported`, description: `${result.duplicatesSkipped} duplicates and ${result.invalidSkipped} invalid rows skipped.` });
      client.invalidateQueries(); setOpen(false); setRows([]); setPreview(null); setSelectedRows([]); setFileName(''); setError('');
    },
    onError: (cause: Error) => toast({ title: 'Import failed', description: cause.message, variant: 'destructive' }),
  });
  const undoImport = useMutation({
    mutationFn: (batch: ImportBatch) => customFetch<{ undone: number }>(`/api/imports/${batch.id}`, { method: 'DELETE', responseType: 'json' }),
    onSuccess: result => { client.invalidateQueries(); toast({ title: 'Import undone', description: `${result.undone} imported transactions were removed from your ledger.` }); },
    onError: (cause: Error) => toast({ title: 'Could not undo import', description: cause.message, variant: 'destructive' }),
  });
  const summary = useMemo(() => ({
    duplicates: preview?.rows.filter(row => row.duplicate).length ?? 0,
    invalid: preview?.rows.filter(row => !row.valid).length ?? 0,
  }), [preview]);
  const updatePreviewRow = (rowNumber: number, changes: Partial<Preview['rows'][number]>) => setPreview(current => {
    if (!current) return current;
    const rows = current.rows.map(row => {
      if (row.row !== rowNumber) return row;
      const next = { ...row, ...changes, categoryEdited: changes.category !== undefined ? true : row.categoryEdited, duplicate: false };
      const amount = Number(next.amount);
      next.valid = /^\d{4}-\d{2}-\d{2}$/.test(next.date) && Number.isFinite(amount) && amount > 0 && ['income', 'expense'].includes(next.type) && Boolean(next.description.trim());
      return next;
    });
    return { ...current, rows, validRows: rows.filter(row => row.valid && !row.duplicate).length };
  });
  const applyCategoryToSelected = () => {
    setPreview(current => current ? {
      ...current,
      rows: current.rows.map(row => selectedRows.includes(row.row)
        ? { ...row, category: bulkCategory === '__uncategorized__' ? null : bulkCategory, categoryEdited: true, duplicate: false }
        : row),
    } : current);
    setSelectedRows([]); setBulkCategory('');
  };
  const chooseFile = async (file?: File) => {
    setError(''); setRows([]); setPreview(null); setFileName(''); setIgnored(0);
    if (!file) return;
    if (!/\.csv$/i.test(file.name) || file.size > 900 * 1024) { setError('Choose a CSV file smaller than 900 KB.'); return; }
    try { const result = parseStatement(await file.text()); setRows(result.rows); setIgnored(result.ignored); setFileName(file.name); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not read this statement.'); }
  };
  const totals = rows.reduce((sum, row) => ({ ...sum, [row.type]: sum[row.type] + row.amount }), { income: 0, expense: 0 });
  const selectedAccount = accounts.data?.find(account => String(account.id) === accountId);

  return <>
    <Button variant="outline" onClick={() => setOpen(true)}><FileUp className="mr-2 h-4 w-4" />Import statement</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader><DialogTitle>Import a Paytm statement</DialogTitle><DialogDescription>Review the transactions before adding them to your ledger.</DialogDescription></DialogHeader>
        <div className="space-y-5">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm"><div className="flex gap-2 font-medium"><ShieldCheck className="h-4 w-4 text-primary" />Private statement import</div><p className="mt-1 text-muted-foreground">Your Paytm password and OTP are never requested. Download a UPI statement, then save its Excel file as CSV.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="paytm-file">Statement file</Label><input id="paytm-file" type="file" accept=".csv,text/csv" onChange={e => void chooseFile(e.target.files?.[0])} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-primary" />{fileName && <p className="text-xs text-muted-foreground">{fileName} · {rows.length} rows</p>}</div>
            <div className="space-y-2"><Label>Save to account</Label><Select value={accountId} onValueChange={value => { setAccountId(value); setPreview(null); }}><SelectTrigger><SelectValue placeholder="Choose an account" /></SelectTrigger><SelectContent>{(accounts.data ?? []).map(account => <SelectItem key={account.id} value={String(account.id)}>{account.name} · {account.currency}</SelectItem>)}</SelectContent></Select></div>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {rows.length > 0 && <>
            <div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Money received</p><p className="font-mono font-semibold">{formatCurrency(totals.income, selectedAccount?.currency ?? 'INR')}</p></div><div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Money spent</p><p className="font-mono font-semibold">{formatCurrency(totals.expense, selectedAccount?.currency ?? 'INR')}</p></div></div>
            {ignored > 0 && <p className="text-xs text-muted-foreground">{ignored} rows with failed, pending, or unreadable data were left out. Confirm your statement period before importing.</p>}
            {!preview ? <div className="flex justify-end"><Button onClick={() => { setError(''); previewImport.mutate(); }} disabled={!accountId || previewImport.isPending}>{previewImport.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Preview {rows.length} transactions</Button></div> : <>
              <div className="grid grid-cols-3 gap-3"><Stat label="Ready to import" value={preview.validRows} /><Stat label="Duplicates skipped" value={summary.duplicates} /><Stat label="Needs review" value={summary.invalid} /></div>
              <p className="text-xs text-muted-foreground">Suggested categories come from your saved rules. You can change any row or apply one category to the selected rows. Duplicates are checked again when you import.</p>
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 p-2"><span className="text-xs text-muted-foreground">{selectedRows.length} selected</span><Select value={bulkCategory} onValueChange={setBulkCategory}><SelectTrigger className="h-8 w-52"><SelectValue placeholder="Assign category to selected" /></SelectTrigger><SelectContent><SelectItem value="__uncategorized__">Uncategorized</SelectItem>{categories.data?.filter(category => category.type === 'both' || category.type === 'expense' || category.type === 'income').map(category => <SelectItem key={category.id} value={category.name}>{category.name}</SelectItem>)}</SelectContent></Select><Button size="sm" variant="outline" disabled={!selectedRows.length || !bulkCategory} onClick={applyCategoryToSelected}>Apply category</Button><Button size="sm" variant="ghost" onClick={() => setSelectedRows(preview.rows.filter(row => !row.duplicate && row.valid).map(row => row.row))}>Select ready rows</Button></div>
              <div className="max-h-72 overflow-auto rounded-xl border"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-muted"><tr><th className="p-2"><Checkbox aria-label="Select all preview rows" checked={preview.rows.length > 0 && selectedRows.length === preview.rows.length} onCheckedChange={checked => setSelectedRows(checked ? preview.rows.map(row => row.row) : [])} /></th><th className="p-2">Date</th><th className="p-2">Details</th><th className="p-2">Type</th><th className="p-2">Category</th><th className="p-2 text-right">Amount</th><th className="p-2 text-right">Status</th></tr></thead><tbody>{preview.rows.slice(0, 100).map(row => <tr key={row.row} className="border-t"><td className="p-2"><Checkbox aria-label={`Select imported row ${row.row}`} checked={selectedRows.includes(row.row)} onCheckedChange={checked => setSelectedRows(current => checked ? [...new Set([...current, row.row])] : current.filter(id => id !== row.row))} /></td><td className="p-1"><Input aria-label={`Date for row ${row.row}`} type="date" value={row.date} onChange={e => updatePreviewRow(row.row, { date: e.target.value })} className="h-8 min-w-32 px-1 text-[11px]" /></td><td className="p-1"><Input aria-label={`Description for row ${row.row}`} value={row.description} onChange={e => updatePreviewRow(row.row, { description: e.target.value })} className="h-8 min-w-36 px-2 text-[11px]" /></td><td className="p-1"><Select value={row.type === 'income' ? 'income' : 'expense'} onValueChange={type => updatePreviewRow(row.row, { type })}><SelectTrigger aria-label={`Type for row ${row.row}`} className="h-8 min-w-24 px-2 text-[11px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="expense">Expense</SelectItem><SelectItem value="income">Income</SelectItem></SelectContent></Select></td><td className="p-1"><Select value={row.category || '__uncategorized__'} onValueChange={category => updatePreviewRow(row.row, { category: category === '__uncategorized__' ? null : category })}><SelectTrigger aria-label={`Category for row ${row.row}`} className="h-8 min-w-32 px-1 text-[11px]"><SelectValue placeholder="Category" /></SelectTrigger><SelectContent><SelectItem value="__uncategorized__">Uncategorized</SelectItem>{categories.data?.filter(category => category.type === 'both' || category.type === row.type).map(category => <SelectItem key={category.id} value={category.name}>{category.name}</SelectItem>)}</SelectContent></Select></td><td className="p-1"><Input aria-label={`Amount for row ${row.row}`} type="number" min="0.01" step="0.01" value={Number(row.amount) || ''} onChange={e => updatePreviewRow(row.row, { amount: Number(e.target.value) })} className="h-8 min-w-28 px-2 text-right text-[11px]" /></td><td className="p-2 text-right">{row.duplicate ? 'Duplicate' : !row.valid ? row.reason || 'Invalid' : 'Ready'}</td></tr>)}</tbody></table>{preview.rows.length > 100 && <p className="p-2 text-center text-muted-foreground">Showing 100 of {preview.rows.length} rows</p>}</div>
              <div className="flex justify-between"><Button variant="outline" onClick={() => setPreview(null)}>Back</Button><Button onClick={() => commitImport.mutate()} disabled={!preview.validRows || commitImport.isPending}>{commitImport.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{commitImport.isPending ? 'Importing…' : `Import ${preview.validRows} transactions`}</Button></div>
            </>}
          </>}
          <section className="border-t pt-4"><h3 className="text-sm font-semibold">Recent imports</h3><div className="mt-2 space-y-2">{history.data?.filter(batch => ['completed', 'undone'].includes(batch.status)).slice(0, 5).map(batch => <div key={batch.id} className="flex items-center gap-3 rounded-lg bg-muted/40 p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{batch.filename}</p><p className="text-xs text-muted-foreground">{batch.accountName} · {batch.importedRows ?? 0} rows · {new Date(batch.createdAt).toLocaleDateString()}</p></div><span className="text-xs capitalize text-muted-foreground">{batch.status}</span>{batch.status === 'completed' && <Button size="sm" variant="ghost" disabled={undoImport.isPending} onClick={() => { if (confirm(`Undo this import and remove its ${batch.importedRows ?? 0} transactions?`)) undoImport.mutate(batch); }}><Undo2 className="mr-1 h-3.5 w-3.5" />Undo</Button>}</div>)}{!history.isLoading && !history.data?.some(batch => ['completed', 'undone'].includes(batch.status)) && <p className="text-xs text-muted-foreground">Your completed imports will appear here.</p>}</div></section>
        </div>
        <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

function Stat({ label, value }: { label: string; value: number }) { return <div className="rounded-xl bg-muted/50 p-3 text-center"><p className="text-xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>; }
