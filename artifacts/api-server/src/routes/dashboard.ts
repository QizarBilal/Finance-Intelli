import { Router } from "express";
import { db, transactionsTable, budgetsTable, remindersTable } from "@workspace/db";
import { eq, and, gte, lte, sql, asc, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { GetRecentTransactionsQueryParams, GetUpcomingRemindersQueryParams } from "@workspace/api-zod";

const router = Router();

function getDateRange(period: "today" | "weekly" | "monthly" | "yearly") {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  if (period === "today") {
    return { from: today, to: today };
  } else if (period === "weekly") {
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((day + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { from: monday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10) };
  } else if (period === "monthly") {
    const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${lastDay}`;
    return { from, to };
  } else {
    return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
  }
}

async function getPeriodStats(period: "today" | "weekly" | "monthly" | "yearly") {
  const { from, to } = getDateRange(period);

  const rows = await db.select({
    type: transactionsTable.type,
    total: sql<string>`coalesce(sum(${transactionsTable.amount}), 0)`,
  })
    .from(transactionsTable)
    .where(and(gte(transactionsTable.date, from), lte(transactionsTable.date, to)))
    .groupBy(transactionsTable.type);

  const income = parseFloat(rows.find(r => r.type === "income")?.total ?? "0");
  const expense = parseFloat(rows.find(r => r.type === "expense")?.total ?? "0");
  const savings = income - expense;

  return { income, expense, savings };
}

router.get("/dashboard/summary", requireAuth, async (_req, res): Promise<void> => {
  const [today, weekly, monthly, yearly] = await Promise.all([
    getPeriodStats("today"),
    getPeriodStats("weekly"),
    getPeriodStats("monthly"),
    getPeriodStats("yearly"),
  ]);

  // Total balance (all time income - expense)
  const [{ total: totalIncome }] = await db.select({ total: sql<string>`coalesce(sum(amount), 0)` })
    .from(transactionsTable).where(eq(transactionsTable.type, "income"));
  const [{ total: totalExpense }] = await db.select({ total: sql<string>`coalesce(sum(amount), 0)` })
    .from(transactionsTable).where(eq(transactionsTable.type, "expense"));

  const balance = parseFloat(totalIncome ?? "0") - parseFloat(totalExpense ?? "0");

  const savingsRate = monthly.income > 0 ? (monthly.savings / monthly.income) * 100 : 0;

  // Budget usage
  const budgets = await db.select().from(budgetsTable);
  let budgetUsagePercent = 0;
  if (budgets.length > 0) {
    const monthRange = getDateRange("monthly");
    const rows = await db.select({
      total: sql<string>`coalesce(sum(amount), 0)`,
    }).from(transactionsTable).where(
      and(
        eq(transactionsTable.type, "expense"),
        gte(transactionsTable.date, monthRange.from),
        lte(transactionsTable.date, monthRange.to)
      )
    );
    const monthlyExpense = parseFloat(rows[0]?.total ?? "0");
    const totalBudget = budgets.reduce((sum, b) => {
      if (b.period === "monthly") return sum + parseFloat(b.amount);
      return sum;
    }, 0);
    budgetUsagePercent = totalBudget > 0 ? (monthlyExpense / totalBudget) * 100 : 0;
  }

  // Financial health score (0-100)
  const healthScore = Math.min(100, Math.max(0,
    (savingsRate > 20 ? 40 : savingsRate * 2) +
    (budgetUsagePercent < 80 ? 30 : 30 - (budgetUsagePercent - 80) * 0.5) +
    (balance > 0 ? 30 : 0)
  ));

  res.json({
    today,
    weekly,
    monthly,
    yearly,
    balance,
    savingsRate: Math.round(savingsRate * 10) / 10,
    budgetUsagePercent: Math.round(budgetUsagePercent * 10) / 10,
    financialHealthScore: Math.round(healthScore),
  });
});

router.get("/dashboard/recent-transactions", requireAuth, async (req, res): Promise<void> => {
  const parsed = GetRecentTransactionsQueryParams.safeParse(req.query);
  const limit = (parsed.success ? parsed.data.limit : 10) ?? 10;

  const transactions = await db.select().from(transactionsTable)
    .orderBy(desc(transactionsTable.date), desc(transactionsTable.createdAt))
    .limit(limit);

  res.json(transactions.map(t => ({
    id: t.id,
    type: t.type,
    amount: parseFloat(t.amount),
    date: t.date,
    time: t.time,
    category: t.category,
    description: t.description,
    paymentMethod: t.paymentMethod,
    receipt: t.receipt,
    location: t.location,
    tags: t.tags,
    notes: t.notes,
    priority: t.priority,
    recurring: t.recurring,
    recurringFrequency: t.recurringFrequency,
    needOrWant: t.needOrWant,
    taxDeductible: t.taxDeductible,
    createdAt: t.createdAt.toISOString(),
  })));
});

router.get("/dashboard/upcoming-reminders", requireAuth, async (req, res): Promise<void> => {
  const parsed = GetUpcomingRemindersQueryParams.safeParse(req.query);
  const limit = (parsed.success ? parsed.data.limit : 5) ?? 5;

  const today = new Date().toISOString().slice(0, 10);
  const reminders = await db.select().from(remindersTable)
    .where(and(gte(remindersTable.dueDate, today), eq(remindersTable.isCompleted, false)))
    .orderBy(asc(remindersTable.dueDate))
    .limit(limit);

  res.json(reminders.map(r => ({
    id: r.id,
    title: r.title,
    type: r.type,
    amount: r.amount != null ? parseFloat(r.amount) : null,
    dueDate: r.dueDate,
    recurring: r.recurring,
    recurringFrequency: r.recurringFrequency,
    notes: r.notes,
    isCompleted: r.isCompleted,
    createdAt: r.createdAt.toISOString(),
  })));
});

export default router;
