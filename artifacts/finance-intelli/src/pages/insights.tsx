import { useGetInsights } from '@workspace/api-client-react';
import { Sparkles, AlertTriangle, Lightbulb, TrendingUp, CheckCircle2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

export default function Insights() {
  const { data: insights, isLoading } = useGetInsights();

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
          AI Insights
        </h1>
        <p className="text-muted-foreground mt-2">
          Your private banker is analyzing your data. Here's what we found.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 glass-card rounded-2xl animate-pulse bg-muted/50" />
          ))}
        </div>
      ) : insights && insights.length > 0 ? (
        <div className="space-y-4">
          {insights.map((insight) => {
            const Icon = getIcon(insight.type);
            const colorClass = getColor(insight.severity, insight.type);
            
            return (
              <div key={insight.id} className="glass-card rounded-2xl p-6 flex gap-6 relative overflow-hidden transition-all hover:bg-white/5 border border-border/50">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${colorClass}`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-1">{insight.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed max-w-2xl">{insight.description}</p>
                  
                  {insight.amount && (
                    <div className="mt-4 inline-flex items-center px-3 py-1 rounded-full bg-background border border-border text-sm font-mono font-medium">
                      Impact: {formatCurrency(insight.amount)}
                    </div>
                  )}
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
