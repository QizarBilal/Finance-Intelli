import { Router } from "express";
import {
  collections,
  getCollection,
  nextId,
  withoutMongoId,
  withoutMongoIds,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import {
  CreateTransactionBody,
  UpdateTransactionBody,
  GetTransactionParams,
  UpdateTransactionParams,
  DeleteTransactionParams,
  ListTransactionsQueryParams,
} from "@workspace/api-zod";
import { ensureDefaultAccount } from "../lib/accounts";
import { writeAudit } from "../lib/audit";

const router = Router();
const active = { $in: [null, undefined] };

async function upsertTransactionCategory(
  userId: number,
  name: string,
  transactionType: string,
  incrementUsage: boolean,
) {
  const trimmedName = name.trim();
  if (!trimmedName) return null;
  const categories = await getCollection(collections.categories);
  const normalizedName = trimmedName.toLocaleLowerCase();
  const type = transactionType === "income" ? "income" : "expense";
  const existing = await categories.findOne({
    profileId: userId,
    normalizedName,
    type,
  });
  if (existing?.id) {
    await categories.updateOne(
      { id: existing.id },
      {
        $set: { name: trimmedName, updatedAt: new Date() },
        ...(incrementUsage ? { $inc: { usageCount: 1 } } : {}),
      },
    );
    return existing.id;
  }
  const now = new Date();
  const category = {
    id: await nextId(collections.categories),
    profileId: userId,
    name: trimmedName,
    normalizedName,
    type,
    usageCount: incrementUsage ? 1 : 0,
    color: "#6366f1",
    icon: "Tag",
    createdAt: now,
    updatedAt: now,
  };
  await categories.insertOne(category);
  return category.id;
}

function serializeTransaction(t: any) {
  return {
    ...t,
    _id: undefined,
    amount: Number(t.amount),
    createdAt: new Date(t.createdAt).toISOString(),
  };
}

router.get("/transactions", requireAuth, async (req, res) => {
  const parsed = ListTransactionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const {
    type,
    category,
    dateFrom,
    dateTo,
    search,
    limit,
    offset,
    sortBy,
    sortOrder,
  } = parsed.data;
  const filter: any = { profileId: req.user!.userId, deletedAt: active };
  if (type) filter.type = type;
  if (category) filter.category = category;
  if (dateFrom || dateTo)
    filter.date = {
      ...(dateFrom ? { $gte: dateFrom } : {}),
      ...(dateTo ? { $lte: dateTo } : {}),
    };
  if (search)
    filter.$or = ["description", "merchant", "category"].map((field) => ({
      [field]: {
        $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        $options: "i",
      },
    }));
  const transactions = await getCollection(collections.transactions);
  const sortField =
    sortBy === "amount"
      ? "amount"
      : sortBy === "category"
        ? "category"
        : "date";
  const [rows, total] = await Promise.all([
    transactions
      .find(filter)
      .sort({ [sortField]: sortOrder === "asc" ? 1 : -1, createdAt: -1 })
      .skip(offset ?? 0)
      .limit(limit ?? 50)
      .toArray(),
    transactions.countDocuments(filter),
  ]);
  res.json({ data: withoutMongoIds(rows).map(serializeTransaction), total });
});

router.post("/transactions", requireAuth, async (req, res) => {
  const parsed = CreateTransactionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = req.user!.userId;
  const data = parsed.data;
  const requested = Number(req.body?.accountId);
  const accountId =
    Number.isInteger(requested) && requested > 0
      ? requested
      : await ensureDefaultAccount(userId);
  const accounts = await getCollection(collections.accounts);
  if (!(await accounts.findOne({ id: accountId, profileId: userId }))) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  const categoryId = data.category
    ? await upsertTransactionCategory(userId, data.category, data.type, true)
    : null;
  const transactions = await getCollection(collections.transactions);
  const now = new Date();
  const transaction: any = {
    id: await nextId(collections.transactions),
    profileId: userId,
    accountId,
    categoryId,
    transferGroupId: null,
    type: data.type,
    direction: data.type === "income" ? "credit" : "debit",
    amount: Number(data.amount),
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
    status: ["pending", "cleared"].includes(req.body?.status)
      ? req.body.status
      : "cleared",
    merchant:
      typeof req.body?.merchant === "string"
        ? req.body.merchant.trim() || null
        : null,
    version: 1,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await transactions.insertOne(transaction);
  await writeAudit(
    req,
    "create",
    "transaction",
    transaction.id,
    null,
    transaction,
  );
  res.status(201).json(serializeTransaction(transaction));
});

router.get("/transactions/:id", requireAuth, async (req, res) => {
  const params = GetTransactionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const transactions = await getCollection(collections.transactions);
  const transaction = withoutMongoId(
    await transactions.findOne({
      id: params.data.id,
      profileId: req.user!.userId,
      deletedAt: active,
    }),
  );
  if (!transaction) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }
  res.json(serializeTransaction(transaction));
});

router.patch("/transactions/:id", requireAuth, async (req, res) => {
  const params = UpdateTransactionParams.safeParse(req.params);
  const parsed = UpdateTransactionBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const transactions = await getCollection(collections.transactions);
  const filter = {
    id: params.data.id,
    profileId: req.user!.userId,
    deletedAt: active,
  };
  const before: any = withoutMongoId(await transactions.findOne(filter));
  if (!before) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }
  if (
    req.body?.version != null &&
    Number(req.body.version) !== before.version
  ) {
    res
      .status(409)
      .json({
        error: "This transaction changed elsewhere. Refresh and retry.",
      });
    return;
  }
  const data: any = parsed.data;
  const updates: any = { updatedAt: new Date() };
  for (const key of [
    "amount",
    "date",
    "time",
    "category",
    "description",
    "paymentMethod",
    "receipt",
    "location",
    "tags",
    "notes",
    "priority",
    "recurring",
    "recurringFrequency",
    "needOrWant",
    "taxDeductible",
  ] as const)
    if (Object.prototype.hasOwnProperty.call(req.body, key))
      updates[key] = key === "amount" ? Number(data[key]) : (data[key] ?? null);
  if (data.type != null) {
    updates.type = data.type;
    updates.direction = data.type === "income" ? "credit" : "debit";
  }
  if (
    req.body?.status != null &&
    ["pending", "cleared", "reconciled", "void"].includes(req.body.status)
  )
    updates.status = req.body.status;
  if (Object.prototype.hasOwnProperty.call(req.body, "merchant"))
    updates.merchant = req.body.merchant || null;
  if (
    Object.prototype.hasOwnProperty.call(req.body, "category") ||
    data.type != null
  ) {
    const nextCategory = Object.prototype.hasOwnProperty.call(
      req.body,
      "category",
    )
      ? data.category
      : before.category;
    updates.categoryId = nextCategory
      ? await upsertTransactionCategory(
          req.user!.userId,
          nextCategory,
          data.type ?? before.type,
          false,
        )
      : null;
  }
  const updated = await transactions.findOneAndUpdate(
    filter,
    { $set: updates, $inc: { version: 1 } },
    { returnDocument: "after" },
  );
  const transaction: any = withoutMongoId(updated);
  await writeAudit(
    req,
    "update",
    "transaction",
    transaction.id,
    before,
    transaction,
  );
  res.json(serializeTransaction(transaction));
});

router.delete("/transactions/:id", requireAuth, async (req, res) => {
  const params = DeleteTransactionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const transactions = await getCollection(collections.transactions);
  const deleted: any = withoutMongoId(
    await transactions.findOneAndUpdate(
      { id: params.data.id, profileId: req.user!.userId, deletedAt: active },
      {
        $set: { deletedAt: new Date(), updatedAt: new Date() },
        $inc: { version: 1 },
      },
      { returnDocument: "after" },
    ),
  );
  if (!deleted) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }
  await writeAudit(
    req,
    "soft_delete",
    "transaction",
    deleted.id,
    deleted,
    null,
  );
  res.sendStatus(204);
});

export default router;
