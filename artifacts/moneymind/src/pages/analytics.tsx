import React, { useState } from "react";
import { Layout } from "@/components/layout";
import { 
  useGetAnalyticsTrends, 
  useGetCategoryBreakdown,
  useGetExpenseHeatmap 
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { formatCurrency } from "@/lib/utils";

export function Analytics() {
  const [tab, setTab] = useState<"trends" | "categories" | "heatmap">("trends");
  const [period, setPeriod] = useState<"monthly" | "yearly">("monthly");
  
  const { data: trends } = useGetAnalyticsTrends({ period, months: 6 });
  const { data: categories } = useGetCategoryBreakdown({ type: "expense" });
  
  const chartData = trends ? trends.labels.map((label, i) => ({
    name: label,
    income: trends.income[i],
    expenses: trends.expenses[i],
    savings: trends.savings[i]
  })) : [];

  return (
    <Layout>
      <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground mt-1">Deep dive into your money</p>
        </div>

        <div className="flex gap-2 border-b border-white/10 pb-4 overflow-x-auto no-scrollbar">
          {["trends", "categories", "heatmap"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t as any)}
              className={`px-4 py-2 text-sm font-medium rounded-full capitalize whitespace-nowrap transition-colors ${
                tab === t ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "trends" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <Card className="glass-card">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle>Income vs Expenses</CardTitle>
                <select 
                  className="bg-transparent border border-white/10 rounded-md text-sm p-1"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as any)}
                >
                  <option value="monthly">6 Months</option>
                  <option value="yearly">Years</option>
                </select>
              </CardHeader>
              <CardContent className="h-[400px]">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorInc" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="name" stroke="#ffffff40" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0d0d0f', borderColor: '#ffffff1a', borderRadius: '8px' }}
                        itemStyle={{ color: '#fff' }}
                        formatter={(val: number) => formatCurrency(val)}
                      />
                      <Area type="monotone" dataKey="income" stroke="#10b981" fill="url(#colorInc)" strokeWidth={2} />
                      <Area type="monotone" dataKey="expenses" stroke="#f43f5e" fill="url(#colorExp)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">Loading chart data...</div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {tab === "categories" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4">
            <Card className="glass-card">
              <CardHeader><CardTitle>Spending by Category</CardTitle></CardHeader>
              <CardContent className="h-[300px] flex items-center justify-center">
                {categories?.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categories}
                        dataKey="amount"
                        nameKey="category_name"
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                      >
                        {categories.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.category_color || `hsl(var(--chart-${(index % 5) + 1}))`} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(val: number) => formatCurrency(val)} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-muted-foreground">No data available</div>
                )}
              </CardContent>
            </Card>
            
            <Card className="glass-card">
              <CardHeader><CardTitle>Breakdown</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {categories?.map((cat) => (
                  <div key={cat.category_id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
                        {cat.category_icon || '📊'}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{cat.category_name}</p>
                        <p className="text-xs text-muted-foreground">{cat.percent.toFixed(1)}%</p>
                      </div>
                    </div>
                    <div className="font-semibold text-sm">
                      {formatCurrency(cat.amount)}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        {tab === "heatmap" && (
          <div className="animate-in fade-in slide-in-from-bottom-4">
            <Card className="glass-card">
              <CardHeader><CardTitle>Spending Heatmap</CardTitle></CardHeader>
              <CardContent className="p-10 flex flex-col items-center justify-center text-muted-foreground text-center">
                <div className="grid grid-cols-7 gap-2 opacity-50 mb-6">
                  {Array.from({ length: 28 }).map((_, i) => (
                    <div key={i} className={`w-8 h-8 rounded ${i % 3 === 0 ? 'bg-primary/40' : i % 5 === 0 ? 'bg-primary/80' : 'bg-white/5'}`} />
                  ))}
                </div>
                <p>Detailed heatmap view requires more historical data.</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
}