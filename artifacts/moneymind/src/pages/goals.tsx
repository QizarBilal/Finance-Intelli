import React, { useState } from "react";
import { Layout } from "@/components/layout";
import { useListGoals, useUpdateGoal } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { Target, Trophy, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Goals() {
  const { data: goals, isLoading } = useListGoals();
  const updateGoal = useUpdateGoal();
  
  return (
    <Layout>
      <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Goals</h1>
            <p className="text-muted-foreground mt-1">What are we saving for?</p>
          </div>
          <Button variant="outline" className="glass-card">
            <Plus size={16} className="mr-2" /> New Goal
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2].map(i => <div key={i} className="h-48 bg-white/5 animate-pulse rounded-xl" />)}
          </div>
        ) : goals?.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4">
            {goals.map(goal => {
              const progress = Math.min((goal.current_amount / goal.target_amount) * 100, 100);
              
              return (
                <Card key={goal.id} className={`glass-card overflow-hidden relative ${goal.is_completed ? 'border-primary/50 bg-primary/5' : ''}`}>
                  {goal.is_completed && (
                    <div className="absolute top-4 right-4 text-primary">
                      <Trophy size={24} />
                    </div>
                  )}
                  <CardContent className="p-6">
                    <div className="flex gap-4 items-start mb-6">
                      <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-2xl flex-shrink-0">
                        {goal.icon || '🎯'}
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">{goal.name}</h3>
                        {goal.target_date && (
                          <p className="text-sm text-muted-foreground">Target: {new Date(goal.target_date).toLocaleDateString()}</p>
                        )}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between items-end">
                        <div className="text-2xl font-bold">{formatCurrency(goal.current_amount)}</div>
                        <div className="text-sm text-muted-foreground">of {formatCurrency(goal.target_amount)}</div>
                      </div>
                      <div className="h-3 bg-white/10 rounded-full overflow-hidden relative">
                        <div 
                          className="h-full rounded-full transition-all duration-1000 bg-gradient-to-r from-primary/80 to-primary"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <div className="text-right text-xs font-medium text-primary mt-1">
                        {progress.toFixed(0)}%
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="text-center p-12 glass-card rounded-xl flex flex-col items-center">
            <Target size={48} className="text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">No goals set yet</h3>
            <p className="text-muted-foreground mb-6">Setting financial goals gives your money purpose.</p>
            <Button>Create Your First Goal</Button>
          </div>
        )}
      </div>
    </Layout>
  );
}