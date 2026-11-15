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
import { notifyUserOnce, pushConfigured } from "../lib/notifications";
import { periodRange } from "../lib/dates";
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
    alertPrefs: any = await (await getCollection(collections.notificationPreferences)).findOne({ profileId: id }),
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
    spend = new Map<string, number>(),
    currencyByAccount = new Map(accounts.map(account => [account.id, account.currency ?? "INR"])),
    accountCurrencies = new Set(accounts.map(account => account.currency ?? "INR"));
  for (const t of txs)
    {
      const key = `${currencyByAccount.get(t.accountId) ?? "INR"}:${String(t.category || "").toLowerCase()}`;
      spend.set(key, (spend.get(key) || 0) + Number(t.amount));
    }
  const tasks = [
    ...(alertPrefs?.bills === false ? [] : due.map((r) => ({
      id: `reminder-${r.id}`,
      priority: r.dueDate <= today() ? "urgent" : "soon",
      title: `${r.title} is due`,
      detail: r.amount
        ? `Prepare ${Number(r.amount).toFixed(2)}`
        : "Review and complete",
      href: "/reminders",
    }))),
    ...budgets
      .filter(
        (b) => {
          const currency = b.currency ?? (accountCurrencies.size === 1 ? [...accountCurrencies][0] : null);
          return Boolean(currency) &&
          alertPrefs?.budgets !== false &&
          b.category &&
          Number(b.limitAmount ?? b.amount) > 0 &&
          (spend.get(`${currency}:${b.category.toLowerCase()}`) || 0) /
            Number(b.limitAmount ?? b.amount) >=
            0.8;
        },
      )
      .map((b) => {
        const currency = b.currency ?? [...accountCurrencies][0];
        const used = spend.get(`${currency}:${b.category.toLowerCase()}`) || 0;
        return {
        id: `budget-${b.id}`,
        priority: "warning",
        title: `${b.category} budget needs attention`,
        detail: `${Math.round((used / Number(b.limitAmount ?? b.amount)) * 100)}% used · ${currency}`,
        href: "/budgets",
        };
      }),
    ...(accountCurrencies.size > 1 && alertPrefs?.budgets !== false && budgets.some(budget => !budget.currency && budget.category) ? [{
      id: "budget-currency-review", priority: "warning", title: "Choose currencies for older budgets",
      detail: "Budget alerts are paused where account currencies could be mixed.", href: "/budgets",
    }] : []),
    ...balances
      .filter((a) => alertPrefs?.lowBalance !== false && a.balance < Number(alertPrefs?.lowBalanceThreshold ?? 500))
      .map((a) => ({
        id: `account-${a.id}`,
        priority: "urgent",
        title: `${a.name} balance is low`,
        detail: `Below your ${Number(alertPrefs?.lowBalanceThreshold ?? 500).toFixed(2)} alert threshold`,
        href: "/accounts",
      })),
  ].slice(0, 12);
  for (const task of tasks) {
    const periodKey = task.id.startsWith("budget-") ? `:${monthStart()}` : task.id.startsWith("reminder-") ? `:${due.find(reminder => task.id === `reminder-${reminder.id}`)?.dueDate ?? today()}` : "";
    await notifyUserOnce(id, `${task.id}${periodKey}`, task.title, task.detail, task.href);
  }
  const unread = await (await getCollection(collections.notifications)).countDocuments({ profileId: id, readAt: null });
  res.json({
    tasks,
    balances,
    setup: {
      hasAccounts: accounts.length > 0,
      hasTransactions: await (await getCollection(collections.transactions)).countDocuments({ profileId: id, deletedAt: { $in: [null, undefined] }, status: { $ne: "void" } }) > 0,
      hasBudget: budgets.some(budget => !budget.archivedAt),
      hasGoal: await (await getCollection(collections.goals)).countDocuments({ profileId: id }) > 0,
    },
    upcomingBills: withoutMongoIds(due),
    activeSubscriptions: subs,
    unreadNotifications: unread,
    allClear: !tasks.length,
  });
});
router.get("/giving", requireAuth, async (req, res) => {
  const profileId = req.user!.userId;
  const profile: any = await (await getCollection(collections.profiles)).findOne({ id: profileId });
  const ranges = {
    today: periodRange("today", profile?.timezone ?? "UTC", profile?.weekStarts ?? "monday"),
    month: periodRange("monthly", profile?.timezone ?? "UTC", profile?.weekStarts ?? "monday"),
    year: periodRange("yearly", profile?.timezone ?? "UTC", profile?.weekStarts ?? "monday"),
  };
  const accounts: any[] = await (await getCollection(collections.accounts)).find({ profileId }).toArray();
  const currencies = new Map(accounts.map(account => [account.id, account.currency ?? "INR"]));
  const rows: any[] = await (await getCollection(collections.transactions)).find({
    profileId,
    type: "expense",
    category: { $regex: "^(giving|donation|donations|charity|charitable contributions)$", $options: "i" },
    status: { $in: ["cleared", "reconciled"] },
    deletedAt: { $in: [null, undefined] },
  }).sort({ date: -1, createdAt: -1 }).limit(5000).toArray();
  const totals = (from: string, to: string) => {
    const grouped = new Map<string, number>();
    for (const row of rows) {
      if (row.date < from || row.date > to) continue;
      const currency = currencies.get(row.accountId) ?? "INR";
      grouped.set(currency, (grouped.get(currency) ?? 0) + Number(row.amount));
    }
    return [...grouped].map(([currency, amount]) => ({ currency, amount }));
  };
  const reminders: any[] = await (await getCollection(collections.reminders)).find({
    profileId, type: "personal", title: { $regex: "^Giving ·", $options: "i" }, isCompleted: false,
  }).sort({ dueDate: 1 }).limit(10).toArray();
  res.json({
    today: totals(ranges.today.from, ranges.today.to),
    month: totals(ranges.month.from, ranges.month.to),
    year: totals(ranges.year.from, ranges.year.to),
    totalCount: rows.length,
    recent: rows.slice(0, 30).map(row => ({ ...withoutMongoId(row), currency: currencies.get(row.accountId) ?? "INR" })),
    reminders: withoutMongoIds(reminders),
  });
});

router.get("/monthly-brief", requireAuth, async (req, res) => {
  const profileId = req.user!.userId;
  const profile: any = await (await getCollection(collections.profiles)).findOne({ id: profileId });
  const timezone = profile?.timezone ?? "UTC";
  const current = periodRange("monthly", timezone, profile?.weekStarts ?? "monday");
  const today = periodRange("today", timezone).from;
  const [year, month] = current.from.split("-").map(Number);
  const previousDate = new Date(Date.UTC(year, month - 2, 1, 12));
  const previousFrom = `${previousDate.getUTCFullYear()}-${String(previousDate.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const previousMonthEnd = new Date(Date.UTC(year, month - 1, 0, 12));
  const comparableDay = Math.min(Number(today.slice(-2)), previousMonthEnd.getUTCDate());
  const previousTo = `${previousMonthEnd.getUTCFullYear()}-${String(previousMonthEnd.getUTCMonth() + 1).padStart(2, "0")}-${String(comparableDay).padStart(2, "0")}`;
  const accounts: any[] = await (await getCollection(collections.accounts)).find({ profileId }).toArray();
  const currencies = new Map(accounts.map(account => [account.id, account.currency ?? "INR"]));
  const transactions: any[] = await (await getCollection(collections.transactions)).find({
    profileId, date: { $gte: previousFrom, $lte: today }, deletedAt: { $in: [null, undefined] }, status: { $ne: "void" },
  }).toArray();
  const summaries = new Map<string, any>();
  const categories = new Map<string, Map<string, number>>();
  for (const currency of new Set(accounts.map(account => account.currency ?? "INR"))) {
    summaries.set(`current:${currency}`, { currency, income: 0, expenses: 0, savings: 0 });
    summaries.set(`previous:${currency}`, { currency, income: 0, expenses: 0, savings: 0 });
  }
  for (const tx of transactions) {
    const currency = currencies.get(tx.accountId) ?? "INR";
    const previous = tx.date < current.from;
    const key = `${previous ? "previous" : "current"}:${currency}`;
    const value = summaries.get(key) ?? { currency, income: 0, expenses: 0, savings: 0 };
    if (tx.type === "income") value.income += Number(tx.amount);
    if (tx.type === "expense") {
      value.expenses += Number(tx.amount);
      if (!previous) {
        const category = String(tx.category || "Uncategorized");
        const groups = categories.get(currency) ?? new Map<string, number>();
        groups.set(category, (groups.get(category) ?? 0) + Number(tx.amount));
        categories.set(currency, groups);
      }
    }
    value.savings = value.income - value.expenses;
    summaries.set(key, value);
  }
  const currenciesSeen = new Set(accounts.map(account => account.currency ?? "INR"));
  const currentSummaries = [...summaries].filter(([key]) => key.startsWith("current:")).map(([, value]) => value);
  const brief = currentSummaries.map(now => {
    const before = summaries.get(`previous:${now.currency}`) ?? { income: 0, expenses: 0, savings: 0 };
    const daysElapsed = Math.max(1, Number(today.slice(-2)));
    const daysInMonth = Number(current.to.slice(-2));
    const projectedExpenses = now.expenses / daysElapsed * daysInMonth;
    const savingsRate = now.income > 0 ? Math.round((now.savings / now.income) * 100) : null;
    const topCategory = [...(categories.get(now.currency) ?? new Map())].sort((a, b) => b[1] - a[1])[0];
    const highlights: Array<{ title: string; detail: string; tone: "positive" | "caution" | "neutral" }> = [];
    if (before.expenses > 0 && now.expenses > before.expenses * 1.15) {
      const change = Math.round((now.expenses - before.expenses) / before.expenses * 100);
      highlights.push({ title: "Spending is higher", detail: `${change}% more than last month in ${now.currency}. Review recent activity for changes you want to address.`, tone: "caution" });
    } else if (before.expenses > 0 && now.expenses < before.expenses * 0.85) {
      const change = Math.round((before.expenses - now.expenses) / before.expenses * 100);
      highlights.push({ title: "Spending is lower", detail: `${change}% less than last month in ${now.currency}.`, tone: "positive" });
    }
    if (savingsRate !== null && savingsRate < 10) highlights.push({ title: "Savings are under 10%", detail: "Look at recurring costs and set a small automatic savings goal if it fits your plan.", tone: "caution" });
    if (topCategory && now.expenses > 0) highlights.push({ title: `Top category: ${topCategory[0]}`, detail: `${Math.round(topCategory[1] / now.expenses * 100)}% of this month's spending in ${now.currency}.`, tone: "neutral" });
    if (!highlights.length) highlights.push({ title: "Your month is taking shape", detail: "Keep recording or importing transactions to get a more useful month-end picture.", tone: "neutral" });
    return { currency: now.currency, income: now.income, expenses: now.expenses, net: now.savings, previousIncome: before.income, previousExpenses: before.expenses, previousNet: before.savings, savingsRate, projectedExpenses, topCategory: topCategory ? { name: topCategory[0], amount: topCategory[1] } : null, highlights };
  });
  res.json({ month: current.from.slice(0, 7), through: today, comparisonThrough: previousTo, isPartialMonth: today < current.to, hasMixedCurrencies: currenciesSeen.size > 1, summaries: brief });
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
        currency: a.currency ?? "INR",
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
  const currencyBalances = Object.entries(current.reduce<Record<string, number>>((totals, account) => {
    totals[account.currency] = (totals[account.currency] ?? 0) + account.balance;
    return totals;
  }, {})).map(([currency, balance]) => ({ currency, balance }));
  const hasMixedCurrencies = currencyBalances.length > 1;
  const netWorth = hasMixedCurrencies ? null : current.reduce((s, a) => s + a.balance, 0),
    assets = hasMixedCurrencies ? null : current
      .filter((a) => !["credit_card", "loan"].includes(a.type))
      .reduce((s, a) => s + Math.max(0, a.balance), 0),
    liabilities = hasMixedCurrencies ? null : current
      .filter((a) => ["credit_card", "loan"].includes(a.type))
      .reduce((s, a) => s + Math.abs(Math.min(0, a.balance)), 0),
    marks = [0, 10000, 25000, 50000, 100000, 250000, 500000, 1000000],
    next =
      marks.find((v) => v > Number(netWorth)) ?? Math.ceil(Number(netWorth) / 1e6 + 1) * 1e6;
  res.json({
    netWorth,
    assets,
    liabilities,
    currencyBalances,
    hasMixedCurrencies,
    accounts: current,
    timeline: hasMixedCurrencies ? [] : [...timeline].map(([date, value]) => ({ date, value })),
    milestone: hasMixedCurrencies ? null : {
      next,
      remaining: Math.max(0, next - Number(netWorth)),
      progress: next
        ? Math.max(0, Math.min(100, (Number(netWorth) / next) * 100))
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
        type: { $in: ["bank", "wallet", "cash"] },
      })
      .toArray(),
    accountBalances = await Promise.all(accounts.map(async (account) => ({
      currency: account.currency ?? "INR",
      amount: Math.max(0, await getAccountBalance(id, account.id)),
    }))),
    currencyTotals = Object.entries(accountBalances.reduce<Record<string, number>>((totals, row) => {
      totals[row.currency] = (totals[row.currency] ?? 0) + row.amount;
      return totals;
    }, {})).map(([currency, amount]) => ({ currency, amount })),
    hasMixedCurrencies = currencyTotals.length > 1,
    liquid = hasMixedCurrencies ? null : currencyTotals[0]?.amount ?? 0,
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
    monthly = hasMixedCurrencies ? null : txs.reduce((s, t) => s + Number(t.amount), 0) / 3,
    target = hasMixedCurrencies ? null : (monthly ?? 0) * months;
  res.json({
    liquid,
    currencyTotals,
    hasMixedCurrencies,
    monthlyEssentials: monthly,
    targetMonths: months,
    target,
    gap: target == null || liquid == null ? null : Math.max(0, target - liquid),
    monthsCovered: monthly && liquid != null ? liquid / monthly : null,
    ready: target != null && liquid != null ? liquid >= target : null,
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
  const accountBalances = await Promise.all(accounts.map(async (account) => ({
      currency: account.currency ?? "INR",
      balance: await getAccountBalance(id, account.id),
    }))),
    currencyBalances = Object.entries(accountBalances.reduce<Record<string, number>>((totals, row) => {
      totals[row.currency] = (totals[row.currency] ?? 0) + row.balance;
      return totals;
    }, {})).map(([currency, balance]) => ({ currency, balance }));
  if (currencyBalances.length > 1) {
    res.json({ openingBalance: null, events: [], lowestBalance: null, hasShortfall: false, hasMixedCurrencies: true, currencyBalances });
    return;
  }
  let balance = accountBalances.reduce((sum, account) => sum + account.balance, 0);
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
    hasMixedCurrencies: false,
    currencyBalances,
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
  const notificationCollection = await getCollection(collections.notifications);
  await notificationCollection.createIndex({ profileId: 1, createdAt: -1 }, { name: "profile_notifications_recent" });
  const items = await list(collections.notifications, req.user!.userId),
    preferences = await (
      await getCollection(collections.notificationPreferences)
    ).findOne({ profileId: req.user!.userId });
  res.json({
    items: items.slice(0, 100),
    preferences: withoutMongoId(preferences),
  });
});
router.get("/push/public-key", requireAuth, async (_req, res) => res.json({ enabled: pushConfigured(), publicKey: process.env.VAPID_PUBLIC_KEY ?? null }));
router.post("/push/subscriptions", requireAuth, async (req, res) => {
  if (!pushConfigured()) { res.status(503).json({ error: "Browser notifications are not configured yet." }); return; }
  const sub = req.body;
  let endpoint: URL | null = null;
  try { endpoint = new URL(sub?.endpoint); } catch { endpoint = null; }
  const host = endpoint?.hostname.toLowerCase() ?? "";
  const trustedPushHost = host === "fcm.googleapis.com" || host === "updates.push.services.mozilla.com" || host === "push.services.mozilla.com" || host.endsWith(".push.apple.com") || host.endsWith(".notify.windows.com");
  if (!endpoint || endpoint.protocol !== "https:" || endpoint.port || endpoint.username || endpoint.password || endpoint.href.length > 2048 || !trustedPushHost || typeof sub?.keys?.p256dh !== "string" || !/^[A-Za-z0-9_-]{40,200}$/.test(sub.keys.p256dh) || typeof sub?.keys?.auth !== "string" || !/^[A-Za-z0-9_-]{10,100}$/.test(sub.keys.auth)) {
    res.status(400).json({ error: "Invalid browser notification subscription." }); return;
  }
  const col = await getCollection(collections.pushSubscriptions);
  await col.createIndex({ endpoint: 1 }, { unique: true });
  const now = new Date(), key = { endpoint: sub.endpoint };
  await col.updateOne(key, { $set: { profileId: req.user!.userId, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, updatedAt: now }, $setOnInsert: { id: await nextId(collections.pushSubscriptions), createdAt: now } }, { upsert: true });
  res.status(201).json({ enabled: true });
});
router.delete("/push/subscriptions", requireAuth, async (req, res) => {
  const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : "";
  if (!endpoint.startsWith("https://")) { res.status(400).json({ error: "Invalid subscription endpoint." }); return; }
  await (await getCollection(collections.pushSubscriptions)).deleteOne({ endpoint, profileId: req.user!.userId });
  res.sendStatus(204);
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
router.post("/notifications/read-all", requireAuth, async (req, res) => {
  const now = new Date();
  const result = await (await getCollection(collections.notifications)).updateMany({ profileId: req.user!.userId, readAt: null }, { $set: { readAt: now, updatedAt: now } });
  res.json({ updated: result.modifiedCount });
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
