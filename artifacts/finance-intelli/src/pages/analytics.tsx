import { useState } from 'react';
import { 
  useGetAnalyticsTrends, 
  useGetAnalyticsCategories,
  useGetDashboardSummary
} from '@workspace/api-client-react';
import { BarChart as BarChartIcon, PieChart as PieChartIcon, TrendingUp, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { 
  Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart, 
  ResponsiveContainer, Tooltip, XAxis, YAxis, Legend 
} from 'recharts';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export default function Analytics() {
  const [period, setPeriod] = useState<'30d' | '90d' | '12m'>('30d');
  
  const { data: trends } = useGetAnalyticsTrends({ period, groupBy: period === '12m' ? 'month' : 'day' });
  const { data: catExpenses } = useGetAnalyticsCategories({ period, type: 'expense' });
  const { data: summary } = useGetDashboardSummary();

  const trendData = trends || [];
  const categoryData = catExpenses || [];

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground mt-1">Deep dive into your financial patterns.</p>
        </div>
        <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
          <SelectTrigger className="w-[150px] glass-card border-none bg-card/40">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30d">Last 30 Days</SelectItem>
            <SelectItem value="90d">Last 3 Months</SelectItem>
            <SelectItem value="12m">Last Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Income vs Expense Area Chart */}
        <div className="glass-card rounded-2xl p-6 lg:col-span-2">
          <div className="flex items-center gap-2 mb-6">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Cash Flow</h2>
          </div>
          <div className="h-[300px] w-full">
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorInc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={(val) => period === '12m' ? new Date(val).toLocaleString('default', { month: 'short' }) : new Date(val).getDate().toString()}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={(val) => `₹${val/1000}k`}
                    width={50}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    formatter={(value: number) => formatCurrency(value)}
                    labelFormatter={(label) => formatDate(label)}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="income" name="Income" stroke="hsl(var(--primary))" fill="url(#colorInc)" strokeWidth={2} />
                  <Area type="monotone" dataKey="expense" name="Expense" stroke="hsl(var(--destructive))" fill="url(#colorExp)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No data available</div>
            )}
          </div>
        </div>

        {/* Expenses by Category Donut */}
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-6">
            <PieChartIcon className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Spending by Category</h2>
          </div>
          <div className="h-[250px] w-full relative">
            {categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="amount"
                    nameKey="category"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No data available</div>
            )}
          </div>
          {categoryData.length > 0 && (
            <div className="mt-4 space-y-2">
              {categoryData.slice(0, 4).map((cat, i) => (
                <div key={cat.category} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                    <span>{cat.category}</span>
                  </div>
                  <div className="font-mono">{formatCurrency(cat.amount)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Savings Rate Bar Chart */}
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-6">
            <BarChartIcon className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Savings & Growth</h2>
          </div>
          <div className="h-[250px] w-full">
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={(val) => period === '12m' ? new Date(val).toLocaleString('default', { month: 'short' }) : new Date(val).getDate().toString()}
                  />
                  <Tooltip 
                    cursor={{ fill: 'hsl(var(--muted)/0.3)' }}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Bar dataKey="savings" name="Net Saved" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No data available</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
