import { Router } from "express";
import { db, transactionsTable, categoriesTable } from "@workspace/db";
import { eq, and, gte, lte, ilike, sql, desc, asc, isNull, or } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import {
  CreateTransactionBody, UpdateTransactionBody,
  GetTransactionParams, UpdateTransactionParams, DeleteTransactionParams,
  ListTransactionsQueryParams,
} from "@workspace/api-zod";
import { ensureDefaultAccount } from "../lib/accounts";
import { writeAudit } from "../lib/audit";

const router = Router();

async function upsertTransactionCategory(userId: number, name: string, transactionType: string, incrementUsage: boolean) {
  const trimmedName = name.trim();
  if (!trimmedName) return null;
  const normalizedName = trimmedName.toLocaleLowerCase();
  const categoryType = transactionType === "income" ? "income" : "expense";
  const [category] = await db.insert(categoriesTable).values({
    profileId: userId, name: trimmedName, normalizedName, type: categoryType,
    usageCount: incrementUsage ? 1 : 0,
  }).onConflictDoUpdate({
    target: [categoriesTable.profileId, categoriesTable.normalizedName, categoriesTable.type],
    set: {
      name: trimmedName,
      ...(incrementUsage ? { usageCount: sql`${categoriesTable.usageCount} + 1` } : {}),
    },
  }).returning({ id: categoriesTable.id });
  return category.id;
}

function serializeTransaction(t: typeof transactionsTable.$inferSelect) {
  return {
    id: t.id,
    accountId: t.accountId,
    categoryId: t.categoryId,
    transferGroupId: t.transferGroupId,
    type: t.type,
    direction: t.direction,
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
    status: t.status,
    merchant: t.merchant,
    version: t.version,
    createdAt: t.createdAt.toISOString(),
  };
}

router.get("/transactions", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListTransactionsQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { type, category, dateFrom, dateTo, search, limit, offset, sortBy, sortOrder } = parsed.data;
  const userId = req.user!.userId;

  const conditions: any[] = [eq(transactionsTable.profileId, userId), isNull(transactionsTable.deletedAt)];
  if (type) conditions.push(eq(transactionsTable.type, type));
  if (category) conditions.push(eq(transactionsTable.category, category));
  if (dateFrom) conditions.push(gte(transactionsTable.date, dateFrom));
  if (dateTo) conditions.push(lte(transactionsTable.date, dateTo));
  if (search) conditions.push(or(
    ilike(transactionsTable.description, `%${search}%`),
    ilike(transactionsTable.merchant, `%${search}%`),
    ilike(transactionsTable.category, `%${search}%`),
  ));

  const whereClause = and(...conditions);
  const orderCol = sortBy === "amount" ? transactionsTable.amount
    : sortBy === "category" ? transactionsTable.category
    : transactionsTable.date;
  const orderFn = sortOrder === "asc" ? asc : desc;

  const [transactions, [{ count }]] = await Promise.all([
    db.select().from(transactionsTable).where(whereClause)
      .orderBy(orderFn(orderCol), desc(transactionsTable.createdAt))
      .limit(limit ?? 50).offset(offset ?? 0),
    db.select({ count: sql<number>`count(*)::int` }).from(transactionsTable).where(whereClause),
  ]);

  res.json({ data: transactions.map(serializeTransaction), total: count });
});

router.post("/transactions", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateTransactionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const userId = req.user!.userId;
  const data = parsed.data;
  const requestedAccountId = Number(req.body?.accountId);
  const accountId = Number.isInteger(requestedAccountId) && requestedAccountId > 0
    ? requestedAccountId : await ensureDefaultAccount(userId);
  const [ownedAccount] = await db.query.accountsTable.findMany({
    where: (account, { and: qAnd, eq: qEq }) => qAnd(qEq(account.id, accountId), qEq(account.profileId, userId)),
    limit: 1,
  });
  if (!ownedAccount) { res.status(404).json({ error: "Account not found" }); return; }
  const categoryId = data.category ? await upsertTransactionCategory(userId, data.category, data.type, true) : null;
  const [transaction] = await db.insert(transactionsTable).values({
    profileId: userId,
    accountId,
    categoryId,
    type: data.type,
    direction: data.type === "income" ? "credit" : "debit",
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
    status: ["pending", "cleared"].includes(req.body?.status) ? req.body.status : "cleared",
    merchant: typeof req.body?.merchant === "string" ? req.body.merchant.trim() || null : null,
  }).returning();

  await writeAudit(req, "create", "transaction", transaction.id, null, transaction);
  res.status(201).json(serializeTransaction(transaction));
});

router.get("/transactions/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetTransactionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [transaction] = await db.select().from(transactionsTable)
    .where(and(eq(transactionsTable.id, params.data.id), eq(transactionsTable.profileId, req.user!.userId), isNull(transactionsTable.deletedAt)));
  if (!transaction) { res.status(404).json({ error: "Transaction not found" }); return; }
  res.json(serializeTransaction(transaction));
});

router.patch("/transactions/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateTransactionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = UpdateTransactionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const data = parsed.data;
  const [before] = await db.select().from(transactionsTable)
    .where(and(eq(transactionsTable.id, params.data.id), eq(transactionsTable.profileId, req.user!.userId), isNull(transactionsTable.deletedAt))).limit(1);
  if (!before) { res.status(404).json({ error: "Transaction not found" }); return; }
  if (req.body?.version != null && Number(req.body.version) !== before.version) {
    res.status(409).json({ error: "This transaction changed elsewhere. Refresh and retry." }); return;
  }
  const updates: Record<string, unknown> = {};
  if (data.type != null) {
    updates.type = data.type;
    updates.direction = data.type === "income" ? "credit" : "debit";
  }
  if (data.amount != null) updates.amount = String(data.amount);
  if (data.date != null) updates.date = data.date;
  if (data.time != null) updates.time = data.time;
  if (Object.prototype.hasOwnProperty.call(req.body, "category")) updates.category = data.category ?? null;
  if (data.description != null) updates.description = data.description;
  if (data.paymentMethod != null) updates.paymentMethod = data.paymentMethod;
  if (data.receipt != null) updates.receipt = data.receipt;
  if (data.location != null) updates.location = data.location;
  if (data.tags != null) updates.tags = data.tags;
  if (data.notes != null) updates.notes = data.notes;
  if (data.priority != null) updates.priority = data.priority;
  if (data.recurring != null) updates.recurring = data.recurring;
  if (Object.prototype.hasOwnProperty.call(req.body, "recurringFrequency")) updates.recurringFrequency = data.recurringFrequency ?? null;
  if (Object.prototype.hasOwnProperty.call(req.body, "needOrWant")) updates.needOrWant = data.needOrWant ?? null;
  if (data.taxDeductible != null) updates.taxDeductible = data.taxDeductible;
  if (req.body?.status != null && ["pending", "cleared", "reconciled", "void"].includes(req.body.status)) updates.status = req.body.status;
  if (Object.prototype.hasOwnProperty.call(req.body, "merchant")) updates.merchant = req.body.merchant || null;
  if (Object.prototype.hasOwnProperty.call(req.body, "category") || data.type != null) {
    const nextCategory = Object.prototype.hasOwnProperty.call(req.body, "category") ? data.category : before.category;
    const nextType = data.type ?? before.type;
    updates.categoryId = nextCategory ? await upsertTransactionCategory(req.user!.userId, nextCategory, nextType, false) : null;
  }
  updates.version = sql`${transactionsTable.version} + 1`;

  const [transaction] = await db.update(transactionsTable).set(updates)
    .where(and(eq(transactionsTable.id, params.data.id), eq(transactionsTable.profileId, req.user!.userId), isNull(transactionsTable.deletedAt)))
    .returning();
  if (!transaction) { res.status(404).json({ error: "Transaction not found" }); return; }
  await writeAudit(req, "update", "transaction", transaction.id, before, transaction);
  res.json(serializeTransaction(transaction));
});

router.delete("/transactions/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteTransactionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [deleted] = await db.update(transactionsTable)
    .set({ deletedAt: new Date(), version: sql`${transactionsTable.version} + 1` })
    .where(and(eq(transactionsTable.id, params.data.id), eq(transactionsTable.profileId, req.user!.userId), isNull(transactionsTable.deletedAt)))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Transaction not found" }); return; }
  await writeAudit(req, "soft_delete", "transaction", deleted.id, deleted, null);
  res.sendStatus(204);
});

export default router;
