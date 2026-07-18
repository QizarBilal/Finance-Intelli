import { Router } from "express";
import { db, budgetsTable, transactionsTable } from "@workspace/db";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import {
  CreateBudgetBody,
  UpdateBudgetBody,
  GetBudgetParams,
  UpdateBudgetParams,
  DeleteBudgetParams,
} from "@workspace/api-zod";

const router = Router();

async function computeSpent(budget: typeof budgetsTable.$inferSelect): Promise<number> {
  const now = new Date();
  let dateFrom: string;
  let dateTo: string;

  if (budget.period === "custom" && budget.startDate && budget.endDate) {
    dateFrom = budget.startDate;
    dateTo = budget.endDate;
  } else if (budget.period === "daily") {
    dateFrom = dateTo = now.toISOString().slice(0, 10);
  } else if (budget.period === "weekly") {
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((day + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    dateFrom = monday.toISOString().slice(0, 10);
    dateTo = sunday.toISOString().slice(0, 10);
  } else if (budget.period === "yearly") {
    dateFrom = `${now.getFullYear()}-01-01`;
    dateTo = `${now.getFullYear()}-12-31`;
  } else {
    // monthly (default)
    dateFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    dateTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${lastDay}`;
  }

  const conditions = [
    eq(transactionsTable.type, "expense"),
    gte(transactionsTable.date, dateFrom),
    lte(transactionsTable.date, dateTo),
  ];
  if (budget.category) {
    conditions.push(eq(transactionsTable.category, budget.category));
  }

  const [{ total }] = await db.select({ total: sql<string>`coalesce(sum(amount), 0)` })
    .from(transactionsTable)
    .where(and(...conditions));

  return parseFloat(total ?? "0");
}

function serializeBudget(b: typeof budgetsTable.$inferSelect, spent: number) {
  return {
    id: b.id,
    name: b.name,
    amount: parseFloat(b.amount),
    spent,
    period: b.period,
    category: b.category,
    color: b.color,
    startDate: b.startDate,
    endDate: b.endDate,
    alertThreshold: b.alertThreshold != null ? parseFloat(b.alertThreshold) : null,
    createdAt: b.createdAt.toISOString(),
  };
}

router.get("/budgets", requireAuth, async (_req, res): Promise<void> => {
  const budgets = await db.select().from(budgetsTable).orderBy(budgetsTable.createdAt);
  const results = await Promise.all(budgets.map(async (b) => serializeBudget(b, await computeSpent(b))));
  res.json(results);
});

router.post("/budgets", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateBudgetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const [budget] = await db.insert(budgetsTable).values({
    name: data.name,
    amount: String(data.amount),
    period: data.period,
    category: data.category ?? null,
    color: data.color ?? null,
    startDate: data.startDate ?? null,
    endDate: data.endDate ?? null,
    alertThreshold: data.alertThreshold != null ? String(data.alertThreshold) : null,
  }).returning();

  res.status(201).json(serializeBudget(budget, await computeSpent(budget)));
});

router.get("/budgets/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetBudgetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [budget] = await db.select().from(budgetsTable).where(eq(budgetsTable.id, params.data.id));
  if (!budget) {
    res.status(404).json({ error: "Budget not found" });
    return;
  }

  res.json(serializeBudget(budget, await computeSpent(budget)));
});

router.patch("/budgets/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateBudgetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateBudgetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

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

  const [budget] = await db.update(budgetsTable).set(updates).where(eq(budgetsTable.id, params.data.id)).returning();
  if (!budget) {
    res.status(404).json({ error: "Budget not found" });
    return;
  }

  res.json(serializeBudget(budget, await computeSpent(budget)));
});

router.delete("/budgets/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteBudgetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db.delete(budgetsTable).where(eq(budgetsTable.id, params.data.id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Budget not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
