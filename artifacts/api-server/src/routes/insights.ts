import { Router } from "express";
import { collections, getCollection } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
const router = Router();
router.get("/insights", requireAuth, async (req, res) => {
  const now = new Date(), month = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const current = month(now), previous = month(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const txs: any[] = await (await getCollection(collections.transactions)).find({ profileId: req.user!.userId, deletedAt: null, status: { $ne: "void" }, date: { $gte: `${previous}-01` } }).toArray();
  const expense = (m: string) => txs.filter(t => t.type === "expense" && String(t.date).startsWith(m)).reduce((s, t) => s + Number(t.amount), 0);
  const thisExpense = expense(current), lastExpense = expense(previous), insights: any[] = [];
  if (lastExpense > 0 && thisExpense > lastExpense * 1.2) { const increase = Math.round((thisExpense - lastExpense) / lastExpense * 100); insights.push({ id: "spending-increase", type: "warning", title: "Spending Up This Month", description: `Your expenses this month are ${increase}% higher than last month.`, severity: increase > 50 ? "high" : "medium", category: null, amount: thisExpense - lastExpense, trend: `+${increase}%` }); }
  const spend = new Map<string, number>(); for (const t of txs.filter(t => t.type === "expense" && String(t.date).startsWith(current))) spend.set(t.category || "Uncategorized", (spend.get(t.category || "Uncategorized") || 0) + Number(t.amount));
  const budgets: any[] = await (await getCollection(collections.budgets)).find({ profileId: req.user!.userId }).toArray();
  for (const b of budgets.filter(b => b.period === "monthly")) { const used = b.category ? spend.get(b.category) || 0 : thisExpense, limit = Number(b.limitAmount ?? b.amount ?? 0), pct = limit ? Math.round(used / limit * 100) : 0; if (pct >= 80) insights.push({ id: `budget-${b.id}`, type: "warning", title: pct > 100 ? `Budget Exceeded: ${b.name}` : `Approaching Budget Limit: ${b.name}`, description: pct > 100 ? `You have exceeded this budget by ₹${Math.round(used-limit).toLocaleString("en-IN")}.` : `You've used ${pct}% of this budget.`, severity: pct > 100 ? "high" : "medium", category: b.category ?? null, amount: pct > 100 ? used-limit : null, trend: `${pct}% used` }); }
  const income = txs.filter(t => t.type === "income" && String(t.date).startsWith(current)).reduce((s,t) => s + Number(t.amount), 0), rate = income > 0 ? (income-thisExpense)/income : 0;
  if (income > 0 && rate < .1) insights.push({ id: "low-savings-rate", type: "warning", title: "Low Savings Rate", description: "You're saving less than 10% of your income this month.", severity: "high", category: null, amount: null, trend: `${Math.round(rate*100)}% saved` });
  if (!insights.length) insights.push({ id: "getting-started", type: "info", title: "Your Finances Look Steady", description: "Keep tracking transactions to unlock more personalized spending and budget insights.", severity: "low", category: null, amount: null, trend: null });
  res.json(insights);
});
export default router;
