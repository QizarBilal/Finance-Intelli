import React, { useState } from "react";
import { useCreateTransaction, useListCategories } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const today = new Date().toISOString().split("T")[0];

export function TransactionSlideOver({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const createTx = useCreateTransaction();
  const { data: categories } = useListCategories({});

  const [type, setType] = useState<"expense" | "income">("expense");
  const [formData, setFormData] = useState({
    amount: "",
    description: "",
    category: "",      // free-text category
    date: today,
    payment_method: "",
    notes: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const resetForm = () => {
    setFormData({ amount: "", description: "", category: "", date: today, payment_method: "", notes: "" });
    setType("expense");
  };

  const handleClose = () => { resetForm(); onClose(); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.amount) return;

    createTx.mutate({
      data: {
        type,
        amount: Number(formData.amount),
        description: formData.description || undefined,
        category: formData.category || undefined,
        date: formData.date,
        payment_method: formData.payment_method || undefined,
        notes: formData.notes || undefined,
      } as any
    }, {
      onSuccess: () => {
        toast({ title: "Transaction added ✓" });
        handleClose();
      },
      onError: (err: any) => {
        toast({ title: "Failed to save", description: err?.message, variant: "destructive" });
      },
    });
  };

  // Build suggestion list from existing categories
  const suggestions = categories?.map(c => c.name) ?? [];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 right-0 w-full max-w-md bg-[#0d0d0f] border-l border-white/10 z-50 shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-xl font-bold text-white">New Transaction</h2>
              <button onClick={handleClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto">
              {/* Type toggle */}
              <div className="flex bg-white/5 p-1 rounded-lg mb-8">
                <button
                  onClick={() => setType("expense")}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${type === "expense" ? "bg-rose-500 text-white shadow-lg" : "text-white/50 hover:text-white"}`}
                >
                  Expense
                </button>
                <button
                  onClick={() => setType("income")}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${type === "income" ? "bg-emerald-500 text-white shadow-lg" : "text-white/50 hover:text-white"}`}
                >
                  Income
                </button>
              </div>

              <form id="tx-form" onSubmit={handleSubmit} className="space-y-5">
                {/* Amount */}
                <div className="space-y-2">
                  <Label className="text-white/80">Amount</Label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-white/40">₹</span>
                    <Input
                      type="number" name="amount" value={formData.amount}
                      onChange={handleChange}
                      className="pl-12 h-16 text-3xl font-bold bg-white/5 border-white/10 text-white placeholder:text-white/20"
                      placeholder="0.00" autoFocus required min="0" step="any"
                    />
                  </div>
                </div>

                {/* Category — free text with datalist suggestions */}
                <div className="space-y-2">
                  <Label className="text-white/80">
                    Category <span className="text-white/30 font-normal">(optional — type anything)</span>
                  </Label>
                  <div className="relative">
                    <input
                      name="category"
                      list="category-suggestions"
                      value={formData.category}
                      onChange={handleChange}
                      placeholder="e.g. Food, Rent, Salary…"
                      autoComplete="off"
                      className="w-full h-10 px-3 rounded-md bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <datalist id="category-suggestions">
                      {suggestions.map(s => <option key={s} value={s} />)}
                    </datalist>
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label className="text-white/80">Description</Label>
                  <Input
                    name="description" value={formData.description} onChange={handleChange}
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/25"
                    placeholder="What was this for?"
                  />
                </div>

                {/* Date */}
                <div className="space-y-2">
                  <Label className="text-white/80">Date</Label>
                  <Input
                    type="date" name="date" value={formData.date} onChange={handleChange}
                    className="bg-white/5 border-white/10 text-white"
                    required
                  />
                </div>

                {/* Payment method */}
                <div className="space-y-2">
                  <Label className="text-white/80">
                    Payment Method <span className="text-white/30 font-normal">(optional)</span>
                  </Label>
                  <input
                    name="payment_method"
                    list="payment-suggestions"
                    value={formData.payment_method}
                    onChange={handleChange}
                    placeholder="UPI, Cash, Credit Card…"
                    autoComplete="off"
                    className="w-full h-10 px-3 rounded-md bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <datalist id="payment-suggestions">
                    {["UPI", "Cash", "Credit Card", "Debit Card", "Net Banking", "Cheque"].map(p => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label className="text-white/80">
                    Notes <span className="text-white/30 font-normal">(optional)</span>
                  </Label>
                  <textarea
                    name="notes" value={formData.notes}
                    onChange={handleChange}
                    rows={2}
                    placeholder="Any extra details…"
                    className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  />
                </div>
              </form>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-white/5 bg-black/20">
              <Button
                type="submit" form="tx-form"
                className="w-full h-12 text-base font-semibold"
                disabled={createTx.isPending}
              >
                {createTx.isPending ? "Saving…" : `Save ${type === "expense" ? "Expense" : "Income"}`}
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
