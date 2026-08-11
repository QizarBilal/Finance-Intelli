import { motion } from 'framer-motion';
import { 
  useGetDashboardSummary, 
  useGetRecentTransactions,
  useGetMe,
  useGetAnalyticsTrends,
  useGetInsights
} from '@workspace/api-client-react';
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  Wallet, 
  Target, 
  Activity,
  Plus,
  Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';

export default function Dashboard() {
  const { data: profile } = useGetMe();
  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary();
  const { data: recent, isLoading: isRecentLoading } = useGetRecentTransactions({ limit: 5 });
  const { data: trends } = useGetAnalyticsTrends({ period: '30d', groupBy: 'day' });
  const { data: insights } = useGetInsights();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const trendData = (trends || []).map(point => ({
    ...point,
    income: Number(point.income) || 0,
    expense: Number(point.expense) || 0,
    savings: Number(point.savings) || 0,
  })).filter(point => /^\d{4}-\d{2}-\d{2}$/.test(point.date));

  return (
    <div className="space-y-8 pb-10">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">
            {getGreeting()}, {profile?.name?.split(' ')[0] || 'User'}
          </h1>
          <p className="text-muted-foreground mt-1">Here's your financial overview for today.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild className="rounded-full shadow-lg shadow-primary/20">
            <Link href="/transactions?new=true">
              <Plus className="w-4 h-4 mr-2" /> Add Transaction
            </Link>
          </Button>
        </div>
      </header>

      {/* Primary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard 
          title="Total Balance" 
          value={summary?.balance} 
          isLoading={isSummaryLoading}
          icon={Wallet}
          trend={`${(summary as any)?.balanceTrendPercent ?? 0}% this month`}
          trendUp={((summary as any)?.balanceTrendPercent ?? 0) >= 0}
          primary
        />
        <MetricCard 
          title="Monthly Income" 
          value={summary?.monthly?.income} 
          isLoading={isSummaryLoading}
          icon={ArrowUpRight}
          trend="vs last month"
          trendUp={true}
          iconClass="text-emerald-400"
        />
        <MetricCard 
          title="Monthly Expenses" 
          value={summary?.monthly?.expense} 
          isLoading={isSummaryLoading}
          icon={ArrowDownRight}
          trend={`${summary?.budgetUsagePercent || 0}% of budget`}
          trendUp={false}
          iconClass="text-rose-400"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <div className="lg:col-span-2 glass-card rounded-2xl p-6 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              Cash Flow Trend
            </h2>
            <div className="text-sm text-muted-foreground">Last 30 Days</div>
          </div>
          
          <div className="flex-1 min-h-[250px] w-full">
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={(val) => new Date(val).getDate().toString()}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value: number) => formatCurrency(value)}
                    labelFormatter={(label) => formatDate(label)}
                  />
                  <Area type="monotone" dataKey="income" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorIncome)" strokeWidth={2} />
                  <Area type="monotone" dataKey="expense" stroke="hsl(var(--destructive))" fillOpacity={1} fill="url(#colorExpense)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                Not enough data for trend analysis
              </div>
            )}
          </div>
        </div>

        {/* Health Score & Smart Insights */}
        <div className="space-y-6">
          <div className="glass-card rounded-2xl p-6">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" />
                Health Score
              </h2>
            </div>
            <div className="flex items-end gap-4">
              <div className="text-5xl font-display font-bold text-primary">
                {summary?.financialHealthScore ?? '--'}
              </div>
              <div className="pb-1 text-muted-foreground text-sm">
                / 100
              </div>
            </div>
            <div className="mt-4 h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary" 
                style={{ width: `${summary?.financialHealthScore || 0}%` }}
              />
            </div>
            <div className="mt-4 text-sm">
              Savings rate: <span className="font-semibold text-foreground">{summary?.savingsRate || 0}%</span>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 pointer-events-none opacity-10">
              <Sparkles className="w-24 h-24 text-primary" />
            </div>
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-primary" />
              Smart Insight
            </h2>
            {insights && insights.length > 0 ? (
              <div className="space-y-1">
                <h3 className="font-medium text-foreground">{insights[0].title}</h3>
                <p className="text-sm text-muted-foreground line-clamp-3">{insights[0].description}</p>
                <Link href="/insights" className="text-xs text-primary font-medium mt-2 inline-block hover:underline">
                  View all insights →
                </Link>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Gathering data to provide personalized insights...</p>
            )}
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Recent Transactions</h2>
          <Link href="/transactions" className="text-sm text-muted-foreground hover:text-primary transition-colors">
            View all
          </Link>
        </div>
        
        <div className="glass-card rounded-2xl overflow-hidden">
          {isRecentLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading transactions...</div>
          ) : Array.isArray(recent) && recent.length > 0 ? (
            <div className="divide-y divide-border/50">
              {(recent as any[]).map((tx) => (
                <div key={tx.id} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      tx.type === 'income' ? 'bg-emerald-500/10 text-emerald-500' : 
                      tx.type === 'expense' ? 'bg-rose-500/10 text-rose-500' : 'bg-blue-500/10 text-blue-500'
                    }`}>
                      {tx.type === 'income' ? <ArrowUpRight className="w-5 h-5" /> : 
                       tx.type === 'expense' ? <ArrowDownRight className="w-5 h-5" /> : <Wallet className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="font-medium text-foreground">{tx.description || tx.category || 'Transaction'}</div>
                      <div className="text-xs text-muted-foreground">{formatDate(tx.date)} • {tx.category || 'Uncategorized'}</div>
                    </div>
                  </div>
                  <div className={`font-mono font-medium ${tx.type === 'income' ? 'text-emerald-400' : 'text-foreground'}`}>
                    {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}{formatCurrency(tx.amount)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <Wallet className="w-6 h-6 text-muted-foreground" />
              </div>
              <h3 className="font-medium">No transactions yet</h3>
              <p className="text-sm text-muted-foreground mt-1 mb-4">Your financial journey starts here.</p>
              <Button size="sm" asChild>
                <Link href="/transactions?new=true">Add First Transaction</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, isLoading, icon: Icon, trend, trendUp, primary = false, iconClass = '' }: any) {
  return (
    <div className={`rounded-2xl p-6 relative overflow-hidden ${primary ? 'bg-primary text-primary-foreground shadow-xl shadow-primary/20' : 'glass-card'}`}>
      <div className="flex justify-between items-start mb-4">
        <div className={`text-sm font-medium ${primary ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
          {title}
        </div>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${primary ? 'bg-white/20' : 'bg-muted'}`}>
          <Icon className={`w-4 h-4 ${primary ? 'text-white' : iconClass}`} />
        </div>
      </div>
      <div>
        {isLoading ? (
          <div className={`h-8 w-32 rounded animate-pulse ${primary ? 'bg-white/20' : 'bg-muted'}`}></div>
        ) : (
          <div className="text-3xl font-display font-bold tracking-tight">
            {Number.isFinite(Number(value)) ? formatCurrency(Number(value)) : '--'}
          </div>
        )}
      </div>
      {trend && (
        <div className={`mt-3 text-xs flex items-center gap-1 ${primary ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
          <span className={primary ? 'text-white' : trendUp ? 'text-emerald-400' : 'text-rose-400'}>
            {trend}
          </span>
        </div>
      )}
    </div>
  );
}
