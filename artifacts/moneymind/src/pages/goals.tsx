import React, { useState } from "react";
import { Layout } from "@/components/layout";
import { useListGoals, useCreateGoal, useUpdateGoal } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { Target, Trophy, Plus, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

const COLORS = ["#8b5cf6","#3b82f6","#22c55e","#f97316","#ef4444","#06b6d4","#ec4899","#eab308"];
const ICONS  = ["🎯","🏠","✈️","💻","🚗","📚","🏋️","💍","🎸","🌴","🛡️","💊"];

function GoalModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const createGoal = useCreateGoal();
  const [form, setForm] = useState({
    name: "", target_amount: "", current_amount: "", target_date: "",
    description: "", color: COLORS[0], icon: ICONS[0],
  });

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.target_amount) return;
    createGoal.mutate({
      data: {
        name: form.name,
        target_amount: Number(form.target_amount),
        current_amount: Number(form.current_amount) || 0,
        target_date: form.target_date || undefined,
        description: form.description || undefined,
        color: form.color,
        icon: form.icon,
      } as any
    }, {
      onSuccess: () => { toast({ title: "Goal created ✓" }); onClose(); },
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
            <h2 className="text-lg font-bold text-white">New Goal</h2>
            <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-white/70">
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Icon picker */}
            <div className="space-y-2">
              <label className="text-sm text-white/70">Icon</label>
              <div className="flex flex-wrap gap-2">
                {ICONS.map(ic => (
                  <button key={ic} type="button" onClick={() => set("icon", ic)}
                    className={`w-9 h-9 text-lg rounded-lg transition-all ${form.icon === ic ? "bg-primary/30 ring-2 ring-primary" : "bg-white/5 hover:bg-white/10"}`}>
                    {ic}
                  </button>
                ))}
              </div>
            </div>

            {/* Color picker */}
            <div className="space-y-2">
              <label className="text-sm text-white/70">Color</label>
              <div className="flex gap-2">
                {COLORS.map(c => (
                  <button key={c} type="button" onClick={() => set("color", c)}
                    className={`w-7 h-7 rounded-full transition-all ${form.color === c ? "ring-2 ring-white ring-offset-2 ring-offset-[#0d0d0f] scale-110" : ""}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm text-white/70">Goal Name *</label>
              <input value={form.name} onChange={e => set("name", e.target.value)} required
                placeholder="e.g. Emergency Fund"
                className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm text-white/70">Target Amount (₹) *</label>
                <input type="number" value={form.target_amount} onChange={e => set("target_amount", e.target.value)} required min="1"
                  placeholder="100000"
                  className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-white/70">Saved So Far (₹)</label>
                <input type="number" value={form.current_amount} onChange={e => set("current_amount", e.target.value)} min="0"
                  placeholder="0"
                  className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm text-white/70">Target Date (optional)</label>
              <input type="date" value={form.target_date} onChange={e => set("target_date", e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
            </div>

            <div className="space-y-1">
              <label className="text-sm text-white/70">Description (optional)</label>
              <input value={form.description} onChange={e => set("description", e.target.value)}
                placeholder="What are you saving for?"
                className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
            </div>

            <Button type="submit" className="w-full mt-2" disabled={createGoal.isPending}>
              {createGoal.isPending ? "Creating…" : "Create Goal"}
            </Button>
          </form>
        </div>
      </motion.div>
    </>
  );
}

export function Goals() {
  const { data: goals, isLoading } = useListGoals();
  const [showModal, setShowModal] = useState(false);

  return (
    <Layout>
      <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Goals</h1>
            <p className="text-white/50 mt-1">What are we saving for?</p>
          </div>
          <Button onClick={() => setShowModal(true)} className="gap-2">
            <Plus size={16} /> New Goal
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2].map(i => <div key={i} className="h-48 bg-white/5 animate-pulse rounded-xl" />)}
          </div>
        ) : goals?.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {goals.map(goal => {
              const progress = Math.min(((goal.current_amount ?? 0) / (goal.target_amount ?? 1)) * 100, 100);
              return (
                <Card key={goal.id} className={`glass-card overflow-hidden ${goal.is_completed ? "border-primary/40 bg-primary/5" : ""}`}>
                  {goal.is_completed && (
                    <div className="absolute top-4 right-4 text-primary"><Trophy size={22} /></div>
                  )}
                  <CardContent className="p-6">
                    <div className="flex gap-4 items-start mb-5">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                        style={{ backgroundColor: (goal.color ?? "#8b5cf6") + "22" }}>
                        {goal.icon || "🎯"}
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg text-white">{goal.name}</h3>
                        {goal.target_date && (
                          <p className="text-sm text-white/40">By {new Date(goal.target_date).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</p>
                        )}
                        {goal.description && <p className="text-xs text-white/30 mt-0.5">{goal.description}</p>}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-end">
                        <div className="text-xl font-bold text-white">{formatCurrency(goal.current_amount ?? 0)}</div>
                        <div className="text-sm text-white/40">of {formatCurrency(goal.target_amount ?? 0)}</div>
                      </div>
                      <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-1000"
                          style={{ width: `${progress}%`, backgroundColor: goal.color ?? "#8b5cf6" }} />
                      </div>
                      <div className="text-right text-xs font-semibold" style={{ color: goal.color ?? "#8b5cf6" }}>
                        {progress.toFixed(0)}%
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="text-center p-16 glass-card rounded-2xl flex flex-col items-center">
            <Target size={52} className="text-white/20 mb-5" />
            <h3 className="text-xl font-semibold text-white mb-2">No goals yet</h3>
            <p className="text-white/40 mb-6 max-w-xs">Setting financial goals gives your money direction and purpose.</p>
            <Button onClick={() => setShowModal(true)} className="gap-2">
              <Plus size={16} /> Create Your First Goal
            </Button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showModal && <GoalModal onClose={() => setShowModal(false)} />}
      </AnimatePresence>
    </Layout>
  );
}
