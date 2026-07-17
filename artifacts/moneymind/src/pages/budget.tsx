import React, { useState } from "react";
import { useGetBudgetUtilization, useCreateBudget, useListCategories } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { Plus, X, Wallet } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

const PERIODS = ["monthly", "weekly", "yearly"] as const;

function BudgetModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const createBudget = useCreateBudget();
  const { data: categories } = useListCategories({});
  const [form, setForm] = useState({
    name: "", amount: "", period: "monthly" as typeof PERIODS[number],
    category_id: "",
  });

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.amount) return;
    createBudget.mutate({
      data: {
        name: form.name,
        amount: Number(form.amount),
        period: form.period,
        category_id: form.category_id ? Number(form.category_id) : undefined,
      } as any
    }, {
      onSuccess: () => { toast({ title: "Budget created ✓" }); onClose(); },
      onError: (err: any) => toast({ title: "Error", description: err?.message, variant: "destructive" }),
    });
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="w-full max-w-md bg-[#0d0d0f] border border-white/10 rounded-2xl shadow-2xl">
          <div className="flex items-center justify-between p-6 border-b border-white/5">
            <h2 className="text-lg font-bold text-white">New Budget</h2>
            <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-white/70">
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="space-y-1">
              <label className="text-sm text-white/70">Budget Name *</label>
              <input value={form.name} onChange={e => set("name", e.target.value)} required
                placeholder="e.g. Monthly Food Budget"
                className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm text-white/70">Limit Amount (₹) *</label>
                <input type="number" value={form.amount} onChange={e => set("amount", e.target.value)} required min="1"
                  placeholder="5000"
                  className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-white/70">Period</label>
                <select value={form.period} onChange={e => set("period", e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-[#1a1a2e] border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary text-sm">
                  {PERIODS.map(p => <option key={p} value={p} className="bg-[#1a1a2e] text-white">{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm text-white/70">Category (optional — leave blank for overall budget)</label>
              <select value={form.category_id} onChange={e => set("category_id", e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-[#1a1a2e] border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary text-sm">
                <option value="" className="bg-[#1a1a2e] text-white">All categories (overall)</option>
                {categories?.filter(c => c.type === "expense" || c.type === "any").map(c => (
                  <option key={c.id} value={c.id} className="bg-[#1a1a2e] text-white">{c.name}</option>
                ))}
              </select>
            </div>

            <Button type="submit" className="w-full mt-2" disabled={createBudget.isPending}>
              {createBudget.isPending ? "Creating…" : "Create Budget"}
            </Button>
          </form>
        </div>
      </motion.div>
    </>
  );
}

export function Budget() {
  const { data: utilization, isLoading } = useGetBudgetUtilization({ period: "monthly" });
  const [showModal, setShowModal] = useState(false);

  return (
    <Layout>
      <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Budgets</h1>
            <p className="text-white/50 mt-1">Keep your spending in check</p>
          </div>
          <Button onClick={() => setShowModal(true)} className="gap-2">
            <Plus size={16} /> New Budget
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2, 3].map(i => <div key={i} className="h-40 bg-white/5 animate-pulse rounded-xl" />)}
          </div>
        ) : utilization?.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {utilization.map(bud => (
              <Card key={bud.budget_id} className="glass-card">
                <CardContent className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-semibold text-lg text-white">{bud.budget_name || bud.category_name || "General"}</h3>
                      <p className="text-sm text-white/40 capitalize">{bud.period} Budget</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold text-xl ${bud.status === "exceeded" ? "text-rose-400" : "text-white"}`}>
                        {formatCurrency(Math.max(bud.budget_amount - bud.spent_amount, 0))}
                      </p>
                      <p className="text-xs text-white/40">remaining</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-white/60">
                      <span>{formatCurrency(bud.spent_amount)} spent</span>
                      <span>{formatCurrency(bud.budget_amount)} limit</span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-1000 ${bud.status === "exceeded" ? "bg-rose-500" : bud.status === "warning" ? "bg-amber-500" : "bg-primary"}`}
                        style={{ width: `${Math.min(bud.utilization_percent, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-white/40 text-right">{bud.utilization_percent.toFixed(0)}% used</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center p-16 glass-card rounded-2xl flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-5">
              <Wallet size={28} className="text-white/30" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">No budgets yet</h3>
            <p className="text-white/40 mb-6 max-w-xs">Set spending limits to stay on track with your financial goals.</p>
            <Button onClick={() => setShowModal(true)} className="gap-2">
              <Plus size={16} /> Create Your First Budget
            </Button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showModal && <BudgetModal onClose={() => setShowModal(false)} />}
      </AnimatePresence>
    </Layout>
  );
}
