import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { useGetAnalyticsCalendar, CalendarDay, useListTransactions, Transaction } from '@workspace/api-client-react';
import { useState, useMemo } from 'react';
import { formatCurrency } from '@/lib/utils';
import { ArrowUpRight, ArrowDownRight, Receipt } from 'lucide-react';
import { format, parseISO } from 'date-fns';

/** Format a JS Date as YYYY-MM-DD using LOCAL time (avoids UTC midnight timezone shift) */
function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function CalendarPage() {
  const [viewDate, setViewDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const { data: calendarData } = useGetAnalyticsCalendar({
    year: viewDate.getFullYear(),
    month: viewDate.getMonth() + 1,
  });

  const selectedDateStr = toLocalDateStr(selectedDate);

  // Fetch transactions for the selected day
  const { data: dayTxData } = useListTransactions({
    dateFrom: selectedDateStr,
    dateTo: selectedDateStr,
    limit: 50,
  });
  const dayTransactions: Transaction[] = dayTxData?.data || [];

  const daysMap = useMemo(() => {
    return (calendarData || []).reduce((acc: Record<string, CalendarDay>, day) => {
      // day.date is already YYYY-MM-DD from the API — no parsing needed
      acc[day.date] = day;
      return acc;
    }, {});
  }, [calendarData]);

  const selectedDayData = daysMap[selectedDateStr];

  const handleSelect = (d: Date | undefined) => {
    if (d) {
      setSelectedDate(d);
    }
  };

  const handleMonthChange = (d: Date) => {
    setViewDate(d);
  };

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">Financial Calendar</h1>
        <p className="text-muted-foreground mt-1">Click any day to see its transactions.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Calendar */}
        <div className="md:col-span-8 glass-card rounded-2xl p-6">
          <CalendarComponent
            mode="single"
            selected={selectedDate}
            onSelect={handleSelect}
            onMonthChange={handleMonthChange}
            className="w-full p-0"
            classNames={{
              months: 'w-full',
              month: 'w-full',
              caption: 'flex justify-between pt-1 relative items-center mb-4 px-1',
              caption_label: 'text-base font-display font-semibold',
              nav: 'flex items-center gap-1',
              nav_button: 'h-8 w-8 bg-muted/40 hover:bg-muted rounded-lg p-0 flex items-center justify-center transition-colors',
              nav_button_previous: 'absolute left-1',
              nav_button_next: 'absolute right-1',
              table: 'w-full border-collapse',
              head_row: 'grid grid-cols-7 w-full mb-1',
              head_cell: 'text-muted-foreground font-medium text-xs text-center py-2',
              row: 'grid grid-cols-7 w-full gap-1 mt-1',
              cell: 'relative p-0 text-center focus-within:relative focus-within:z-20 min-h-[72px] md:min-h-[80px]',
              day: 'w-full h-full min-h-[72px] md:min-h-[80px] p-1.5 border border-border/40 rounded-xl flex flex-col items-start justify-start hover:bg-muted/40 aria-selected:bg-primary/15 aria-selected:border-primary/60 transition-all cursor-pointer',
              day_today: 'border-primary/70 bg-primary/5 font-bold',
              day_outside: 'opacity-25 pointer-events-none',
              day_selected: 'bg-primary/15 border-primary/60',
            }}
            components={{
              DayContent: (props: any) => {
                const dayStr = toLocalDateStr(props.date);
                const data = daysMap[dayStr];
                const isSelected = toLocalDateStr(selectedDate) === dayStr;
                return (
                  <div className="w-full h-full flex flex-col gap-0.5">
                    <span className={`text-sm leading-none ${isSelected ? 'text-primary font-bold' : 'font-medium'}`}>
                      {props.date.getDate()}
                    </span>
                    {data && (
                      <div className="flex flex-col gap-0.5 mt-auto w-full">
                        {data.income > 0 && (
                          <div className="text-[10px] text-emerald-400 font-mono leading-tight truncate">
                            +{data.income >= 1000 ? `${(data.income / 1000).toFixed(1)}k` : data.income.toFixed(0)}
                          </div>
                        )}
                        {data.expense > 0 && (
                          <div className="text-[10px] text-rose-400 font-mono leading-tight truncate">
                            −{data.expense >= 1000 ? `${(data.expense / 1000).toFixed(1)}k` : data.expense.toFixed(0)}
                          </div>
                        )}
                      </div>
                    )}
                    {data && (data.income > 0 || data.expense > 0) && (
                      <div className="w-1.5 h-1.5 rounded-full bg-primary/60 absolute top-1.5 right-1.5" />
                    )}
                  </div>
                );
              },
            }}
          />
        </div>

        {/* Day Detail Panel */}
        <div className="md:col-span-4 space-y-4">
          <div className="glass-card rounded-2xl p-5">
            <div className="text-base font-semibold mb-4">
              {format(selectedDate, 'EEEE, MMMM d')}
            </div>

            {selectedDayData ? (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-emerald-400">
                    <ArrowUpRight className="w-3.5 h-3.5" /> Income
                  </div>
                  <div className="text-sm font-mono text-emerald-400 font-semibold">
                    {formatCurrency(selectedDayData.income)}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-rose-400">
                    <ArrowDownRight className="w-3.5 h-3.5" /> Expense
                  </div>
                  <div className="text-sm font-mono text-rose-400 font-semibold">
                    {formatCurrency(selectedDayData.expense)}
                  </div>
                </div>
                {selectedDayData.savings !== 0 && (
                  <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-between">
                    <div className="text-xs text-blue-400">Net</div>
                    <div className={`text-sm font-mono font-semibold ${selectedDayData.savings >= 0 ? 'text-blue-400' : 'text-rose-400'}`}>
                      {selectedDayData.savings >= 0 ? '+' : ''}{formatCurrency(selectedDayData.savings)}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-4">
                No activity on this day
              </div>
            )}
          </div>

          {/* Transaction list for selected day */}
          <div className="glass-card rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Receipt className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Transactions</span>
              {dayTransactions.length > 0 && (
                <span className="ml-auto text-xs text-muted-foreground">{dayTransactions.length}</span>
              )}
            </div>
            {dayTransactions.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {dayTransactions.map(tx => (
                  <div key={tx.id} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{tx.description || tx.category || 'Transaction'}</div>
                      {tx.category && tx.description && (
                        <div className="text-xs text-muted-foreground truncate">{tx.category}</div>
                      )}
                    </div>
                    <div className={`text-sm font-mono font-semibold ml-3 shrink-0 ${
                      tx.type === 'income' ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-4">
                No transactions recorded
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
