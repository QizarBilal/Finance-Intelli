import { useState } from 'react';
import { useListTransactions, useGetDashboardSummary, Transaction } from '@workspace/api-client-react';
import { FileText, Download, TrendingUp, Calendar, IndianRupee, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, subDays } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react/custom-fetch';

type Period = 'this-month' | 'last-month' | 'last-3-months' | 'this-year' | 'all-time';

function toDateStr(d: Date) {
  return format(d, 'yyyy-MM-dd');
}

function getPeriodDates(period: Period): { from: string; to: string; label: string } {
  const now = new Date();
  switch (period) {
    case 'this-month':
      return { from: toDateStr(startOfMonth(now)), to: toDateStr(endOfMonth(now)), label: format(now, 'MMMM yyyy') };
    case 'last-month': {
      const last = subMonths(now, 1);
      return { from: toDateStr(startOfMonth(last)), to: toDateStr(endOfMonth(last)), label: format(last, 'MMMM yyyy') };
    }
    case 'last-3-months':
      return { from: toDateStr(subDays(now, 89)), to: toDateStr(now), label: 'Last 90 days' };
    case 'this-year':
      return { from: toDateStr(startOfYear(now)), to: toDateStr(endOfYear(now)), label: `Year ${now.getFullYear()}` };
    case 'all-time':
      return { from: '2000-01-01', to: toDateStr(now), label: 'All Time' };
  }
}

function downloadCSV(transactions: Transaction[], label: string) {
  const headers = ['Date', 'Type', 'Amount', 'Category', 'Description', 'Payment Method', 'Tags', 'Notes', 'Need/Want', 'Tax Deductible', 'Recurring'];
  const rows = transactions.map(t => [
    t.date,
    t.type,
    t.amount.toFixed(2),
    t.category || '',
    t.description || '',
    t.paymentMethod || '',
    t.tags || '',
    t.notes || '',
    t.needOrWant || '',
    t.taxDeductible ? 'Yes' : 'No',
    t.recurring ? 'Yes' : 'No',
  ]);
  const csv = [headers, ...rows].map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `finance-intelli-${label.replace(/\s+/g, '-').toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadJSON(transactions: Transaction[], summary: Record<string, unknown>, label: string) {
  const payload = {
    exportedAt: new Date().toISOString(),
    period: label,
    summary,
    transactions,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `finance-intelli-${label.replace(/\s+/g, '-').toLowerCase()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const [period, setPeriod] = useState<Period>('this-month');
  const { from, to, label } = getPeriodDates(period);

  const { data: txData, isLoading } = useListTransactions({ dateFrom: from, dateTo: to, limit: 10 });
  const { data: summary } = useGetDashboardSummary();
  const queryString = new URLSearchParams({ dateFrom: from, dateTo: to }).toString();
  const { data: report } = useQuery({
    queryKey: ['report-summary', from, to],
    queryFn: () => customFetch<any>(`/api/reports/summary?${queryString}`, { responseType: 'json' }),
  });

  const transactions: Transaction[] = txData?.data || [];
  const total = txData?.total ?? 0;

  const income = report?.income ?? 0;
  const expense = report?.expense ?? 0;
  const savings = income - expense;

  // Category breakdown
  const topCategories: [string, number][] = (report?.categories ?? []).slice(0, 5).map((item: any) => [item.category, item.amount]);

  // Tax deductible total
  const taxDeductible = report?.taxDeductible ?? 0;

  const summaryPayload = { period: label, from, to, income, expense, savings, transactionCount: total, taxDeductible, topCategories: Object.fromEntries(topCategories) };

  return (
    <div className="max-w-4xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground mt-1">Generate and export your financial statements.</p>
        </div>
        <Select value={period} onValueChange={v => setPeriod(v as Period)}>
          <SelectTrigger className="w-48 glass-card border-none">
            <Calendar className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="this-month">This Month</SelectItem>
            <SelectItem value="last-month">Last Month</SelectItem>
            <SelectItem value="last-3-months">Last 90 Days</SelectItem>
            <SelectItem value="this-year">This Year</SelectItem>
            <SelectItem value="all-time">All Time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Period label */}
      <div className="text-sm text-muted-foreground">
        Showing data for: <span className="text-foreground font-medium">{label}</span>
        {' '}({total} transactions)
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Income', value: income, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: 'Expense', value: expense, color: 'text-rose-400', bg: 'bg-rose-500/10' },
          { label: 'Net Savings', value: savings, color: savings >= 0 ? 'text-blue-400' : 'text-rose-400', bg: 'bg-blue-500/10' },
          { label: 'Tax Deductible', value: taxDeductible, color: 'text-amber-400', bg: 'bg-amber-500/10' },
        ].map(card => (
          <div key={card.label} className={`glass-card rounded-2xl p-5 ${card.bg} border border-white/5`}>
            <div className="text-xs text-muted-foreground mb-2">{card.label}</div>
            <div className={`text-xl font-mono font-bold ${card.color}`}>{formatCurrency(card.value)}</div>
          </div>
        ))}
      </div>

      {/* Top spending categories */}
      {topCategories.length > 0 && (
        <div className="glass-card rounded-2xl p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" /> Top Spending Categories
          </h3>
          <div className="space-y-3">
            {topCategories.map(([cat, amt]) => (
              <div key={cat} className="flex items-center gap-4">
                <div className="w-32 text-sm text-muted-foreground truncate">{cat}</div>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary/70 rounded-full"
                    style={{ width: `${expense > 0 ? (amt / expense) * 100 : 0}%` }}
                  />
                </div>
                <div className="w-24 text-sm font-mono text-right">{formatCurrency(amt)}</div>
                <div className="w-12 text-xs text-muted-foreground text-right">
                  {expense > 0 ? `${((amt / expense) * 100).toFixed(0)}%` : '—'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Export cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-card rounded-2xl p-6 border-l-4 border-l-primary">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <FileSpreadsheet className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-1">Export as CSV</h3>
          <p className="text-muted-foreground text-sm mb-6">
            Download {total} transactions as a spreadsheet. Opens in Excel, Google Sheets, or any CSV viewer.
          </p>
          <Button
            className="w-full"
            disabled={isLoading || transactions.length === 0}
            onClick={() => { window.location.href = `/api/reports/export.csv?${queryString}`; }}
          >
            <Download className="w-4 h-4 mr-2" />
            {isLoading ? 'Loading…' : `Download complete CSV (${total} rows)`}
          </Button>
        </div>

        <div className="glass-card rounded-2xl p-6 border-l-4 border-l-emerald-500">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
            <FileText className="w-6 h-6 text-emerald-500" />
          </div>
          <h3 className="text-xl font-semibold mb-1">PDF Statement</h3>
          <p className="text-muted-foreground text-sm mb-6">
            Generate a print-ready statement from server-verified financial data.
          </p>
          <Button
            className="w-full"
            variant="secondary"
            disabled={isLoading || transactions.length === 0}
            onClick={() => { window.location.href = `/api/reports/statement.pdf?${queryString}`; }}
          >
            <Download className="w-4 h-4 mr-2" />
            {isLoading ? 'Loading…' : 'Download PDF'}
          </Button>
        </div>
      </div>

      {/* Recent transactions preview */}
      {transactions.length > 0 && (
        <div className="glass-card rounded-2xl p-6">
          <h3 className="font-semibold mb-4">Preview ({Math.min(10, transactions.length)} of {total})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-muted-foreground">
                  <th className="text-left pb-3 font-medium">Date</th>
                  <th className="text-left pb-3 font-medium">Description</th>
                  <th className="text-left pb-3 font-medium">Category</th>
                  <th className="text-right pb-3 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.slice(0, 10).map(tx => (
                  <tr key={tx.id} className="border-b border-border/20 last:border-0">
                    <td className="py-2.5 text-muted-foreground">{tx.date}</td>
                    <td className="py-2.5 max-w-[160px] truncate">{tx.description || '—'}</td>
                    <td className="py-2.5 text-muted-foreground">{tx.category || '—'}</td>
                    <td className={`py-2.5 text-right font-mono font-medium ${tx.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
