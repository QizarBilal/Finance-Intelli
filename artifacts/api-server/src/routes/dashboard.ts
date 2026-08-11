import { Router } from "express";
import { accountsTable, db, transactionsTable, budgetsTable, remindersTable, profileTable } from "@workspace/db";
import { eq, and, gte, lte, sql, asc, desc, isNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { GetRecentTransactionsQueryParams, GetUpcomingRemindersQueryParams } from "@workspace/api-zod";

const router = Router();

import { periodRange } from "../lib/dates";

async function getPeriodStats(userId: number, period: "today" | "weekly" | "monthly" | "yearly", timeZone: string, weekStarts: "monday" | "sunday") {
  const { from, to } = periodRange(period, timeZone, weekStarts);
  const rows = await db.select({
    type: transactionsTable.type,
    total: sql<string>`coalesce(sum(${transactionsTable.amount}), 0)`,
  })
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.profileId, userId),
      isNull(transactionsTable.deletedAt),
      sql`${transactionsTable.status} <> 'void'`,
      gte(transactionsTable.date, from),
      lte(transactionsTable.date, to)
    ))
    .groupBy(transactionsTable.type);

  const income = parseFloat(rows.find(r => r.type === "income")?.total ?? "0");
  const expense = parseFloat(rows.find(r => r.type === "expense")?.total ?? "0");
  return { income, expense, savings: income - expense };
}

router.get("/dashboard/summary", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const [profile] = await db.select({ timezone: profileTable.timezone, weekStarts: profileTable.weekStarts })
    .from(profileTable).where(eq(profileTable.id, userId)).limit(1);
  const timeZone = profile?.timezone ?? "UTC";
  const weekStarts = profile?.weekStarts === "sunday" ? "sunday" : "monday";
  const [today, weekly, monthly, yearly] = await Promise.all([
    getPeriodStats(userId, "today", timeZone, weekStarts),
    getPeriodStats(userId, "weekly", timeZone, weekStarts),
    getPeriodStats(userId, "monthly", timeZone, weekStarts),
    getPeriodStats(userId, "yearly", timeZone, weekStarts),
  ]);

  const [{ total: totalIncome }] = await db.select({ total: sql<string>`coalesce(sum(amount), 0)` })
    .from(transactionsTable)
    .where(and(eq(transactionsTable.profileId, userId), eq(transactionsTable.type, "income")));
  const [{ total: totalExpense }] = await db.select({ total: sql<string>`coalesce(sum(amount), 0)` })
    .from(transactionsTable)
    .where(and(eq(transactionsTable.profileId, userId), eq(transactionsTable.type, "expense")));

  const [{ total: accountBalance }] = await db.select({
    total: sql<string>`coalesce(sum(${accountsTable.openingBalance}), 0) + coalesce((
      select sum(case when t.direction = 'credit' then t.amount else -t.amount end)
      from transactions t
      join accounts a on a.id = t.account_id
      where t.profile_id = ${userId} and t.deleted_at is null and t.status <> 'void'
        and a.include_in_net_worth = true and a.archived_at is null
    ), 0)`,
  }).from(accountsTable).where(and(eq(accountsTable.profileId, userId), eq(accountsTable.includeInNetWorth, true), isNull(accountsTable.archivedAt)));
  const balance = Number(accountBalance ?? 0);
  const currentMonthRange = periodRange("monthly", timeZone, weekStarts);
  const [{ total: balanceAtMonthStart }] = await db.select({
    total: sql<string>`coalesce(sum(${accountsTable.openingBalance}), 0) + coalesce((
      select sum(case when t.direction = 'credit' then t.amount else -t.amount end)
      from transactions t where t.profile_id = ${userId} and t.deleted_at is null
        and t.status <> 'void' and t.date < ${currentMonthRange.from}
        and t.account_id in (select id from accounts where profile_id = ${userId} and include_in_net_worth = true and archived_at is null)
    ), 0)`,
  }).from(accountsTable).where(and(eq(accountsTable.profileId, userId), eq(accountsTable.includeInNetWorth, true), isNull(accountsTable.archivedAt)));
  const openingNetWorth = Number(balanceAtMonthStart ?? 0);
  const balanceTrendPercent = openingNetWorth === 0 ? 0
    : Math.round(((balance - openingNetWorth) / Math.abs(openingNetWorth)) * 1000) / 10;
  const savingsRate = monthly.income > 0 ? (monthly.savings / monthly.income) * 100 : 0;

  // Budget health
  const budgets = await db.select().from(budgetsTable).where(eq(budgetsTable.profileId, userId));
  let budgetUsagePercent = 0;
  if (budgets.length > 0) {
    const monthRange = periodRange("monthly", timeZone, weekStarts);
    const [{ total: monthlyExp }] = await db.select({ total: sql<string>`coalesce(sum(amount), 0)` })
      .from(transactionsTable)
      .where(and(
        eq(transactionsTable.profileId, userId),
        eq(transactionsTable.type, "expense"),
        gte(transactionsTable.date, monthRange.from),
        lte(transactionsTable.date, monthRange.to)
      ));
    const totalBudget = budgets.reduce((s, b) => b.period === "monthly" && !b.category ? s + parseFloat(b.amount) : s, 0);
    budgetUsagePercent = totalBudget > 0 ? (parseFloat(monthlyExp ?? "0") / totalBudget) * 100 : 0;
  }

  // Health score: savings 0-40, budget adherence 0-30, positive balance 0-20, has data 0-10
  const savingsComponent = savingsRate >= 30 ? 40 : savingsRate >= 20 ? 35 : savingsRate >= 10 ? 25 : savingsRate * 1.5;
  const budgetComponent = budgets.length === 0 ? 25 : budgetUsagePercent < 70 ? 30 : budgetUsagePercent < 90 ? 20 : 10;
  const balanceComponent = balance > 0 ? 20 : 0;
  const dataComponent = (monthly.income > 0 || monthly.expense > 0) ? 10 : 0;
  const healthScore = Math.min(100, Math.max(0, Math.round(savingsComponent + budgetComponent + balanceComponent + dataComponent)));

  res.json({
    today, weekly, monthly, yearly,
    balance,
    savingsRate: Math.round(savingsRate * 10) / 10,
    budgetUsagePercent: Math.round(budgetUsagePercent * 10) / 10,
    financialHealthScore: healthScore,
    balanceTrendPercent,
    calculation: {
      balance: "Opening balances plus cleared and reconciled account ledger entries.",
      budgetUsage: "Monthly expenses divided only by non-overlapping overall monthly budgets.",
      healthScore: "Savings 40%, budget adherence 30%, positive net worth 20%, active data 10%.",
    },
  });
});

router.get("/dashboard/recent-transactions", requireAuth, async (req, res): Promise<void> => {
  const parsed = GetRecentTransactionsQueryParams.safeParse(req.query);
  const limit = (parsed.success ? parsed.data.limit : 10) ?? 10;

  const transactions = await db.select()
    .from(transactionsTable)
    .where(and(eq(transactionsTable.profileId, req.user!.userId), isNull(transactionsTable.deletedAt), sql`${transactionsTable.status} <> 'void'`))
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

  const reminders = await db.select()
    .from(remindersTable)
    .where(and(
      eq(remindersTable.profileId, req.user!.userId),
      gte(remindersTable.dueDate, today),
      eq(remindersTable.isCompleted, false)
    ))
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
