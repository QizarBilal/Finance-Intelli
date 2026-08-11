import { Router } from "express";
import { db, budgetsTable, transactionsTable, profileTable } from "@workspace/db";
import { eq, and, gte, lte, sql, isNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import {
  CreateBudgetBody, UpdateBudgetBody,
  GetBudgetParams, UpdateBudgetParams, DeleteBudgetParams,
} from "@workspace/api-zod";
import { periodRange } from "../lib/dates";

const router = Router();

function budgetRange(budget: typeof budgetsTable.$inferSelect, timezone = "UTC", weekStarts: "monday" | "sunday" = "monday") {
  let dateFrom: string, dateTo: string;

  if (budget.period === "custom" && budget.startDate && budget.endDate) {
    dateFrom = budget.startDate; dateTo = budget.endDate;
  } else if (budget.period === "daily") {
    ({ from: dateFrom, to: dateTo } = periodRange("today", timezone, weekStarts));
  } else if (budget.period === "weekly") {
    ({ from: dateFrom, to: dateTo } = periodRange("weekly", timezone, weekStarts));
  } else if (budget.period === "yearly") {
    ({ from: dateFrom, to: dateTo } = periodRange("yearly", timezone, weekStarts));
  } else {
    ({ from: dateFrom, to: dateTo } = periodRange("monthly", timezone, weekStarts));
  }
  return { dateFrom, dateTo };
}

async function computeSpent(budget: typeof budgetsTable.$inferSelect, userId: number, timezone = "UTC", weekStarts: "monday" | "sunday" = "monday"): Promise<number> {
  const { dateFrom, dateTo } = budgetRange(budget, timezone, weekStarts);
  const conditions: any[] = [
    eq(transactionsTable.profileId, userId),
    eq(transactionsTable.type, "expense"),
    gte(transactionsTable.date, dateFrom),
    lte(transactionsTable.date, dateTo),
    isNull(transactionsTable.deletedAt),
    sql`${transactionsTable.status} <> 'void'`,
  ];
  if (budget.category) conditions.push(sql`lower(trim(coalesce(${transactionsTable.category}, ''))) = lower(trim(${budget.category}))`);

  const [{ total }] = await db.select({ total: sql<string>`coalesce(sum(amount), 0)` })
    .from(transactionsTable).where(and(...conditions));
  return parseFloat(total ?? "0");
}

function serializeBudget(b: typeof budgetsTable.$inferSelect, spent: number) {
  return {
    id: b.id, name: b.name, amount: parseFloat(b.amount), spent,
    period: b.period, category: b.category, color: b.color,
    startDate: b.startDate, endDate: b.endDate,
    alertThreshold: b.alertThreshold != null ? parseFloat(b.alertThreshold) : null,
    createdAt: b.createdAt.toISOString(),
  };
}

router.get("/budgets", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const [profile, budgets] = await Promise.all([
    db.select({ timezone: profileTable.timezone, weekStarts: profileTable.weekStarts }).from(profileTable).where(eq(profileTable.id, userId)).limit(1),
    db.select().from(budgetsTable).where(and(eq(budgetsTable.profileId, userId), isNull(budgetsTable.archivedAt))).orderBy(budgetsTable.createdAt),
  ]);
  if (budgets.length === 0) { res.json([]); return; }
  const timezone = profile[0]?.timezone ?? "UTC";
  const weekStarts = profile[0]?.weekStarts === "sunday" ? "sunday" : "monday";
  const ranges = budgets.map(budget => budgetRange(budget, timezone, weekStarts));
  const minDate = ranges.reduce((min, range) => range.dateFrom < min ? range.dateFrom : min, ranges[0].dateFrom);
  const maxDate = ranges.reduce((max, range) => range.dateTo > max ? range.dateTo : max, ranges[0].dateTo);
  const spendRows = await db.select({
    date: transactionsTable.date, category: transactionsTable.category,
    amount: sql<string>`sum(${transactionsTable.amount})`,
  }).from(transactionsTable).where(and(
    eq(transactionsTable.profileId, userId), eq(transactionsTable.type, "expense"),
    gte(transactionsTable.date, minDate), lte(transactionsTable.date, maxDate),
    isNull(transactionsTable.deletedAt), sql`${transactionsTable.status} <> 'void'`,
  )).groupBy(transactionsTable.date, transactionsTable.category);
  const results = budgets.map((budget, index) => {
    const range = ranges[index];
    // Older UI versions did not expose a category field, so category budgets
    // were commonly saved with only a matching name (for example "Snack").
    // Infer that link at read time to preserve the stored records unchanged.
    const inferredCategory = budget.category ?? spendRows.find(row =>
      (row.category ?? '').trim().toLocaleLowerCase() === budget.name.trim().toLocaleLowerCase())?.category ?? null;
    const effectiveBudget = { ...budget, category: inferredCategory };
    const spent = spendRows.reduce((sum, row) => row.date >= range.dateFrom && row.date <= range.dateTo &&
      (!inferredCategory || inferredCategory.trim().toLocaleLowerCase() === (row.category ?? '').trim().toLocaleLowerCase()) ? sum + Number(row.amount) : sum, 0);
    return serializeBudget(effectiveBudget, spent);
  });
  res.json(results);
});

router.post("/budgets", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateBudgetBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const userId = req.user!.userId;
  const data = parsed.data;
  const [budget] = await db.insert(budgetsTable).values({
    profileId: userId,
    name: data.name, amount: String(data.amount), period: data.period,
    category: data.category ?? null, color: data.color ?? null,
    startDate: data.startDate ?? null, endDate: data.endDate ?? null,
    alertThreshold: data.alertThreshold != null ? String(data.alertThreshold) : null,
  }).returning();
  res.status(201).json(serializeBudget(budget, await computeSpent(budget, userId)));
});

router.get("/budgets/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetBudgetParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const userId = req.user!.userId;
  const [budget] = await db.select().from(budgetsTable)
    .where(and(eq(budgetsTable.id, params.data.id), eq(budgetsTable.profileId, userId)));
  if (!budget) { res.status(404).json({ error: "Budget not found" }); return; }
  res.json(serializeBudget(budget, await computeSpent(budget, userId)));
});

router.patch("/budgets/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateBudgetParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateBudgetBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const userId = req.user!.userId;
  const data = parsed.data;
  const updates: Record<string, unknown> = {};
  if (data.name != null) updates.name = data.name;
  if (data.amount != null) updates.amount = String(data.amount);
  if (data.period != null) updates.period = data.period;
  if (data.category != null) updates.category = data.category;
  if (data.color != null) updates.color = data.color;
  if (data.startDate != null) updates.startDate = data.startDate;
  if (data.endDate != null) updates.endDate = data.endDate;
  if (data.alertThreshold != null) updates.alertThreshold = String(data.alertThreshold);

  const [budget] = await db.update(budgetsTable).set(updates)
    .where(and(eq(budgetsTable.id, params.data.id), eq(budgetsTable.profileId, userId))).returning();
  if (!budget) { res.status(404).json({ error: "Budget not found" }); return; }
  res.json(serializeBudget(budget, await computeSpent(budget, userId)));
});

router.delete("/budgets/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteBudgetParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [deleted] = await db.delete(budgetsTable)
    .where(and(eq(budgetsTable.id, params.data.id), eq(budgetsTable.profileId, req.user!.userId))).returning();
  if (!deleted) { res.status(404).json({ error: "Budget not found" }); return; }
  res.sendStatus(204);
});

export default router;
