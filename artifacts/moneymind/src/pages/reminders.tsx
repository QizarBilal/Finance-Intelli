import React from "react";
import { Layout } from "@/components/layout";
import { useListReminders } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { Bell, Calendar as CalIcon, CreditCard, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Reminders() {
  const { data: reminders, isLoading } = useListReminders();

  return (
    <Layout>
      <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Upcoming</h1>
            <p className="text-muted-foreground mt-1">Bills and scheduled transfers</p>
          </div>
          <Button variant="outline" className="glass-card">New Reminder</Button>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-20 bg-white/5 animate-pulse rounded-xl" />)}
          </div>
        ) : reminders?.length ? (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
            {reminders.map(rem => {
              const date = new Date(rem.due_date);
              const isPast = date < new Date() && !rem.is_paid;
              const isToday = date.toDateString() === new Date().toDateString();

              return (
                <Card key={rem.id} className={`glass-card overflow-hidden transition-all hover:bg-white/[0.07] ${isPast ? 'border-rose-500/50 bg-rose-500/5' : ''}`}>
                  <CardContent className="p-0 flex items-center">
                    <div className={`w-2 h-full absolute left-0 top-0 bottom-0 ${
                      rem.is_paid ? 'bg-emerald-500' :
                      isPast ? 'bg-rose-500' :
                      isToday ? 'bg-amber-500' : 'bg-primary'
                    }`} />
                    
                    <div className="flex-1 p-5 pl-8 flex items-center justify-between">
                      <div className="flex gap-4 items-center">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${rem.is_paid ? 'bg-emerald-500/20 text-emerald-500' : 'bg-white/5'}`}>
                          {rem.is_paid ? <CheckCircle2 size={20} /> : <CreditCard size={20} />}
                        </div>
                        <div>
                          <h4 className={`font-semibold ${rem.is_paid ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                            {rem.title}
                          </h4>
                          <div className="flex items-center gap-3 text-xs mt-1 text-muted-foreground">
                            <span className="flex items-center gap-1"><CalIcon size={12} /> {date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                            {rem.is_recurring && <span className="bg-white/10 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider">{rem.recurring_frequency}</span>}
                          </div>
                        </div>
                      </div>
                      
                      <div className="text-right flex items-center gap-4">
                        <div className={`text-lg font-bold ${isPast ? 'text-rose-500' : ''}`}>
                          {rem.amount ? formatCurrency(rem.amount) : 'Varies'}
                        </div>
                        {!rem.is_paid && (
                          <Button size="sm" className="hidden md:flex">Mark Paid</Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="text-center p-12 glass-card rounded-xl flex flex-col items-center">
            <Bell size={48} className="text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">You're all caught up</h3>
            <p className="text-muted-foreground mb-6">No upcoming bills or reminders.</p>
          </div>
        )}
      </div>
    </Layout>
  );
}