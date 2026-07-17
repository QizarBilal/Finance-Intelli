import React from "react";
import { Layout } from "@/components/layout";
import { useGetWeeklyReport, useGetMonthlyReport } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { Sparkles, TrendingDown, TrendingUp } from "lucide-react";

export function Reports() {
  const { data: monthReport, isLoading } = useGetMonthlyReport();

  return (
    <Layout>
      <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Financial Report</h1>
          <p className="text-muted-foreground mt-1">Your automated monthly summary</p>
        </div>

        {isLoading ? (
          <div className="space-y-6">
            <div className="h-32 bg-white/5 animate-pulse rounded-xl" />
            <div className="h-64 bg-white/5 animate-pulse rounded-xl" />
          </div>
        ) : monthReport ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            
            {/* AI Summary Banner */}
            {monthReport.ai_summary && (
              <Card className="border-primary/30 bg-primary/5 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-6 opacity-10">
                  <Sparkles size={100} />
                </div>
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles size={20} className="text-primary" />
                    <h3 className="font-semibold text-lg text-primary">Mind Insight</h3>
                  </div>
                  <p className="text-white/90 leading-relaxed relative z-10">
                    {monthReport.ai_summary}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Monthly Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="glass-card">
                <CardContent className="p-6">
                  <p className="text-sm text-muted-foreground mb-1">Total Income</p>
                  <p className="text-2xl font-bold text-emerald-500">{formatCurrency(monthReport.summary.income)}</p>
                </CardContent>
              </Card>
              <Card className="glass-card">
                <CardContent className="p-6">
                  <p className="text-sm text-muted-foreground mb-1">Total Expenses</p>
                  <p className="text-2xl font-bold text-rose-500">{formatCurrency(monthReport.summary.expenses)}</p>
                </CardContent>
              </Card>
              <Card className="glass-card">
                <CardContent className="p-6">
                  <p className="text-sm text-muted-foreground mb-1">Total Saved</p>
                  <p className="text-2xl font-bold text-blue-500">{formatCurrency(monthReport.summary.savings)}</p>
                  {monthReport.savings_rate && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {monthReport.savings_rate.toFixed(1)}% savings rate
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Highlights */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Month Highlights</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center p-4 rounded-lg bg-white/5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-rose-500/20 text-rose-500 flex items-center justify-center">
                      <TrendingUp size={20} />
                    </div>
                    <div>
                      <p className="font-medium">Highest Expense</p>
                      <p className="text-sm text-muted-foreground">Single largest purchase</p>
                    </div>
                  </div>
                  <p className="font-bold text-lg">{monthReport.highest_expense ? formatCurrency(monthReport.highest_expense) : '-'}</p>
                </div>
                
                <div className="flex justify-between items-center p-4 rounded-lg bg-white/5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
                      <TrendingDown size={20} />
                    </div>
                    <div>
                      <p className="font-medium">Lowest Expense</p>
                      <p className="text-sm text-muted-foreground">Smallest recorded transaction</p>
                    </div>
                  </div>
                  <p className="font-bold text-lg">{monthReport.lowest_expense ? formatCurrency(monthReport.lowest_expense) : '-'}</p>
                </div>
              </CardContent>
            </Card>

          </div>
        ) : (
          <div className="text-center p-12 text-muted-foreground glass-card rounded-xl">
            Not enough data to generate report yet.
          </div>
        )}
      </div>
    </Layout>
  );
}