import { Router } from "express";
import { collections, getCollection } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { dateString, zonedDateParts } from "../lib/dates";
import {
  resolveBudgetCategory,
  sumExpensesForCategory,
} from "../lib/budgeting";

const router = Router();
const active = { $in: [null, undefined] };

type MoneyTotals = { income: number; expenses: number };
type Insight = {
  id: string;
  type: "warning" | "success" | "tip" | "info";
  title: string;
  description: string;
  severity: "high" | "medium" | "low";
  category: string | null;
  amount: number | null;
  currency: string;
  trend: string | null;
};

router.get("/insights", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const now = new Date();
  const profiles = await getCollection(collections.profiles);
  const profile: any = await profiles.findOne({ id: userId });
  const timeZone = profile?.timezone ?? "UTC";
  const todayParts = zonedDateParts(now, timeZone);
  const today = dateString(todayParts);
  const currentMonthStart = dateString({ ...todayParts, day: 1 });
  const previousMonthStartDate = new Date(
    Date.UTC(todayParts.year, todayParts.month - 2, 1, 12),
  );
  const previousMonthStart = dateString({
    year: previousMonthStartDate.getUTCFullYear(),
    month: previousMonthStartDate.getUTCMonth() + 1,
    day: 1,
  });
  const previousMonthLastDay = new Date(
    Date.UTC(todayParts.year, todayParts.month - 1, 0),
  ).getUTCDate();
  const comparisonDay = Math.min(todayParts.day, previousMonthLastDay);
  const previousMonthThrough = dateString({
    year: previousMonthStartDate.getUTCFullYear(),
    month: previousMonthStartDate.getUTCMonth() + 1,
    day: comparisonDay,
  });

  const [accounts, transactions, budgets] = await Promise.all([
    getCollection(collections.accounts),
    getCollection(collections.transactions),
    getCollection(collections.budgets),
  ]);
  const accountRows = await accounts
    .find({ profileId: userId })
    .project({ id: 1, currency: 1 })
    .toArray();
  const currencyByAccount = new Map(
    accountRows.map((account: any) => [Number(account.id), String(account.currency || "INR").toUpperCase()]),
  );
  const rows: any[] = await transactions
    .find({
      profileId: userId,
      deletedAt: active,
      status: { $ne: "void" },
      date: { $gte: previousMonthStart, $lte: today },
      type: { $in: ["income", "expense"] },
    })
    .toArray();

  const totals = new Map<string, { current: MoneyTotals; previous: MoneyTotals }>();
  const thisMonthRows = new Map<string, any[]>();
  const availableCategories = rows.map((row) => row.category).filter(Boolean);
  for (const row of rows) {
    const currency = currencyByAccount.get(Number(row.accountId)) || "INR";
    const bucket = totals.get(currency) ?? {
      current: { income: 0, expenses: 0 },
      previous: { income: 0, expenses: 0 },
    };
    const inCurrent = row.date >= currentMonthStart && row.date <= today;
    const inPreviousComparable = row.date >= previousMonthStart && row.date <= previousMonthThrough;
    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (inCurrent) {
      bucket.current[row.type === "income" ? "income" : "expenses"] += amount;
      const list = thisMonthRows.get(currency) ?? [];
      list.push(row);
      thisMonthRows.set(currency, list);
    } else if (inPreviousComparable) {
      bucket.previous[row.type === "income" ? "income" : "expenses"] += amount;
    }
    totals.set(currency, bucket);
  }

  const budgetRows: any[] = await budgets
    .find({ profileId: userId, archivedAt: active })
    .toArray();
  const insights: Insight[] = [];
  const currencies = new Set([...totals.keys(), ...budgetRows.map((item) => String(item.currency || "INR").toUpperCase())]);

  for (const currency of currencies) {
    const bucket = totals.get(currency) ?? {
      current: { income: 0, expenses: 0 },
      previous: { income: 0, expenses: 0 },
    };
    const currentRows = thisMonthRows.get(currency) ?? [];
    const currentExpense = bucket.current.expenses;
    const priorExpense = bucket.previous.expenses;
    const priorIncome = bucket.previous.income;
    const currentIncome = bucket.current.income;

    if (priorExpense > 0 && currentExpense > priorExpense * 1.2) {
      const increase = Math.round(((currentExpense - priorExpense) / priorExpense) * 100);
      insights.push({
        id: `spending-increase-${currency}`,
        type: "warning",
        title: `Spending is up · ${currency}`,
        description: `You have spent ${increase}% more than the same number of days last month (${today} vs ${previousMonthThrough}).`,
        severity: increase > 50 ? "high" : "medium",
        category: null,
        amount: currentExpense - priorExpense,
        currency,
        trend: `+${increase}% month to date`,
      });
    }

    for (const budget of budgetRows.filter((item) => item.period === "monthly" && String(item.currency || "INR").toUpperCase() === currency)) {
      const category = resolveBudgetCategory(budget, availableCategories);
      const used = sumExpensesForCategory(currentRows, category);
      const limit = Number(budget.limitAmount ?? budget.amount ?? 0);
      const percent = limit > 0 ? Math.round((used / limit) * 100) : 0;
      if (percent >= 80) {
        const exceeded = percent > 100;
        insights.push({
          id: `budget-${budget.id}-${currency}`,
          type: "warning",
          title: exceeded ? `Budget exceeded · ${budget.name}` : `Budget nearly reached · ${budget.name}`,
          description: exceeded
            ? `Spending is ${percent}% of this ${currency} limit, exceeding it by ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(used - limit)} ${currency}.`
            : `You have used ${percent}% of this ${currency} budget so far this month.`,
          severity: exceeded ? "high" : "medium",
          category,
          amount: exceeded ? used - limit : used,
          currency,
          trend: `${percent}% of limit`,
        });
      }
    }

    if (currentIncome > 0) {
      const savingsRate = ((currentIncome - currentExpense) / currentIncome) * 100;
      if (savingsRate < 10) {
        insights.push({
          id: `low-savings-rate-${currency}`,
          type: "warning",
          title: `Savings rate needs attention · ${currency}`,
          description: `Your month-to-date savings rate is ${Math.round(savingsRate)}%. Review flexible spending and upcoming commitments.`,
          severity: savingsRate < 0 ? "high" : "medium",
          category: null,
          amount: Math.max(0, currentExpense - currentIncome),
          currency,
          trend: `${Math.round(savingsRate)}% saved`,
        });
      }
    }

    const uncategorized = currentRows.filter((row) => row.type === "expense" && !String(row.category ?? "").trim());
    const uncategorizedAmount = uncategorized.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    if (uncategorized.length >= 3) {
      insights.push({
        id: `uncategorized-${currency}`,
        type: "tip",
        title: `Categorize recent spending · ${currency}`,
        description: `${uncategorized.length} expenses totaling ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(uncategorizedAmount)} ${currency} have no category. Categorizing them improves budgets and reports.`,
        severity: "low",
        category: null,
        amount: uncategorizedAmount,
        currency,
        trend: `${uncategorized.length} to review`,
      });
    }
  }

  if (!insights.length) {
    insights.push({
      id: "steady-finances",
      type: "info",
      title: "No urgent signals right now",
      description: "We compare like-for-like month-to-date spending, respect account currencies, and review your active monthly budgets. Keep imports and categories up to date for more useful guidance.",
      severity: "low",
      category: null,
      amount: null,
      currency: "INR",
      trend: null,
    });
  }

  const severityOrder = { high: 0, medium: 1, low: 2 };
  insights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  res.json(insights);
});

export default router;
