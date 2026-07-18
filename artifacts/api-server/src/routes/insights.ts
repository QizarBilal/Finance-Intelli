import { Router } from "express";
import { db, transactionsTable, budgetsTable } from "@workspace/db";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.get("/insights", requireAuth, async (_req, res): Promise<void> => {
  const now = new Date();
  const thisMonthFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const thisMonthTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()}`;

  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthFrom = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}-01`;
  const lastMonthTo = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}-${new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0).getDate()}`;

  const [thisMonthExpenses, lastMonthExpenses, budgets, categorySpend] = await Promise.all([
    db.select({ total: sql<string>`coalesce(sum(amount), 0)` }).from(transactionsTable)
      .where(and(eq(transactionsTable.type, "expense"), gte(transactionsTable.date, thisMonthFrom), lte(transactionsTable.date, thisMonthTo))),
    db.select({ total: sql<string>`coalesce(sum(amount), 0)` }).from(transactionsTable)
      .where(and(eq(transactionsTable.type, "expense"), gte(transactionsTable.date, lastMonthFrom), lte(transactionsTable.date, lastMonthTo))),
    db.select().from(budgetsTable),
    db.select({
      category: transactionsTable.category,
      thisMonth: sql<string>`coalesce(sum(case when ${transactionsTable.date} >= ${thisMonthFrom} and ${transactionsTable.date} <= ${thisMonthTo} then ${transactionsTable.amount} else 0 end), 0)`,
      lastMonth: sql<string>`coalesce(sum(case when ${transactionsTable.date} >= ${lastMonthFrom} and ${transactionsTable.date} <= ${lastMonthTo} then ${transactionsTable.amount} else 0 end), 0)`,
    }).from(transactionsTable)
      .where(and(eq(transactionsTable.type, "expense"), gte(transactionsTable.date, lastMonthFrom)))
      .groupBy(transactionsTable.category),
  ]);

  const thisMonth = parseFloat(thisMonthExpenses[0]?.total ?? "0");
  const lastMonth2 = parseFloat(lastMonthExpenses[0]?.total ?? "0");
  const insights = [];

  // Spending increase vs last month
  if (lastMonth2 > 0 && thisMonth > lastMonth2 * 1.2) {
    const increase = Math.round(((thisMonth - lastMonth2) / lastMonth2) * 100);
    insights.push({
      id: "spending-increase",
      type: "warning",
      title: "Spending Up This Month",
      description: `Your expenses this month are ${increase}% higher than last month. Consider reviewing discretionary spending.`,
      severity: increase > 50 ? "high" : "medium",
      category: null,
      amount: thisMonth - lastMonth2,
      trend: `+${increase}%`,
    });
  }

  // Budget overruns
  for (const budget of budgets) {
    if (budget.period !== "monthly") continue;
    const spent = parseFloat((await db.select({ total: sql<string>`coalesce(sum(amount), 0)` })
      .from(transactionsTable)
      .where(and(
        eq(transactionsTable.type, "expense"),
        gte(transactionsTable.date, thisMonthFrom),
        lte(transactionsTable.date, thisMonthTo),
        ...(budget.category ? [eq(transactionsTable.category, budget.category)] : [])
      )))[0]?.total ?? "0");
    const budgetAmt = parseFloat(budget.amount);
    if (spent > budgetAmt) {
      insights.push({
        id: `budget-exceeded-${budget.id}`,
        type: "warning",
        title: `Budget Exceeded: ${budget.name}`,
        description: `You have exceeded your ${budget.name} budget by ₹${Math.round(spent - budgetAmt).toLocaleString("en-IN")}. Time to cut back.`,
        severity: "high",
        category: budget.category,
        amount: spent - budgetAmt,
        trend: null,
      });
    } else if (spent > budgetAmt * 0.8) {
      const threshold = Math.round((spent / budgetAmt) * 100);
      insights.push({
        id: `budget-warning-${budget.id}`,
        type: "warning",
        title: `Approaching Budget Limit: ${budget.name}`,
        description: `You've used ${threshold}% of your ${budget.name} budget. Slow down to stay within limits.`,
        severity: "medium",
        category: budget.category,
        amount: null,
        trend: `${threshold}% used`,
      });
    }
  }

  // Category spike detection
  for (const cat of categorySpend) {
    const thisM = parseFloat(cat.thisMonth);
    const lastM = parseFloat(cat.lastMonth);
    if (lastM > 0 && thisM > lastM * 1.5 && thisM > 500) {
      const spike = Math.round(((thisM - lastM) / lastM) * 100);
      insights.push({
        id: `category-spike-${cat.category ?? "misc"}`,
        type: "warning",
        title: `${cat.category ?? "Miscellaneous"} Spending Spike`,
        description: `Your spending on ${cat.category ?? "miscellaneous"} jumped ${spike}% compared to last month.`,
        severity: spike > 100 ? "high" : "medium",
        category: cat.category,
        amount: thisM - lastM,
        trend: `+${spike}%`,
      });
    }
  }

  // Savings tip if savings rate is low
  if (thisMonth > 0 && lastMonth2 > 0) {
    const thisMonthIncome = parseFloat((await db.select({ total: sql<string>`coalesce(sum(amount), 0)` })
      .from(transactionsTable)
      .where(and(eq(transactionsTable.type, "income"), gte(transactionsTable.date, thisMonthFrom), lte(transactionsTable.date, thisMonthTo))))[0]?.total ?? "0");

    const savingsRate = thisMonthIncome > 0 ? (thisMonthIncome - thisMonth) / thisMonthIncome : 0;
    if (savingsRate < 0.1 && thisMonthIncome > 0) {
      insights.push({
        id: "low-savings-rate",
        type: "warning",
        title: "Low Savings Rate",
        description: `You're saving less than 10% of your income this month. Aim for at least 20% to build a strong financial cushion.`,
        severity: "high",
        category: null,
        amount: null,
        trend: `${Math.round(savingsRate * 100)}% saved`,
      });
    } else if (savingsRate >= 0.3) {
      insights.push({
        id: "great-savings",
        type: "success",
        title: "Excellent Savings Rate",
        description: `You're saving ${Math.round(savingsRate * 100)}% of your income this month. Keep up the great work!`,
        severity: "low",
        category: null,
        amount: null,
        trend: `${Math.round(savingsRate * 100)}% saved`,
      });
    }
  }

  // No transactions yet — provide tip
  if (insights.length === 0) {
    insights.push({
      id: "getting-started",
      type: "info",
      title: "Start Tracking to Get Insights",
      description: "Add your income and expenses to unlock personalized AI insights about your spending patterns, savings rate, and budget health.",
      severity: "low",
      category: null,
      amount: null,
      trend: null,
    });
    insights.push({
      id: "budget-tip",
      type: "tip",
      title: "Set Up Budgets",
      description: "Create category-level budgets to automatically track your spending limits and receive alerts when you're close to exceeding them.",
      severity: "low",
      category: null,
      amount: null,
      trend: null,
    });
    insights.push({
      id: "goal-tip",
      type: "tip",
      title: "Set a Savings Goal",
      description: "Whether it's an emergency fund, a vacation, or a major purchase — setting a goal gives your savings a purpose and keeps you motivated.",
      severity: "low",
      category: null,
      amount: null,
      trend: null,
    });
  }

  res.json(insights);
});

export default router;
