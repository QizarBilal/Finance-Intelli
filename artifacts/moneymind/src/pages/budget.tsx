import React from "react";
import { useGetBudgetUtilization, useListBudgets } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { AnimatedNumber } from "@/components/animated-number";

export function Budget() {
  const { data: utilization, isLoading: isLoadingUtil } = useGetBudgetUtilization({ period: "monthly" });
  
  return (
    <Layout>
      <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Budgets</h1>
          <p className="text-muted-foreground mt-1">Keep your spending in check</p>
        </div>

        {isLoadingUtil ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2, 3].map(i => <div key={i} className="h-40 bg-white/5 animate-pulse rounded-xl" />)}
          </div>
        ) : utilization?.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {utilization.map((bud) => (
              <Card key={bud.budget_id} className="glass-card">
                <CardContent className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-semibold text-lg">{bud.budget_name || bud.category_name || "General"}</h3>
                      <p className="text-sm text-muted-foreground capitalize">{bud.period} Budget</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-xl">{formatCurrency(bud.budget_amount - bud.spent_amount)}</p>
                      <p className="text-xs text-muted-foreground">remaining</p>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>{formatCurrency(bud.spent_amount)} spent</span>
                      <span>{formatCurrency(bud.budget_amount)} limit</span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-1000 ${
                          bud.status === 'exceeded' ? 'bg-rose-500' :
                          bud.status === 'warning' ? 'bg-amber-500' : 'bg-primary'
                        }`}
                        style={{ width: `${Math.min(bud.utilization_percent, 100)}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="glass-card p-12 text-center flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
              <span className="text-2xl">🎯</span>
            </div>
            <h3 className="text-xl font-semibold mb-2">No active budgets</h3>
            <p className="text-muted-foreground mb-6 max-w-md">Set up budgets to track your spending and make sure you hit your financial goals.</p>
            <button className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors">
              Create Budget
            </button>
          </Card>
        )}
      </div>
    </Layout>
  );
}