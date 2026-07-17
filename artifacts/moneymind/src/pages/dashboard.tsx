import React from "react";
import { Layout } from "@/components/layout";
import { 
  useGetDashboard, 
  useGetProfile, 
  useGetInsights, 
  useListReminders,
  useGetAnalyticsTrends,
  useGetRecentTransactions
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatedNumber } from "@/components/animated-number";
import { formatCurrency } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, Target, Sparkles, TrendingUp, Wallet, Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";

export function Dashboard() {
  const { data: profile } = useGetProfile();
  const { data: dashboard, isLoading: isLoadingDashboard } = useGetDashboard();
  const { data: insights } = useGetInsights();
  const { data: reminders } = useListReminders({ upcoming_days: 7 });
  const { data: trends } = useGetAnalyticsTrends({ period: "weekly", months: 1 });
  const { data: recentTx } = useGetRecentTransactions({ limit: 5 });

  const currency = profile?.currency || "INR";

  if (isLoadingDashboard || !dashboard) {
    return (
      <Layout>
        <div className="p-6 md:p-10 space-y-6">
          <div className="h-10 w-48 bg-white/5 animate-pulse rounded-md" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => <div key={i} className="h-32 bg-white/5 animate-pulse rounded-xl" />)}
          </div>
        </div>
      </Layout>
    );
  }

  // Transform trends data for recharts
  const chartData = trends ? trends.labels.map((label, i) => ({
    name: label,
    income: trends.income[i],
    expenses: trends.expenses[i]
  })) : [];

  return (
    <Layout>
      <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
            <p className="text-muted-foreground mt-1">
              Welcome back, {profile?.full_name?.split(' ')[0] || "Mohammed"}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Net Worth</p>
              <div className="text-2xl font-semibold text-primary">
                <AnimatedNumber value={dashboard.net_worth} format={(v) => formatCurrency(v, currency)} />
              </div>
            </div>
            <div className="w-12 h-12 rounded-full border-4 border-primary/20 flex items-center justify-center relative">
              <svg className="absolute inset-0 w-full h-full -rotate-90">
                <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="4" className="text-white/5" />
                <circle 
                  cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="4" 
                  className="text-primary" 
                  strokeDasharray={`${(dashboard.financial_health_score / 100) * 125} 125`} 
                />
              </svg>
              <span className="text-xs font-bold">{dashboard.financial_health_score}</span>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="glass-card relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <ArrowDownRight size={64} className="text-emerald-500" />
            </div>
            <CardContent className="p-6">
              <p className="text-sm font-medium text-emerald-500 flex items-center gap-1 mb-2">
                <ArrowDownRight size={16} /> Income (Month)
              </p>
              <div className="text-3xl font-bold tracking-tighter">
                <AnimatedNumber value={dashboard.this_month.income} format={(v) => formatCurrency(v, currency)} />
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {dashboard.income_growth_percent ? `${dashboard.income_growth_percent > 0 ? '+' : ''}${dashboard.income_growth_percent}% vs last month` : 'Tracking well'}
              </p>
            </CardContent>
          </Card>

          <Card className="glass-card relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <ArrowUpRight size={64} className="text-rose-500" />
            </div>
            <CardContent className="p-6">
              <p className="text-sm font-medium text-rose-500 flex items-center gap-1 mb-2">
                <ArrowUpRight size={16} /> Expenses (Month)
              </p>
              <div className="text-3xl font-bold tracking-tighter">
                <AnimatedNumber value={dashboard.this_month.expenses} format={(v) => formatCurrency(v, currency)} />
              </div>
              <div className="flex justify-between items-center mt-2">
                <p className="text-sm text-muted-foreground">
                  {dashboard.remaining_monthly_budget ? formatCurrency(dashboard.remaining_monthly_budget, currency) + ' remaining' : ''}
                </p>
                {dashboard.no_spend_days && dashboard.no_spend_days > 0 && (
                  <Badge variant="outline" className="bg-white/5 border-white/10 text-xs gap-1">
                    <Sparkles size={12} className="text-amber-400" /> {dashboard.no_spend_days} no-spend days
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Wallet size={64} className="text-blue-500" />
            </div>
            <CardContent className="p-6">
              <p className="text-sm font-medium text-blue-500 flex items-center gap-1 mb-2">
                <Target size={16} /> Savings (Month)
              </p>
              <div className="text-3xl font-bold tracking-tighter">
                <AnimatedNumber value={dashboard.this_month.savings} format={(v) => formatCurrency(v, currency)} />
              </div>
              <div className="flex justify-between items-center mt-2">
                <p className="text-sm text-muted-foreground">
                  {dashboard.savings_rate ? `${dashboard.savings_rate.toFixed(1)}% save rate` : ''}
                </p>
                {dashboard.savings_streak_days && dashboard.savings_streak_days > 0 && (
                  <Badge variant="outline" className="bg-white/5 border-white/10 text-xs gap-1">
                    <Flame size={12} className="text-orange-500" /> {dashboard.savings_streak_days} days
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Chart */}
          <Card className="glass-card lg:col-span-2 flex flex-col">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-medium">Cash Flow Trend</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-[300px]">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0d0d0f', borderColor: '#ffffff1a', borderRadius: '8px' }}
                      itemStyle={{ color: '#fff' }}
                      formatter={(val: number) => formatCurrency(val, currency)}
                    />
                    <Area type="monotone" dataKey="income" stroke="#10b981" fillOpacity={1} fill="url(#colorIncome)" strokeWidth={2} />
                    <Area type="monotone" dataKey="expenses" stroke="#f43f5e" fillOpacity={1} fill="url(#colorExpense)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  Not enough data for chart
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI Insights */}
          <div className="space-y-6">
            <Card className="glass-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-medium flex items-center gap-2">
                  <Sparkles size={18} className="text-primary" /> Insights
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {insights?.insights.slice(0, 3).map((insight, i) => (
                  <div key={i} className="flex gap-3">
                    <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                      insight.severity === 'critical' ? 'bg-rose-500' :
                      insight.severity === 'warning' ? 'bg-amber-500' :
                      insight.severity === 'success' ? 'bg-emerald-500' : 'bg-blue-500'
                    }`} />
                    <div>
                      <p className="text-sm font-medium">{insight.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{insight.message}</p>
                    </div>
                  </div>
                ))}
                {!insights?.insights.length && (
                  <p className="text-sm text-muted-foreground">No new insights right now.</p>
                )}
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-lg font-medium">Recent</CardTitle>
                <Badge variant="secondary" className="bg-white/5">View all</Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                {recentTx?.transactions?.map(tx => (
                  <div key={tx.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
                        {/* Fake icon for now */}
                        <span className="text-sm">{tx.category_icon || '💸'}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium truncate max-w-[120px]">{tx.description || tx.category_name}</p>
                        <p className="text-xs text-muted-foreground">{new Date(tx.date).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className={`text-sm font-semibold ${tx.type === 'expense' ? 'text-foreground' : 'text-emerald-500'}`}>
                      {tx.type === 'expense' ? '-' : '+'}{formatCurrency(tx.amount, currency)}
                    </div>
                  </div>
                ))}
                {!recentTx?.transactions?.length && (
                  <p className="text-sm text-muted-foreground">No recent transactions.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}