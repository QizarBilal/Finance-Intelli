import { Router } from "express";
import { db, transactionsTable } from "@workspace/db";
import { eq, and, gte, lte, sql, isNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { GetAnalyticsTrendsQueryParams, GetAnalyticsCategoriesQueryParams, GetAnalyticsCalendarQueryParams } from "@workspace/api-zod";

const router = Router();

function getPeriodDates(period: string): { from: string; to: string } {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  switch (period) {
    case "7d": { const f = new Date(now); f.setDate(now.getDate() - 6); return { from: f.toISOString().slice(0, 10), to: today }; }
    case "90d": { const f = new Date(now); f.setDate(now.getDate() - 89); return { from: f.toISOString().slice(0, 10), to: today }; }
    case "12m": { const f = new Date(now); f.setFullYear(now.getFullYear() - 1); return { from: f.toISOString().slice(0, 10), to: today }; }
    case "ytd": return { from: `${now.getFullYear()}-01-01`, to: today };
    default: { const f = new Date(now); f.setDate(now.getDate() - 29); return { from: f.toISOString().slice(0, 10), to: today }; }
  }
}

router.get("/analytics/trends", requireAuth, async (req, res): Promise<void> => {
  const parsed = GetAnalyticsTrendsQueryParams.safeParse(req.query);
  const period = (parsed.success ? parsed.data.period : "30d") ?? "30d";
  const groupBy = (parsed.success ? parsed.data.groupBy : "day") ?? "day";
  const userId = req.user!.userId;
  const { from, to } = getPeriodDates(period);

  const truncUnit = groupBy === "month" ? sql.raw("'month'") : groupBy === "week" ? sql.raw("'week'") : sql.raw("'day'");
  const truncExpr = sql<string>`date_trunc(${truncUnit}, ${transactionsTable.date}::timestamp)::date`;

  const rows = await db.select({
    date: truncExpr,
    type: transactionsTable.type,
    total: sql<string>`coalesce(sum(${transactionsTable.amount}), 0)`,
  })
    .from(transactionsTable)
    .where(and(eq(transactionsTable.profileId, userId), gte(transactionsTable.date, from), lte(transactionsTable.date, to), isNull(transactionsTable.deletedAt), sql`${transactionsTable.status} <> 'void'`))
    .groupBy(truncExpr, transactionsTable.type)
    .orderBy(truncExpr);

  const map = new Map<string, { income: number; expense: number }>();
  for (const row of rows) {
    const dateStr = typeof row.date === "string" ? row.date.slice(0, 10) : (row.date as unknown as Date).toISOString().slice(0, 10);
    if (!map.has(dateStr)) map.set(dateStr, { income: 0, expense: 0 });
    const entry = map.get(dateStr)!;
    if (row.type === "income") entry.income = parseFloat(row.total);
    else if (row.type === "expense") entry.expense = parseFloat(row.total);
  }

  res.json(Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, { income, expense }]) => ({
    date, income, expense, savings: income - expense,
  })));
});

router.get("/analytics/categories", requireAuth, async (req, res): Promise<void> => {
  const parsed = GetAnalyticsCategoriesQueryParams.safeParse(req.query);
  const period = (parsed.success ? parsed.data.period : "30d") ?? "30d";
  const type = (parsed.success ? parsed.data.type : "expense") ?? "expense";
  const userId = req.user!.userId;
  const { from, to } = getPeriodDates(period);

  const rows = await db.select({
    category: transactionsTable.category,
    total: sql<string>`coalesce(sum(${transactionsTable.amount}), 0)`,
    count: sql<number>`count(*)::int`,
  })
    .from(transactionsTable)
    .where(and(eq(transactionsTable.profileId, userId), eq(transactionsTable.type, type), gte(transactionsTable.date, from), lte(transactionsTable.date, to), isNull(transactionsTable.deletedAt), sql`${transactionsTable.status} <> 'void'`))
    .groupBy(transactionsTable.category)
    .orderBy(sql`sum(${transactionsTable.amount}) desc`);

  const totalAmount = rows.reduce((s, r) => s + parseFloat(r.total), 0);
  res.json(rows.map(r => ({
    category: r.category ?? "Uncategorized",
    amount: parseFloat(r.total),
    percentage: totalAmount > 0 ? Math.round((parseFloat(r.total) / totalAmount) * 1000) / 10 : 0,
    count: r.count,
  })));
});

router.get("/analytics/calendar", requireAuth, async (req, res): Promise<void> => {
  const parsed = GetAnalyticsCalendarQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { year, month } = parsed.data;
  const userId = req.user!.userId;
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;

  const rows = await db.select({
    date: transactionsTable.date,
    type: transactionsTable.type,
    total: sql<string>`coalesce(sum(${transactionsTable.amount}), 0)`,
    count: sql<number>`count(*)::int`,
  })
    .from(transactionsTable)
    .where(and(eq(transactionsTable.profileId, userId), gte(transactionsTable.date, from), lte(transactionsTable.date, to), isNull(transactionsTable.deletedAt), sql`${transactionsTable.status} <> 'void'`))
    .groupBy(transactionsTable.date, transactionsTable.type)
    .orderBy(transactionsTable.date);

  const map = new Map<string, { income: number; expense: number; count: number }>();
  for (const row of rows) {
    if (!map.has(row.date)) map.set(row.date, { income: 0, expense: 0, count: 0 });
    const entry = map.get(row.date)!;
    if (row.type === "income") entry.income = parseFloat(row.total);
    else if (row.type === "expense") entry.expense = parseFloat(row.total);
    entry.count += row.count;
  }

  res.json(Array.from(map.entries()).map(([date, { income, expense, count }]) => ({
    date, income, expense, savings: income - expense, transactionCount: count,
  })));
});

router.get("/analytics/heatmap", requireAuth, async (req, res): Promise<void> => {
  const now = new Date();
  const from = new Date(now); from.setFullYear(now.getFullYear() - 1);
  const userId = req.user!.userId;

  const rows = await db.select({
    date: transactionsTable.date,
    total: sql<string>`coalesce(sum(${transactionsTable.amount}), 0)`,
  })
    .from(transactionsTable)
    .where(and(eq(transactionsTable.profileId, userId), eq(transactionsTable.type, "expense"), gte(transactionsTable.date, from.toISOString().slice(0, 10)), isNull(transactionsTable.deletedAt), sql`${transactionsTable.status} <> 'void'`))
    .groupBy(transactionsTable.date).orderBy(transactionsTable.date);

  res.json(rows.map(r => ({ date: r.date, amount: parseFloat(r.total) })));
});

export default router;
