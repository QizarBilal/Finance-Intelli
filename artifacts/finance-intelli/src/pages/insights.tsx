import { useGetInsights } from '@workspace/api-client-react';
import { Sparkles, AlertTriangle, Lightbulb, TrendingUp, CheckCircle2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

export default function Insights() {
  const { data: insights, isLoading, isError } = useGetInsights();

  const getIcon = (type: string) => {
    switch (type) {
      case 'warning': return AlertTriangle;
      case 'success': return CheckCircle2;
      case 'tip': return Lightbulb;
      default: return TrendingUp;
    }
  };

  const getColor = (severity: string, type: string) => {
    if (type === 'success') return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
    if (severity === 'high') return 'text-rose-500 bg-rose-500/10 border-rose-500/20';
    if (severity === 'medium') return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
    return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
  };

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight flex items-center gap-3">
          <Sparkles className="w-8 h-8 text-primary" />
          Financial Insights
        </h1>
        <p className="text-muted-foreground mt-2">
          Practical signals from your ledger, budgets, and spending patterns.
        </p>
      </div>

      <div className="grid gap-3 rounded-2xl border border-border/60 bg-card/40 p-4 text-xs text-muted-foreground sm:grid-cols-3">
        <p><span className="font-semibold text-foreground">Fair comparisons</span><br />Month-to-date spending is compared with the same number of days last month.</p>
        <p><span className="font-semibold text-foreground">Currency aware</span><br />Accounts in different currencies are analyzed separately, without guessed exchange rates.</p>
        <p><span className="font-semibold text-foreground">Actionable signals</span><br />Budget pressure, savings rate, and uncategorized spending are prioritized by urgency.</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 glass-card rounded-2xl animate-pulse bg-muted/50" />
          ))}
        </div>
      ) : isError ? (
        <div role="alert" className="glass-card rounded-2xl border border-destructive/20 p-6">
          <h3 className="font-semibold">Insights are temporarily unavailable</h3>
          <p className="mt-1 text-sm text-muted-foreground">Your financial records are unchanged. Refresh this page in a moment to try again.</p>
        </div>
      ) : insights && insights.length > 0 ? (
        <div className="space-y-4">
          {insights.map((insight) => {
            const Icon = getIcon(insight.type);
            const colorClass = getColor(insight.severity, insight.type);
            const currency = (insight as typeof insight & { currency?: string }).currency || 'INR';
            
            return (
              <div key={insight.id} className="glass-card rounded-2xl p-6 flex gap-6 relative overflow-hidden transition-all hover:bg-white/5 border border-border/50">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${colorClass}`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-1">{insight.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed max-w-2xl">{insight.description}</p>
                  
                  {insight.amount != null && insight.amount > 0 && (
                    <div className="mt-4 inline-flex items-center px-3 py-1 rounded-full bg-background border border-border text-sm font-mono font-medium">
                      {insight.type === 'warning' ? 'Amount at risk' : 'To review'}: {formatCurrency(insight.amount, currency)}
                    </div>
                  )}
                  {insight.trend && <span className="mt-4 ml-2 inline-flex rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">{insight.trend}</span>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-16 text-center">
          <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-display font-medium">No insights generated yet</h3>
          <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
            Add more transactions and budgets. Our AI engine needs more data to provide meaningful financial advice.
          </p>
        </div>
      )}
    </div>
  );
}
