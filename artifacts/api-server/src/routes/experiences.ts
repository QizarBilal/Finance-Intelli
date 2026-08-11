import { Router } from "express";
import {
  collections,
  getCollection,
  nextId,
  withoutMongoId,
  withoutMongoIds,
  type CollectionName,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { getAccountBalance } from "../lib/accounts";
import { writeAudit } from "../lib/audit";
const router = Router(),
  clean = (v: unknown) => (typeof v === "string" ? v.trim() : ""),
  money = (v: unknown) =>
    Number.isFinite(Number(v)) ? Math.abs(Number(v)) : 0,
  today = () => new Date().toISOString().slice(0, 10),
  monthStart = () => today().slice(0, 7) + "-01";
async function list(
  name: CollectionName,
  profileId: number,
  sort: any = { createdAt: -1 },
) {
  return withoutMongoIds(
    await (await getCollection(name)).find({ profileId }).sort(sort).toArray(),
  );
}
async function create(name: CollectionName, profileId: number, value: any) {
  const now = new Date(),
    row: any = {
      id: await nextId(name),
      profileId,
      ...value,
      createdAt: now,
      updatedAt: now,
    };
  await (await getCollection(name)).insertOne(row);
  return withoutMongoId(row);
}
router.get("/command-center", requireAuth, async (req, res) => {
  const id = req.user!.userId,
    accounts: any[] = await (
      await getCollection(collections.accounts)
    )
      .find({ profileId: id, archivedAt: null })
      .toArray(),
    due: any[] = await (
      await getCollection(collections.reminders)
    )
      .find({
        profileId: id,
        isCompleted: false,
        dueDate: {
          $lte: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
        },
      })
      .sort({ dueDate: 1 })
      .toArray(),
    budgets: any[] = await (
      await getCollection(collections.budgets)
    )
      .find({ profileId: id })
      .toArray(),
    subs = await (
      await getCollection(collections.subscriptions)
    ).countDocuments({ profileId: id, status: "active" }),
    unread = await (
      await getCollection(collections.notifications)
    ).countDocuments({ profileId: id, readAt: null }),
    balances: any[] = await Promise.all(
      accounts.map(async (a) => ({
        ...withoutMongoId(a),
        balance: await getAccountBalance(id, a.id),
      })),
    ),
    txs: any[] = await (
      await getCollection(collections.transactions)
    )
      .find({
        profileId: id,
        type: "expense",
        date: { $gte: monthStart() },
        deletedAt: null,
      })
      .toArray(),
    spend = new Map<string, number>();
  for (const t of txs)
    spend.set(
      String(t.category || "").toLowerCase(),
      (spend.get(String(t.category || "").toLowerCase()) || 0) +
        Number(t.amount),
    );
  const tasks = [
    ...due.map((r) => ({
      id: `reminder-${r.id}`,
      priority: r.dueDate <= today() ? "urgent" : "soon",
      title: `${r.title} is due`,
      detail: r.amount
        ? `Prepare ${Number(r.amount).toFixed(2)}`
        : "Review and complete",
      href: "/reminders",
    })),
    ...budgets
      .filter(
        (b) =>
          b.category &&
          Number(b.limitAmount ?? b.amount) > 0 &&
          (spend.get(b.category.toLowerCase()) || 0) /
            Number(b.limitAmount ?? b.amount) >=
            0.8,
      )
      .map((b) => ({
        id: `budget-${b.id}`,
        priority: "warning",
        title: `${b.category} budget needs attention`,
        detail: `${Math.round(((spend.get(b.category.toLowerCase()) || 0) / Number(b.limitAmount ?? b.amount)) * 100)}% used`,
        href: "/budgets",
      })),
    ...balances
      .filter((a) => a.balance < 0)
      .map((a) => ({
        id: `account-${a.id}`,
        priority: "urgent",
        title: `${a.name} is below zero`,
        detail: "Review recent activity",
        href: "/accounts",
      })),
  ].slice(0, 12);
  res.json({
    tasks,
    balances,
    upcomingBills: withoutMongoIds(due),
    activeSubscriptions: subs,
    unreadNotifications: unread,
    allClear: !tasks.length,
  });
});
router.get("/subscriptions", requireAuth, async (req, res) => {
  const id = req.user!.userId,
    explicit: any[] = await (
      await getCollection(collections.subscriptions)
    )
      .find({ profileId: id })
      .sort({ nextChargeDate: 1 })
      .toArray(),
    txs: any[] = await (
      await getCollection(collections.transactions)
    )
      .find({
        profileId: id,
        type: "expense",
        date: {
          $gte: new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10),
        },
        deletedAt: null,
      })
      .toArray(),
    groups = new Map<string, any[]>();
  for (const t of txs) {
    const key = t.merchant || t.description;
    if (key) groups.set(key, [...(groups.get(key) || []), t]);
  }
  const detected = [...groups]
    .filter(([, v]) => v.length >= 3)
    .map(([merchant, v]) => ({
      merchant,
      average: v.reduce((s, t) => s + Number(t.amount), 0) / v.length,
      occurrences: v.length,
      lastCharge: v
        .map((t) => t.date)
        .sort()
        .at(-1),
    }))
    .filter(
      (c) =>
        !explicit.some(
          (s) => s.merchant.toLowerCase() === c.merchant.toLowerCase(),
        ),
    );
  res.json({ subscriptions: withoutMongoIds(explicit), detected });
});
router.post("/subscriptions", requireAuth, async (req, res) => {
  if (!clean(req.body?.merchant) || !money(req.body?.amount)) {
    res.status(400).json({ error: "Merchant and amount are required" });
    return;
  }
  res
    .status(201)
    .json(
      await create(collections.subscriptions, req.user!.userId, {
        merchant: clean(req.body.merchant),
        amount: money(req.body.amount),
        frequency: clean(req.body.frequency) || "monthly",
        nextChargeDate: clean(req.body.nextChargeDate) || null,
        cancelUrl: clean(req.body.cancelUrl) || null,
        source: clean(req.body.source) || "manual",
        status: "active",
      }),
    );
});
router.patch("/subscriptions/:id", requireAuth, async (req, res) => {
  const status = ["active", "cancelled", "paused"].includes(req.body?.status)
      ? req.body.status
      : "active",
    row = await (
      await getCollection(collections.subscriptions)
    ).findOneAndUpdate(
      { id: Number(req.params.id), profileId: req.user!.userId },
      { $set: { status, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
  if (!row) {
    res.sendStatus(404);
    return;
  }
  res.json(withoutMongoId(row));
});
router.get("/net-worth", requireAuth, async (req, res) => {
  const id = req.user!.userId,
    accounts: any[] = await (
      await getCollection(collections.accounts)
    )
      .find({ profileId: id, archivedAt: null })
      .toArray(),
    current = await Promise.all(
      accounts.map(async (a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        balance: await getAccountBalance(id, a.id),
      })),
    ),
    snaps: any[] = await (
      await getCollection(collections.accountBalanceSnapshots)
    )
      .find({ profileId: id })
      .sort({ asOfDate: 1 })
      .toArray(),
    timeline = new Map<string, number>();
  for (const s of snaps)
    timeline.set(
      s.asOfDate,
      (timeline.get(s.asOfDate) || 0) + Number(s.balance),
    );
  const netWorth = current.reduce((s, a) => s + a.balance, 0),
    assets = current
      .filter((a) => !["credit_card", "loan"].includes(a.type))
      .reduce((s, a) => s + Math.max(0, a.balance), 0),
    liabilities = current
      .filter((a) => ["credit_card", "loan"].includes(a.type))
      .reduce((s, a) => s + Math.abs(Math.min(0, a.balance)), 0),
    marks = [0, 10000, 25000, 50000, 100000, 250000, 500000, 1000000],
    next =
      marks.find((v) => v > netWorth) ?? Math.ceil(netWorth / 1e6 + 1) * 1e6;
  res.json({
    netWorth,
    assets,
    liabilities,
    accounts: current,
    timeline: [...timeline].map(([date, value]) => ({ date, value })),
    milestone: {
      next,
      remaining: Math.max(0, next - netWorth),
      progress: next
        ? Math.max(0, Math.min(100, (netWorth / next) * 100))
        : 100,
    },
  });
});
router.get("/emergency-fund", requireAuth, async (req, res) => {
  const id = req.user!.userId,
    months = Math.min(12, Math.max(1, Number(req.query.months ?? 6))),
    accounts: any[] = await (
      await getCollection(collections.accounts)
    )
      .find({
        profileId: id,
        archivedAt: null,
        type: { $in: ["checking", "savings", "cash"] },
      })
      .toArray(),
    liquid = (
      await Promise.all(accounts.map((a) => getAccountBalance(id, a.id)))
    ).reduce((s, n) => s + Math.max(0, n), 0),
    since = new Date();
  since.setUTCMonth(since.getUTCMonth() - 3);
  const txs: any[] = await (
      await getCollection(collections.transactions)
    )
      .find({
        profileId: id,
        type: "expense",
        date: { $gte: since.toISOString().slice(0, 10) },
        deletedAt: null,
      })
      .toArray(),
    monthly = txs.reduce((s, t) => s + Number(t.amount), 0) / 3,
    target = monthly * months;
  res.json({
    liquid,
    monthlyEssentials: monthly,
    targetMonths: months,
    target,
    gap: Math.max(0, target - liquid),
    monthsCovered: monthly ? liquid / monthly : 0,
    ready: liquid >= target,
    explanation:
      "Liquid balances compared with the trailing three-month average expense level.",
  });
});
router.get("/tax", requireAuth, async (req, res) => {
  const year = Number(req.query.year ?? new Date().getFullYear()),
    tags: any[] = await (
      await getCollection(collections.taxTags)
    )
      .find({ profileId: req.user!.userId, taxYear: year })
      .toArray(),
    txs: any[] = await (
      await getCollection(collections.transactions)
    )
      .find({ id: { $in: tags.map((t) => t.transactionId) } })
      .toArray(),
    rows = tags
      .map((tag) => ({
        tag: withoutMongoId(tag),
        transaction: withoutMongoId(
          txs.find((t) => t.id === tag.transactionId),
        ),
      }))
      .filter((r) => r.transaction);
  res.json({
    year,
    rows,
    deductibleTotal: rows.reduce(
      (s: any, r: any) =>
        s +
        (Number(r.transaction.amount) * Number(r.tag.deductiblePercent)) / 100,
      0,
    ),
  });
});
router.post("/tax", requireAuth, async (req, res) => {
  const id = Number(req.body?.transactionId);
  if (
    !clean(req.body?.classification) ||
    !(await (
      await getCollection(collections.transactions)
    ).findOne({ id, profileId: req.user!.userId }))
  ) {
    res
      .status(400)
      .json({ error: "A valid transaction and classification are required" });
    return;
  }
  const col = await getCollection(collections.taxTags),
    key = { profileId: req.user!.userId, transactionId: id },
    now = new Date(),
    row = await col.findOneAndUpdate(
      key,
      {
        $set: {
          taxYear: Number(req.body.taxYear ?? new Date().getFullYear()),
          classification: clean(req.body.classification),
          deductiblePercent: Math.min(
            100,
            money(req.body.deductiblePercent ?? 100),
          ),
          note: clean(req.body.note) || null,
          updatedAt: now,
        },
        $setOnInsert: {
          id: await nextId(collections.taxTags),
          ...key,
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
  res.status(201).json(withoutMongoId(row));
});
router.get("/receipts", requireAuth, async (req, res) =>
  res.json(await list(collections.receipts, req.user!.userId)),
);
router.post("/receipts", requireAuth, async (req, res) => {
  if (!clean(req.body?.filename)) {
    res.status(400).json({ error: "Filename is required" });
    return;
  }
  res
    .status(201)
    .json(
      await create(collections.receipts, req.user!.userId, {
        transactionId: req.body.transactionId
          ? Number(req.body.transactionId)
          : null,
        filename: clean(req.body.filename),
        storageKey: clean(req.body.storageKey) || null,
        merchant: clean(req.body.merchant) || null,
        amount: money(req.body.amount) || null,
        purchasedAt: clean(req.body.purchasedAt) || null,
        ocrStatus: clean(req.body.ocrStatus) || "manual_review",
        extractedData: req.body.extractedData ?? {},
      }),
    );
});
router.get("/cash-flow", requireAuth, async (req, res) => {
  const days = Math.min(90, Math.max(14, Number(req.query.days ?? 30))),
    id = req.user!.userId,
    accounts: any[] = await (
      await getCollection(collections.accounts)
    )
      .find({ profileId: id, archivedAt: null })
      .toArray();
  let balance = (
    await Promise.all(accounts.map((a) => getAccountBalance(id, a.id)))
  ).reduce((s, n) => s + n, 0);
  const opening = balance,
    rem: any[] = await (
      await getCollection(collections.reminders)
    )
      .find({
        profileId: id,
        isCompleted: false,
        dueDate: {
          $gte: today(),
          $lte: new Date(Date.now() + days * 864e5).toISOString().slice(0, 10),
        },
      })
      .sort({ dueDate: 1 })
      .toArray(),
    events = rem.map((r) => {
      balance -= Number(r.amount ?? 0);
      return {
        date: r.dueDate,
        title: r.title,
        amount: -Number(r.amount ?? 0),
        projectedBalance: balance,
        warning: balance < 0,
      };
    });
  res.json({
    openingBalance: opening,
    events,
    lowestBalance: events.reduce(
      (m, e) => Math.min(m, e.projectedBalance),
      opening,
    ),
    hasShortfall: events.some((e) => e.warning),
  });
});
router.get("/reviews", requireAuth, async (req, res) =>
  res.json(
    await list(collections.monthlyReviews, req.user!.userId, { month: -1 }),
  ),
);
router.put("/reviews/:month", requireAuth, async (req, res) => {
  const month = String(req.params.month);
  if (!/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: "Invalid month" });
    return;
  }
  const col = await getCollection(collections.monthlyReviews),
    key = { profileId: req.user!.userId, month },
    now = new Date(),
    row = await col.findOneAndUpdate(
      key,
      {
        $set: {
          step: Math.min(5, Math.max(1, Number(req.body?.step ?? 1))),
          status:
            req.body?.status === "completed" ? "completed" : "in_progress",
          answers: req.body?.answers ?? {},
          completedAt: req.body?.status === "completed" ? now : null,
          updatedAt: now,
        },
        $setOnInsert: {
          id: await nextId(collections.monthlyReviews),
          ...key,
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
  res.json(withoutMongoId(row));
});
router.get("/credit", requireAuth, async (req, res) =>
  res.json(
    await list(collections.creditSnapshots, req.user!.userId, {
      snapshotDate: -1,
    }),
  ),
);
router.post("/credit", requireAuth, async (req, res) => {
  const total = money(req.body?.totalLimit),
    balance = money(req.body?.statementBalance),
    date = clean(req.body.snapshotDate) || today(),
    col = await getCollection(collections.creditSnapshots),
    key = { profileId: req.user!.userId, snapshotDate: date },
    now = new Date(),
    row = await col.findOneAndUpdate(
      key,
      {
        $set: {
          score: req.body.score
            ? Math.min(850, Math.max(300, Number(req.body.score)))
            : null,
          utilization: total
            ? (balance / total) * 100
            : money(req.body.utilization),
          totalLimit: total,
          statementBalance: balance,
          source: "manual",
          updatedAt: now,
        },
        $setOnInsert: {
          id: await nextId(collections.creditSnapshots),
          ...key,
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
  res.status(201).json(withoutMongoId(row));
});
router.get("/investments", requireAuth, async (req, res) => {
  const rows: any[] = await (
      await getCollection(collections.investments)
    )
      .find({ profileId: req.user!.userId })
      .toArray(),
    positions: any[] = rows.map((r) => ({
      ...withoutMongoId(r),
      value: Number(r.quantity) * Number(r.currentPrice),
      gain: Number(r.quantity) * Number(r.currentPrice) - Number(r.costBasis),
    })),
    total = positions.reduce((s, p) => s + p.value, 0),
    map = new Map<string, number>();
  for (const p of positions)
    map.set(p.assetClass, (map.get(p.assetClass) || 0) + p.value);
  res.json({
    positions,
    total,
    allocation: [...map].map(([name, value]) => ({
      name,
      value,
      percent: total ? (value / total) * 100 : 0,
    })),
  });
});
router.post("/investments", requireAuth, async (req, res) => {
  if (
    !clean(req.body?.symbol) ||
    !clean(req.body?.name) ||
    !money(req.body?.quantity) ||
    !money(req.body?.currentPrice)
  ) {
    res
      .status(400)
      .json({
        error: "Symbol, name, quantity, and current price are required",
      });
    return;
  }
  res
    .status(201)
    .json(
      await create(collections.investments, req.user!.userId, {
        symbol: clean(req.body.symbol).toUpperCase(),
        name: clean(req.body.name),
        assetClass: clean(req.body.assetClass) || "Other",
        quantity: money(req.body.quantity),
        costBasis: money(req.body.costBasis),
        currentPrice: money(req.body.currentPrice),
        accountId: req.body.accountId ? Number(req.body.accountId) : null,
      }),
    );
});
router.get("/dashboard-layouts", requireAuth, async (req, res) =>
  res.json(await list(collections.dashboardLayouts, req.user!.userId)),
);
router.post("/dashboard-layouts", requireAuth, async (req, res) => {
  const name = clean(req.body?.name);
  if (!name || !Array.isArray(req.body?.widgets)) {
    res.status(400).json({ error: "Name and widget list are required" });
    return;
  }
  const col = await getCollection(collections.dashboardLayouts),
    key = { profileId: req.user!.userId, name },
    now = new Date(),
    row = await col.findOneAndUpdate(
      key,
      {
        $set: {
          widgets: req.body.widgets,
          isDefault: Boolean(req.body.isDefault),
          updatedAt: now,
        },
        $setOnInsert: {
          id: await nextId(collections.dashboardLayouts),
          ...key,
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
  res.status(201).json(withoutMongoId(row));
});
router.get("/notifications", requireAuth, async (req, res) => {
  const items = await list(collections.notifications, req.user!.userId),
    preferences = await (
      await getCollection(collections.notificationPreferences)
    ).findOne({ profileId: req.user!.userId });
  res.json({
    items: items.slice(0, 100),
    preferences: withoutMongoId(preferences),
  });
});
router.put("/notification-preferences", requireAuth, async (req, res) => {
  const col = await getCollection(collections.notificationPreferences),
    key = { profileId: req.user!.userId },
    now = new Date(),
    row = await col.findOneAndUpdate(
      key,
      {
        $set: {
          lowBalance: req.body?.lowBalance !== false,
          bills: req.body?.bills !== false,
          budgets: req.body?.budgets !== false,
          subscriptions: req.body?.subscriptions !== false,
          weeklyDigest: req.body?.weeklyDigest !== false,
          lowBalanceThreshold: money(req.body?.lowBalanceThreshold ?? 500),
          updatedAt: now,
        },
        $setOnInsert: {
          id: await nextId(collections.notificationPreferences),
          ...key,
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
  res.json(withoutMongoId(row));
});
router.patch("/notifications/:id/read", requireAuth, async (req, res) => {
  const row = await (
    await getCollection(collections.notifications)
  ).findOneAndUpdate(
    { id: Number(req.params.id), profileId: req.user!.userId },
    { $set: { readAt: new Date(), updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!row) {
    res.sendStatus(404);
    return;
  }
  res.json(withoutMongoId(row));
});
router.get("/search", requireAuth, async (req, res) => {
  const q = clean(req.query.q);
  if (q.length < 2) {
    res.json([]);
    return;
  }
  const id = req.user!.userId,
    re = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" },
    [txs, accounts, goals] = await Promise.all([
      (await getCollection(collections.transactions))
        .find({
          profileId: id,
          deletedAt: null,
          $or: [{ description: re }, { merchant: re }, { category: re }],
        })
        .limit(8)
        .toArray(),
      (await getCollection(collections.accounts))
        .find({ profileId: id, archivedAt: null, name: re })
        .limit(5)
        .toArray(),
      (await getCollection(collections.goals))
        .find({ profileId: id, archivedAt: null, name: re })
        .limit(5)
        .toArray(),
    ]);
  res.json([
    ...txs.map((x: any) => ({
      type: "transaction",
      id: x.id,
      title: x.description || x.merchant || "Transaction",
      subtitle: `${x.date} · ${x.amount}`,
      href: "/transactions",
    })),
    ...accounts.map((x: any) => ({
      type: "account",
      id: x.id,
      title: x.name,
      subtitle: x.type,
      href: "/accounts",
    })),
    ...goals.map((x: any) => ({
      type: "goal",
      id: x.id,
      title: x.name,
      subtitle: `${x.currentAmount} of ${x.targetAmount}`,
      href: "/goals",
    })),
  ]);
});
router.get("/household-approvals", requireAuth, async (req, res) => {
  const members: any[] = await (
    await getCollection(collections.householdMembers)
  )
    .find({ profileId: req.user!.userId, status: "active" })
    .toArray();
  res.json(
    members.length
      ? withoutMongoIds(
          await (
            await getCollection(collections.householdApprovals)
          )
            .find({ householdId: { $in: members.map((m) => m.householdId) } })
            .sort({ createdAt: -1 })
            .toArray(),
        )
      : [],
  );
});
router.post("/household-approvals", requireAuth, async (req, res) => {
  const householdId = Number(req.body?.householdId),
    member = await (
      await getCollection(collections.householdMembers)
    ).findOne({ householdId, profileId: req.user!.userId, status: "active" });
  if (!member || !clean(req.body?.title)) {
    res
      .status(403)
      .json({ error: "Active household membership and title are required" });
    return;
  }
  res
    .status(201)
    .json(
      await create(collections.householdApprovals, req.user!.userId, {
        householdId,
        requestedByProfileId: req.user!.userId,
        type: clean(req.body.type) || "expense",
        title: clean(req.body.title),
        amount: money(req.body.amount) || null,
        payload: req.body.payload ?? {},
        status: "pending",
      }),
    );
});
router.patch("/household-approvals/:id", requireAuth, async (req, res) => {
  const status = req.body?.status;
  if (!["approved", "rejected"].includes(status)) {
    res.status(400).json({ error: "Status must be approved or rejected" });
    return;
  }
  const col = await getCollection(collections.householdApprovals),
    old: any = await col.findOne({ id: Number(req.params.id) });
  if (!old) {
    res.sendStatus(404);
    return;
  }
  const member: any = await (
    await getCollection(collections.householdMembers)
  ).findOne({
    householdId: old.householdId,
    profileId: req.user!.userId,
    status: "active",
    role: { $in: ["owner", "admin"] },
  });
  if (!member) {
    res.sendStatus(403);
    return;
  }
  const row = await col.findOneAndUpdate(
    { id: old.id },
    {
      $set: {
        status,
        decidedByProfileId: req.user!.userId,
        decidedAt: new Date(),
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  );
  await writeAudit(req, status, "household_approval", old.id, old, row);
  res.json(withoutMongoId(row));
});
export default router;
