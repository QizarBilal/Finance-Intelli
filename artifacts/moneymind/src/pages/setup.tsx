import React, { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

interface SetupProps {
  token: string;
  onComplete: () => void;
}

const inputCls = "w-full h-11 px-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-primary text-sm";
const selectCls = "w-full h-11 px-3 rounded-lg bg-[#1a1a2e] border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary text-sm";
const labelCls = "block text-sm font-medium text-white/70 mb-1";

export function SetupWizard({ token, onComplete }: SetupProps) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    occupation: "",
    company: "",
    income_type: "Salary",
    currency: "INR",
    country: "",
    state: "",
    monthly_income: "",
    salary_frequency: "monthly",
    monthly_goal: "",
    weekly_savings_goal: "",
    emergency_fund_goal: "",
    theme: "dark",
    week_start_day: "Monday",
  });

  const set = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const totalSteps = 4;

  const handleComplete = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...form,
          monthly_income: form.monthly_income ? Number(form.monthly_income) : undefined,
          monthly_goal: form.monthly_goal ? Number(form.monthly_goal) : undefined,
          weekly_savings_goal: form.weekly_savings_goal ? Number(form.weekly_savings_goal) : undefined,
          emergency_fund_goal: form.emergency_fund_goal ? Number(form.emergency_fund_goal) : undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to save profile");
      localStorage.setItem("profile_setup_complete", "true");
      onComplete();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const steps = [
    {
      title: "Personal Details",
      desc: "Tell us a bit about yourself.",
      content: (
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Full Name *</label>
            <input name="full_name" value={form.full_name} onChange={set} required placeholder="Your full name" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Occupation</label>
            <input name="occupation" value={form.occupation} onChange={set} placeholder="e.g. Software Engineer" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Company / Employer</label>
            <input name="company" value={form.company} onChange={set} placeholder="Where do you work?" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Country</label>
              <input name="country" value={form.country} onChange={set} placeholder="India" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>State</label>
              <input name="state" value={form.state} onChange={set} placeholder="Tamil Nadu" className={inputCls} />
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Financial Profile",
      desc: "How money comes in.",
      content: (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Currency</label>
              <select name="currency" value={form.currency} onChange={set} className={selectCls}>
                {["INR","USD","EUR","GBP","AED","SGD","CAD","AUD"].map(c => (
                  <option key={c} value={c} className="bg-[#1a1a2e] text-white">{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Income Type</label>
              <select name="income_type" value={form.income_type} onChange={set} className={selectCls}>
                {["Salary","Freelance","Business","Investment","Mixed"].map(t => (
                  <option key={t} value={t} className="bg-[#1a1a2e] text-white">{t}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Monthly Income (₹)</label>
            <input type="number" name="monthly_income" value={form.monthly_income} onChange={set} placeholder="e.g. 60000" min="0" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Salary Frequency</label>
            <select name="salary_frequency" value={form.salary_frequency} onChange={set} className={selectCls}>
              {["monthly","bi-weekly","weekly","annually"].map(f => (
                <option key={f} value={f} className="bg-[#1a1a2e] text-white">{f.charAt(0).toUpperCase()+f.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>
      ),
    },
    {
      title: "Your Goals",
      desc: "What are we aiming for?",
      content: (
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Monthly Savings Goal (₹)</label>
            <input type="number" name="monthly_goal" value={form.monthly_goal} onChange={set} placeholder="e.g. 20000" min="0" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Weekly Savings Goal (₹)</label>
            <input type="number" name="weekly_savings_goal" value={form.weekly_savings_goal} onChange={set} placeholder="e.g. 5000" min="0" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Emergency Fund Target (₹)</label>
            <input type="number" name="emergency_fund_goal" value={form.emergency_fund_goal} onChange={set} placeholder="e.g. 200000" min="0" className={inputCls} />
          </div>
        </div>
      ),
    },
    {
      title: "Preferences",
      desc: "Make it yours.",
      content: (
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Theme</label>
            <select name="theme" value={form.theme} onChange={set} className={selectCls}>
              <option value="dark" className="bg-[#1a1a2e] text-white">Dark (recommended)</option>
              <option value="light" className="bg-[#1a1a2e] text-white">Light</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Week Starts On</label>
            <select name="week_start_day" value={form.week_start_day} onChange={set} className={selectCls}>
              {["Monday","Sunday","Saturday"].map(d => (
                <option key={d} value={d} className="bg-[#1a1a2e] text-white">{d}</option>
              ))}
            </select>
          </div>
          <div className="mt-4 p-4 rounded-xl bg-primary/10 border border-primary/20">
            <p className="text-sm text-white/70">
              🎉 Almost done! Click <strong className="text-white">Complete Setup</strong> to start tracking your finances.
            </p>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-[100dvh] bg-[#0d0d0f] flex items-center justify-center p-4">
      <div className="w-full max-w-md relative">
        <div className="absolute inset-0 bg-primary/15 blur-[120px] rounded-full" />

        <div className="relative z-10 bg-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl p-8 shadow-2xl">
          {/* Progress dots */}
          <div className="flex gap-2 mb-8">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i < step ? "bg-primary" : "bg-white/10"}`} />
            ))}
          </div>

          <h2 className="text-2xl font-bold text-white mb-1">{steps[step - 1].title}</h2>
          <p className="text-white/50 mb-6 text-sm">{steps[step - 1].desc}</p>

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.18 }}
            >
              {steps[step - 1].content}
            </motion.div>
          </AnimatePresence>

          <div className="flex justify-between mt-8">
            <button
              onClick={() => setStep(s => Math.max(s - 1, 1))}
              disabled={step === 1}
              className="px-4 py-2 text-sm text-white/40 hover:text-white/70 disabled:opacity-0 transition-colors"
            >
              ← Back
            </button>
            {step < totalSteps ? (
              <button
                onClick={() => setStep(s => s + 1)}
                className="px-6 py-2 bg-primary hover:bg-primary/90 text-white font-medium rounded-lg text-sm transition-colors"
              >
                Next →
              </button>
            ) : (
              <button
                onClick={handleComplete}
                disabled={saving}
                className="px-6 py-2 bg-primary hover:bg-primary/90 text-white font-semibold rounded-lg text-sm transition-colors disabled:opacity-60"
              >
                {saving ? "Saving…" : "Complete Setup ✓"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
