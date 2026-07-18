import { Router } from "express";
import { db, transactionsTable, categoriesTable } from "@workspace/db";
import { eq, and, gte, lte, ilike, sql, desc, asc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import {
  CreateTransactionBody,
  UpdateTransactionBody,
  GetTransactionParams,
  UpdateTransactionParams,
  DeleteTransactionParams,
  ListTransactionsQueryParams,
} from "@workspace/api-zod";

const router = Router();

function serializeTransaction(t: typeof transactionsTable.$inferSelect) {
  return {
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
  };
}

router.get("/transactions", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListTransactionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { type, category, dateFrom, dateTo, search, limit, offset, sortBy, sortOrder } = parsed.data;

  const conditions = [];
  if (type) conditions.push(eq(transactionsTable.type, type));
  if (category) conditions.push(eq(transactionsTable.category, category));
  if (dateFrom) conditions.push(gte(transactionsTable.date, dateFrom));
  if (dateTo) conditions.push(lte(transactionsTable.date, dateTo));
  if (search) conditions.push(ilike(transactionsTable.description, `%${search}%`));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const orderCol = sortBy === "amount" ? transactionsTable.amount
    : sortBy === "category" ? transactionsTable.category
    : transactionsTable.date;

  const orderFn = sortOrder === "asc" ? asc : desc;

  const [transactions, [{ count }]] = await Promise.all([
    db.select().from(transactionsTable)
      .where(whereClause)
      .orderBy(orderFn(orderCol), desc(transactionsTable.createdAt))
      .limit(limit ?? 50)
      .offset(offset ?? 0),
    db.select({ count: sql<number>`count(*)::int` }).from(transactionsTable).where(whereClause),
  ]);

  res.json({ data: transactions.map(serializeTransaction), total: count });
});

router.post("/transactions", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateTransactionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const [transaction] = await db.insert(transactionsTable).values({
    type: data.type,
    amount: String(data.amount),
    date: data.date,
    time: data.time ?? null,
    category: data.category ?? null,
    description: data.description ?? null,
    paymentMethod: data.paymentMethod ?? null,
    receipt: data.receipt ?? null,
    location: data.location ?? null,
    tags: data.tags ?? null,
    notes: data.notes ?? null,
    priority: data.priority ?? null,
    recurring: data.recurring ?? false,
    recurringFrequency: data.recurringFrequency ?? null,
    needOrWant: data.needOrWant ?? null,
    taxDeductible: data.taxDeductible ?? false,
  }).returning();

  // Auto-create category if new
  if (data.category) {
    await db.insert(categoriesTable)
      .values({ name: data.category, type: data.type === "income" ? "income" : "expense", usageCount: 1 })
      .onConflictDoUpdate({ target: categoriesTable.name, set: { usageCount: sql`${categoriesTable.usageCount} + 1` } });
  }

  res.status(201).json(serializeTransaction(transaction));
});

router.get("/transactions/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetTransactionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [transaction] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, params.data.id));
  if (!transaction) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }

  res.json(serializeTransaction(transaction));
});

router.patch("/transactions/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateTransactionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateTransactionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const updates: Record<string, unknown> = {};
  if (data.type != null) updates.type = data.type;
  if (data.amount != null) updates.amount = String(data.amount);
  if (data.date != null) updates.date = data.date;
  if (data.time != null) updates.time = data.time;
  if (data.category != null) updates.category = data.category;
  if (data.description != null) updates.description = data.description;
  if (data.paymentMethod != null) updates.paymentMethod = data.paymentMethod;
  if (data.receipt != null) updates.receipt = data.receipt;
  if (data.location != null) updates.location = data.location;
  if (data.tags != null) updates.tags = data.tags;
  if (data.notes != null) updates.notes = data.notes;
  if (data.priority != null) updates.priority = data.priority;
  if (data.recurring != null) updates.recurring = data.recurring;
  if (data.recurringFrequency != null) updates.recurringFrequency = data.recurringFrequency;
  if (data.needOrWant != null) updates.needOrWant = data.needOrWant;
  if (data.taxDeductible != null) updates.taxDeductible = data.taxDeductible;

  const [transaction] = await db.update(transactionsTable).set(updates).where(eq(transactionsTable.id, params.data.id)).returning();
  if (!transaction) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }

  res.json(serializeTransaction(transaction));
});

router.delete("/transactions/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteTransactionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db.delete(transactionsTable).where(eq(transactionsTable.id, params.data.id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
