import { useGetAnalyticsCalendar, useListTransactions, Transaction } from '@workspace/api-client-react';
import { useState, useMemo } from 'react';
import { formatCurrency } from '@/lib/utils';
import { ArrowUpRight, ArrowDownRight, ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export default function CalendarPage() {
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth(); // 0-indexed

  const { data: calendarData } = useGetAnalyticsCalendar({ year, month: month + 1 });

  const selectedDateStr = toLocalDateStr(selectedDate);

  const { data: dayTxData } = useListTransactions({
    dateFrom: selectedDateStr,
    dateTo:   selectedDateStr,
    limit: 50,
  });
  const dayTransactions: Transaction[] = dayTxData?.data || [];

  const daysMap = useMemo(() => {
    return (calendarData || []).reduce((acc: Record<string, { income: number; expense: number; savings: number }>, d) => {
      acc[d.date] = d;
      return acc;
    }, {});
  }, [calendarData]);

  // Build calendar grid: leading empty cells + day cells
  const firstDow = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = toLocalDateStr(new Date());

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  // Monthly totals
  const monthlyIncome  = (calendarData || []).reduce((s, d) => s + (d.income  || 0), 0);
  const monthlyExpense = (calendarData || []).reduce((s, d) => s + (d.expense || 0), 0);
  const monthlySavings = monthlyIncome - monthlyExpense;

  const selectedDayData = daysMap[selectedDateStr];

  return (
    <div className="space-y-6 pb-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Financial Calendar</h1>
          <p className="text-muted-foreground mt-1">Your daily money map — click any day to inspect it.</p>
        </div>
        {/* Monthly summary pills */}
        <div className="hidden md:flex items-center gap-3">
          <div className="px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
            <div className="text-[10px] text-emerald-400 uppercase tracking-wider mb-0.5">Income</div>
            <div className="text-sm font-mono font-semibold text-emerald-400">{formatCurrency(monthlyIncome)}</div>
          </div>
          <div className="px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center">
            <div className="text-[10px] text-rose-400 uppercase tracking-wider mb-0.5">Spent</div>
            <div className="text-sm font-mono font-semibold text-rose-400">{formatCurrency(monthlyExpense)}</div>
          </div>
          <div className={`px-4 py-2 rounded-xl border text-center ${monthlySavings >= 0 ? 'bg-blue-500/10 border-blue-500/20' : 'bg-rose-500/10 border-rose-500/20'}`}>
            <div className={`text-[10px] uppercase tracking-wider mb-0.5 ${monthlySavings >= 0 ? 'text-blue-400' : 'text-rose-400'}`}>Net</div>
            <div className={`text-sm font-mono font-semibold ${monthlySavings >= 0 ? 'text-blue-400' : 'text-rose-400'}`}>{monthlySavings >= 0 ? '+' : ''}{formatCurrency(monthlySavings)}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ── Calendar Card ── */}
        <div className="lg:col-span-2 glass-card rounded-2xl p-5 flex flex-col">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-5">
            <button onClick={prevMonth} className="w-9 h-9 rounded-xl bg-muted/40 hover:bg-muted flex items-center justify-center transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h2 className="text-lg font-display font-semibold tracking-tight">
              {MONTHS[month]} {year}
            </h2>
            <button onClick={nextMonth} className="w-9 h-9 rounded-xl bg-muted/40 hover:bg-muted flex items-center justify-center transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-2">
            {WEEKDAYS.map(d => (
              <div key={d} className="text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wider py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-1 flex-1">
            {/* Leading empty cells */}
            {Array.from({ length: firstDow }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}

            {/* Day cells */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
              const data = daysMap[dateStr];
              const isToday    = dateStr === todayStr;
              const isSelected = dateStr === selectedDateStr;
              const hasData    = data && (data.income > 0 || data.expense > 0);

              return (
                <button
                  key={day}
                  onClick={() => setSelectedDate(new Date(year, month, day))}
                  className={[
                    'relative flex flex-col items-start p-1.5 rounded-xl border transition-all text-left min-h-[64px] md:min-h-[76px]',
                    isSelected
                      ? 'bg-primary/20 border-primary/70 ring-1 ring-primary/40'
                      : isToday
                      ? 'bg-primary/8 border-primary/40 hover:bg-primary/15'
                      : 'border-border/30 hover:bg-muted/30 hover:border-border/60',
                  ].join(' ')}
                >
                  {/* Day number */}
                  <span className={[
                    'text-xs font-semibold leading-none mb-auto',
                    isSelected ? 'text-primary' : isToday ? 'text-primary' : 'text-foreground/80',
                  ].join(' ')}>
                    {day}
                  </span>

                  {/* Today dot */}
                  {isToday && !isSelected && (
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary" />
                  )}

                  {/* Financial data */}
                  {hasData && (
                    <div className="w-full mt-1 space-y-0.5">
                      {data.income > 0 && (
                        <div className="text-[9px] font-mono text-emerald-400 leading-none truncate">
                          +{data.income >= 1000 ? `${(data.income/1000).toFixed(1)}k` : data.income.toFixed(0)}
                        </div>
                      )}
                      {data.expense > 0 && (
                        <div className="text-[9px] font-mono text-rose-400 leading-none truncate">
                          −{data.expense >= 1000 ? `${(data.expense/1000).toFixed(1)}k` : data.expense.toFixed(0)}
                        </div>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Day Detail Panel ── */}
        <div className="flex flex-col gap-4">
          {/* Selected day header */}
          <div className="glass-card rounded-2xl p-5">
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedDateStr}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
              >
                <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Selected day</p>
                <h3 className="text-xl font-display font-bold mb-4">
                  {selectedDate.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long' })}
                </h3>

                {selectedDayData ? (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                      <div className="flex items-center gap-2">
                        <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-xs text-emerald-400">Income</span>
                      </div>
                      <span className="text-sm font-mono font-semibold text-emerald-400">
                        {formatCurrency(selectedDayData.income)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                      <div className="flex items-center gap-2">
                        <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" />
                        <span className="text-xs text-rose-400">Expenses</span>
                      </div>
                      <span className="text-sm font-mono font-semibold text-rose-400">
                        {formatCurrency(selectedDayData.expense)}
                      </span>
                    </div>
                    {selectedDayData.savings !== 0 && (
                      <div className={`flex items-center justify-between p-3 rounded-xl border ${selectedDayData.savings >= 0 ? 'bg-blue-500/10 border-blue-500/20' : 'bg-rose-500/10 border-rose-500/20'}`}>
                        <div className="flex items-center gap-2">
                          <TrendingUp className={`w-3.5 h-3.5 ${selectedDayData.savings >= 0 ? 'text-blue-400' : 'text-rose-400'}`} />
                          <span className={`text-xs ${selectedDayData.savings >= 0 ? 'text-blue-400' : 'text-rose-400'}`}>Net</span>
                        </div>
                        <span className={`text-sm font-mono font-semibold ${selectedDayData.savings >= 0 ? 'text-blue-400' : 'text-rose-400'}`}>
                          {selectedDayData.savings >= 0 ? '+' : ''}{formatCurrency(selectedDayData.savings)}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-6 text-center">
                    <div className="w-10 h-10 rounded-full bg-muted/40 flex items-center justify-center mx-auto mb-2">
                      <TrendingUp className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">No activity on this day</p>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Transaction list */}
          <div className="glass-card rounded-2xl p-5 flex-1">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold">Transactions</p>
              {dayTransactions.length > 0 && (
                <span className="text-xs text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-full">
                  {dayTransactions.length}
                </span>
              )}
            </div>

            {dayTransactions.length > 0 ? (
              <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                {dayTransactions.map(tx => (
                  <div key={tx.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/30 transition-colors">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${tx.type === 'income' ? 'bg-emerald-500/15' : 'bg-rose-500/15'}`}>
                      {tx.type === 'income'
                        ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
                        : <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate leading-none mb-0.5">
                        {tx.description || tx.category || 'Transaction'}
                      </p>
                      {tx.category && (
                        <p className="text-[11px] text-muted-foreground truncate">{tx.category}</p>
                      )}
                    </div>
                    <span className={`text-sm font-mono font-semibold shrink-0 ${tx.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {tx.type === 'income' ? '+' : '−'}{formatCurrency(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground">No transactions recorded</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
