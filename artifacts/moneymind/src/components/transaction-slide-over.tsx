import React, { useState } from "react";
import { useCreateTransaction, useListCategories } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function TransactionSlideOver({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const createTx = useCreateTransaction();
  const { data: categories } = useListCategories({ type: "any" });

  const [type, setType] = useState<"expense" | "income">("expense");
  const [formData, setFormData] = useState({
    amount: "",
    description: "",
    category_id: "",
    date: new Date().toISOString().split('T')[0],
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.amount || !formData.category_id) return;

    createTx.mutate({
      data: {
        type,
        amount: Number(formData.amount),
        description: formData.description,
        category_id: Number(formData.category_id),
        date: formData.date,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Transaction added", description: "Successfully logged." });
        onClose();
        setFormData({ ...formData, amount: "", description: "" });
      }
    });
  };

  const filteredCategories = categories?.filter(c => c.type === type || c.type === "any") || [];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 right-0 w-full max-w-md bg-[#0d0d0f] border-l border-white/10 z-50 shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-xl font-bold">New Transaction</h2>
              <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto">
              <div className="flex bg-white/5 p-1 rounded-lg mb-8">
                <button
                  onClick={() => setType("expense")}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${type === "expense" ? "bg-rose-500 text-white shadow-lg" : "text-muted-foreground hover:text-white"}`}
                >
                  Expense
                </button>
                <button
                  onClick={() => setType("income")}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${type === "income" ? "bg-emerald-500 text-white shadow-lg" : "text-muted-foreground hover:text-white"}`}
                >
                  Income
                </button>
              </div>

              <form id="tx-form" onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label>Amount</Label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-muted-foreground">₹</span>
                    <Input 
                      type="number" 
                      name="amount"
                      value={formData.amount}
                      onChange={handleChange}
                      className="pl-12 h-16 text-3xl font-bold bg-white/5 border-white/10 placeholder:text-white/20"
                      placeholder="0.00"
                      autoFocus
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Category</Label>
                  <select 
                    name="category_id"
                    value={formData.category_id}
                    onChange={handleChange}
                    className="flex h-10 w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    required
                  >
                    <option value="" disabled className="bg-[#0d0d0f]">Select a category...</option>
                    {filteredCategories.map(cat => (
                      <option key={cat.id} value={cat.id} className="bg-[#0d0d0f]">
                        {cat.icon} {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input 
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    className="bg-white/5 border-white/10"
                    placeholder="What was this for?"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input 
                    type="date"
                    name="date"
                    value={formData.date}
                    onChange={handleChange}
                    className="bg-white/5 border-white/10"
                    required
                  />
                </div>
              </form>
            </div>

            <div className="p-6 border-t border-white/5 bg-black/20">
              <Button type="submit" form="tx-form" className="w-full h-12 text-lg font-semibold" disabled={createTx.isPending}>
                {createTx.isPending ? "Saving..." : "Save Transaction"}
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}