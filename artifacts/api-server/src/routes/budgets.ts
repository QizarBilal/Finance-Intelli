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
  CreateBudgetBody,
  UpdateBudgetBody,
  GetBudgetParams,
  UpdateBudgetParams,
  DeleteBudgetParams,
} from "@workspace/api-zod";
import { periodRange } from "../lib/dates";
import { resolveBudgetCategory } from "../lib/budgeting";
const router = Router(),
  active = { $in: [null, undefined] };
function range(b: any, tz = "UTC", ws: "monday" | "sunday" = "monday") {
  if (b.period === "custom" && b.startDate && b.endDate)
    return { dateFrom: b.startDate, dateTo: b.endDate };
  const p =
    b.period === "daily"
      ? "today"
      : b.period === "weekly"
        ? "weekly"
        : b.period === "yearly"
          ? "yearly"
          : "monthly";
  const r = periodRange(p, tz, ws);
  return { dateFrom: r.from, dateTo: r.to };
}
async function spent(
  b: any,
  userId: number,
  tz = "UTC",
  ws: "monday" | "sunday" = "monday",
) {
  const r = range(b, tz, ws),
    t = await getCollection(collections.transactions),
    accounts: any[] = await (await getCollection(collections.accounts)).find({ profileId: userId }).toArray(),
    currencySet = new Set(accounts.map(account => account.currency ?? "INR")),
    currency = b.currency ?? (currencySet.size === 1 ? [...currencySet][0] as string : null),
    accountsByCurrency = new Map<string, number[]>(accounts.reduce((map, account) => {
      const key = account.currency ?? "INR";
      map.set(key, [...(map.get(key) ?? []), account.id]);
      return map;
    }, new Map<string, number[]>())),
    f: any = {
      profileId: userId,
      type: "expense",
      date: { $gte: r.dateFrom, $lte: r.dateTo },
      deletedAt: active,
      status: { $ne: "void" },
    };
  const selectedAccounts = currency ? accountsByCurrency.get(currency) ?? [] : accounts.map(account => account.id);
  f.accountId = { $in: selectedAccounts };
  if (b.category)
    f.category = {
      $regex: `^${String(b.category)
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
      $options: "i",
    };
  const x = await t.aggregate<any>([
      { $match: f },
      { $group: { _id: currency ? null : "$accountId", total: { $sum: "$amount" } } },
    ])
    .toArray();
  if (currency) return { currency, spent: Number(x[0]?.total ?? 0), spentByCurrency: [{ currency, amount: Number(x[0]?.total ?? 0) }] };
  const names = new Map(accounts.map(account => [account.id, account.currency ?? "INR"]));
  const byCurrency = new Map<string, number>();
  for (const item of x) { const key = names.get(item._id) ?? "INR"; byCurrency.set(key, (byCurrency.get(key) ?? 0) + Number(item.total)); }
  return { currency: null, spent: null, spentByCurrency: [...byCurrency].map(([code, amount]) => ({ currency: code, amount })) };
}
const ser = (b: any, s: { currency: string | null; spent: number | null; spentByCurrency: Array<{ currency: string; amount: number }> }) => ({
  ...b,
  _id: undefined,
  amount: Number(b.limitAmount ?? b.amount ?? 0),
  limitAmount: Number(b.limitAmount ?? b.amount ?? 0),
  currency: s.currency,
  spent: s.spent,
  spentByCurrency: s.spentByCurrency,
  alertThreshold: b.alertThreshold == null ? null : Number(b.alertThreshold),
  createdAt: new Date(b.createdAt).toISOString(),
});
router.get("/budgets", requireAuth, async (req, res) => {
  const userId = req.user!.userId,
    b = await getCollection(collections.budgets),
    p = await getCollection(collections.profiles),
    t = await getCollection(collections.transactions),
    profile: any = await p.findOne({ id: userId }),
    budgets: any[] = withoutMongoIds(
      await b
        .find({ profileId: userId, archivedAt: active })
        .sort({ createdAt: 1 })
        .toArray(),
    );
  const tz = profile?.timezone ?? "UTC",
    ws = profile?.weekStarts === "sunday" ? "sunday" : "monday";
  const txs = await t
    .find({
      profileId: userId,
      type: "expense",
      deletedAt: active,
      status: { $ne: "void" },
    })
    .project({ category: 1 })
    .toArray();
  const out = [];
  for (const budget of budgets) {
    const inferred = resolveBudgetCategory(
        budget,
        txs.map((transaction) => transaction.category),
      ),
      effective = { ...budget, category: inferred };
    out.push(ser(effective, await spent(effective, userId, tz, ws)));
  }
  res.json(out);
});
router.post("/budgets", requireAuth, async (req, res) => {
  const p = CreateBudgetBody.safeParse(req.body);
  if (!p.success) {
    res.status(400).json({ error: p.error.message });
    return;
  }
  const c = await getCollection(collections.budgets),
    now = new Date(),
    b: any = {
      id: await nextId(collections.budgets),
      profileId: req.user!.userId,
      ...p.data,
      amount: Number(p.data.amount),
      limitAmount: Number(p.data.amount),
      category: p.data.category ?? null,
      currency: p.data.currency?.trim().toUpperCase() ?? null,
      color: p.data.color ?? null,
      startDate: p.data.startDate ?? null,
      endDate: p.data.endDate ?? null,
      alertThreshold:
        p.data.alertThreshold == null ? null : Number(p.data.alertThreshold),
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
  await c.insertOne(b);
  res.status(201).json(ser(b, await spent(b, req.user!.userId)));
});
router.get("/budgets/:id", requireAuth, async (req, res) => {
  const p = GetBudgetParams.safeParse(req.params);
  if (!p.success) {
    res.status(400).json({ error: p.error.message });
    return;
  }
  const c = await getCollection(collections.budgets),
    b: any = withoutMongoId(
      await c.findOne({ id: p.data.id, profileId: req.user!.userId }),
    );
  if (!b) {
    res.status(404).json({ error: "Budget not found" });
    return;
  }
  res.json(ser(b, await spent(b, req.user!.userId)));
});
router.patch("/budgets/:id", requireAuth, async (req, res) => {
  const q = UpdateBudgetParams.safeParse(req.params),
    p = UpdateBudgetBody.safeParse(req.body);
  if (!q.success || !p.success) {
    res
      .status(400)
      .json({ error: q.success ? p.error?.message : q.error.message });
    return;
  }
  const u: any = { updatedAt: new Date() };
  for (const k of [
    "name",
    "period",
    "category",
    "currency",
    "color",
    "startDate",
    "endDate",
  ] as const)
    if (p.data[k] != null) u[k] = k === "currency" ? p.data[k].trim().toUpperCase() : p.data[k];
  if (p.data.amount != null) {
    u.amount = Number(p.data.amount);
    u.limitAmount = Number(p.data.amount);
  }
  if (p.data.alertThreshold != null)
    u.alertThreshold = Number(p.data.alertThreshold);
  const c = await getCollection(collections.budgets),
    b: any = withoutMongoId(
      await c.findOneAndUpdate(
        { id: q.data.id, profileId: req.user!.userId },
        { $set: u },
        { returnDocument: "after" },
      ),
    );
  if (!b) {
    res.status(404).json({ error: "Budget not found" });
    return;
  }
  res.json(ser(b, await spent(b, req.user!.userId)));
});
router.delete("/budgets/:id", requireAuth, async (req, res) => {
  const p = DeleteBudgetParams.safeParse(req.params);
  if (!p.success) {
    res.status(400).json({ error: p.error.message });
    return;
  }
  const c = await getCollection(collections.budgets),
    x = await c.deleteOne({ id: p.data.id, profileId: req.user!.userId });
  if (!x.deletedCount) {
    res.status(404).json({ error: "Budget not found" });
    return;
  }
  res.sendStatus(204);
});
export default router;
