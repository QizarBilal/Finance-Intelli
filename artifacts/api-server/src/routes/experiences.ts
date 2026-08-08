import { Router } from "express";
import { and, asc, desc, eq, gte, ilike, isNull, lte, or, sql } from "drizzle-orm";
import {
  accountsTable, accountBalanceSnapshotsTable, budgetsTable, creditSnapshotsTable, dashboardLayoutsTable, db, goalsTable,
  householdApprovalsTable, householdMembersTable, investmentsTable, monthlyReviewsTable, notificationPreferencesTable,
  notificationsTable, receiptsTable, remindersTable, subscriptionsTable, taxTagsTable, transactionsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { getAccountBalance } from "../lib/accounts";
import { writeAudit } from "../lib/audit";

const router = Router();
const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
const money = (value: unknown) => Number.isFinite(Number(value)) ? Math.abs(Number(value)) : 0;
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = (offset = 0) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + offset); return d.toISOString().slice(0, 10); };
const monthEnd = (offset = 0) => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() + offset + 1, 0); return d.toISOString().slice(0, 10); };

router.get("/command-center", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const [accounts, due, budgets, subscriptions, unread] = await Promise.all([
    db.select().from(accountsTable).where(and(eq(accountsTable.profileId, userId), isNull(accountsTable.archivedAt))),
    db.select().from(remindersTable).where(and(eq(remindersTable.profileId, userId), eq(remindersTable.isCompleted, false), lte(remindersTable.dueDate, new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)))).orderBy(asc(remindersTable.dueDate)),
    db.select().from(budgetsTable).where(eq(budgetsTable.profileId, userId)),
    db.select().from(subscriptionsTable).where(and(eq(subscriptionsTable.profileId, userId), eq(subscriptionsTable.status, "active"))),
    db.select({ count: sql<number>`count(*)::int` }).from(notificationsTable).where(and(eq(notificationsTable.profileId, userId), isNull(notificationsTable.readAt))),
  ]);
  const balances = await Promise.all(accounts.map(async account => ({ ...account, balance: await getAccountBalance(userId, account.id) })));
  const spent = await db.select({ category: transactionsTable.category, total: sql<string>`coalesce(sum(${transactionsTable.amount}),0)` }).from(transactionsTable)
    .where(and(eq(transactionsTable.profileId, userId), eq(transactionsTable.type, "expense"), gte(transactionsTable.date, monthStart()), lte(transactionsTable.date, monthEnd()), isNull(transactionsTable.deletedAt))).groupBy(transactionsTable.category);
  const spendMap = new Map(spent.map(row => [row.category?.toLowerCase(), Number(row.total)]));
  const tasks = [
    ...due.map(item => ({ id: `reminder-${item.id}`, priority: item.dueDate <= today() ? "urgent" : "soon", title: `${item.title} is due`, detail: item.amount ? `Prepare ${Number(item.amount).toFixed(2)}` : "Review and complete", href: "/reminders" })),
    ...budgets.filter(item => item.category && Number(item.amount) > 0 && (spendMap.get(item.category.toLowerCase()) ?? 0) / Number(item.amount) >= .8).map(item => ({ id: `budget-${item.id}`, priority: "warning", title: `${item.category} budget needs attention`, detail: `${Math.round(((spendMap.get(item.category!.toLowerCase()) ?? 0) / Number(item.amount)) * 100)}% used`, href: "/budgets" })),
    ...balances.filter(item => item.balance < 0).map(item => ({ id: `account-${item.id}`, priority: "urgent", title: `${item.name} is below zero`, detail: "Review recent activity and upcoming bills", href: "/accounts" })),
  ].slice(0, 12);
  res.json({ tasks, balances, upcomingBills: due, activeSubscriptions: subscriptions.length, unreadNotifications: unread[0]?.count ?? 0, allClear: tasks.length === 0 });
});

router.get("/subscriptions", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const explicit = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.profileId, userId)).orderBy(asc(subscriptionsTable.nextChargeDate));
  const candidates = await db.select({ merchant: sql<string>`coalesce(${transactionsTable.merchant}, ${transactionsTable.description})`, average: sql<string>`avg(${transactionsTable.amount})`, occurrences: sql<number>`count(*)::int`, lastCharge: sql<string>`max(${transactionsTable.date})` })
    .from(transactionsTable).where(and(eq(transactionsTable.profileId, userId), eq(transactionsTable.type, "expense"), gte(transactionsTable.date, new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10)), isNull(transactionsTable.deletedAt)))
    .groupBy(sql`coalesce(${transactionsTable.merchant}, ${transactionsTable.description})`).having(sql`count(*) >= 3`).orderBy(desc(sql`count(*)`)).limit(20);
  res.json({ subscriptions: explicit, detected: candidates.filter(item => !explicit.some(saved => saved.merchant.toLowerCase() === item.merchant?.toLowerCase())) });
});
router.post("/subscriptions", requireAuth, async (req, res) => {
  if (!clean(req.body?.merchant) || !money(req.body?.amount)) { res.status(400).json({ error: "Merchant and amount are required" }); return; }
  const [item] = await db.insert(subscriptionsTable).values({ profileId: req.user!.userId, merchant: clean(req.body.merchant), amount: String(money(req.body.amount)), frequency: clean(req.body.frequency) || "monthly", nextChargeDate: clean(req.body.nextChargeDate) || null, cancelUrl: clean(req.body.cancelUrl) || null, source: clean(req.body.source) || "manual" }).returning();
  res.status(201).json(item);
});
router.patch("/subscriptions/:id", requireAuth, async (req, res) => {
  const [item] = await db.update(subscriptionsTable).set({ status: ["active", "cancelled", "paused"].includes(req.body?.status) ? req.body.status : "active" }).where(and(eq(subscriptionsTable.id, Number(req.params.id)), eq(subscriptionsTable.profileId, req.user!.userId))).returning();
  res.json(item);
});

router.get("/net-worth", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const accounts = await db.select().from(accountsTable).where(and(eq(accountsTable.profileId, userId), isNull(accountsTable.archivedAt)));
  const current = await Promise.all(accounts.map(async item => ({ id: item.id, name: item.name, type: item.type, balance: await getAccountBalance(userId, item.id) })));
  const snapshots = await db.select().from(accountBalanceSnapshotsTable).where(eq(accountBalanceSnapshotsTable.profileId, userId)).orderBy(asc(accountBalanceSnapshotsTable.asOfDate));
  const timeline = new Map<string, number>(); snapshots.forEach(item => timeline.set(item.asOfDate, (timeline.get(item.asOfDate) ?? 0) + Number(item.balance)));
  const netWorth = current.reduce((sum, item) => sum + item.balance, 0); const milestones = [0, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];
  const next = milestones.find(value => value > netWorth) ?? Math.ceil(netWorth / 1_000_000 + 1) * 1_000_000;
  res.json({ netWorth, assets: current.filter(item => !["credit_card", "loan"].includes(item.type)).reduce((s, i) => s + Math.max(0, i.balance), 0), liabilities: current.filter(item => ["credit_card", "loan"].includes(item.type)).reduce((s, i) => s + Math.abs(Math.min(0, i.balance)), 0), accounts: current, timeline: [...timeline].map(([date, value]) => ({ date, value })), milestone: { next, remaining: Math.max(0, next - netWorth), progress: next > 0 ? Math.max(0, Math.min(100, netWorth / next * 100)) : 100 } });
});

router.get("/emergency-fund", requireAuth, async (req, res) => {
  const userId = req.user!.userId; const months = Math.min(12, Math.max(1, Number(req.query.months ?? 6)));
  const accounts = await db.select().from(accountsTable).where(and(eq(accountsTable.profileId, userId), isNull(accountsTable.archivedAt)));
  const liquid = (await Promise.all(accounts.filter(a => ["checking", "savings", "cash"].includes(a.type)).map(a => getAccountBalance(userId, a.id)))).reduce((a, b) => a + Math.max(0, b), 0);
  const since = new Date(); since.setUTCMonth(since.getUTCMonth() - 3);
  const [expense] = await db.select({ total: sql<string>`coalesce(sum(${transactionsTable.amount}),0)` }).from(transactionsTable).where(and(eq(transactionsTable.profileId, userId), eq(transactionsTable.type, "expense"), gte(transactionsTable.date, since.toISOString().slice(0, 10)), isNull(transactionsTable.deletedAt)));
  const monthlyEssentials = Number(expense?.total ?? 0) / 3; const target = monthlyEssentials * months;
  res.json({ liquid, monthlyEssentials, targetMonths: months, target, gap: Math.max(0, target - liquid), monthsCovered: monthlyEssentials ? liquid / monthlyEssentials : 0, ready: liquid >= target, explanation: "Liquid checking, savings, and cash balances compared with the trailing three-month average expense level." });
});

router.get("/tax", requireAuth, async (req, res) => {
  const year = Number(req.query.year ?? new Date().getFullYear());
  const rows = await db.select({ tag: taxTagsTable, transaction: transactionsTable }).from(taxTagsTable).innerJoin(transactionsTable, eq(transactionsTable.id, taxTagsTable.transactionId)).where(and(eq(taxTagsTable.profileId, req.user!.userId), eq(taxTagsTable.taxYear, year))).orderBy(desc(transactionsTable.date));
  res.json({ year, rows, deductibleTotal: rows.reduce((sum, row) => sum + Number(row.transaction.amount) * Number(row.tag.deductiblePercent) / 100, 0) });
});
router.post("/tax", requireAuth, async (req, res) => {
  const transactionId = Number(req.body?.transactionId); const [transaction] = await db.select({ id: transactionsTable.id }).from(transactionsTable).where(and(eq(transactionsTable.id, transactionId), eq(transactionsTable.profileId, req.user!.userId))).limit(1);
  if (!transaction || !clean(req.body?.classification)) { res.status(400).json({ error: "A valid transaction and classification are required" }); return; }
  const [tag] = await db.insert(taxTagsTable).values({ profileId: req.user!.userId, transactionId, taxYear: Number(req.body.taxYear ?? new Date().getFullYear()), classification: clean(req.body.classification), deductiblePercent: String(Math.min(100, money(req.body.deductiblePercent ?? 100))), note: clean(req.body.note) || null }).onConflictDoUpdate({ target: [taxTagsTable.profileId, taxTagsTable.transactionId], set: { classification: clean(req.body.classification), deductiblePercent: String(Math.min(100, money(req.body.deductiblePercent ?? 100))), note: clean(req.body.note) || null } }).returning();
  res.status(201).json(tag);
});

router.get("/receipts", requireAuth, async (req, res) => res.json(await db.select().from(receiptsTable).where(eq(receiptsTable.profileId, req.user!.userId)).orderBy(desc(receiptsTable.createdAt))));
router.post("/receipts", requireAuth, async (req, res) => {
  if (!clean(req.body?.filename)) { res.status(400).json({ error: "Filename is required" }); return; }
  const [receipt] = await db.insert(receiptsTable).values({ profileId: req.user!.userId, transactionId: req.body.transactionId ? Number(req.body.transactionId) : null, filename: clean(req.body.filename), storageKey: clean(req.body.storageKey) || null, merchant: clean(req.body.merchant) || null, amount: money(req.body.amount) ? String(money(req.body.amount)) : null, purchasedAt: clean(req.body.purchasedAt) || null, ocrStatus: clean(req.body.ocrStatus) || "manual_review", extractedData: req.body.extractedData ?? {} }).returning();
  res.status(201).json(receipt);
});

router.get("/cash-flow", requireAuth, async (req, res) => {
  const days = Math.min(90, Math.max(14, Number(req.query.days ?? 30))); const userId = req.user!.userId;
  const accounts = await db.select().from(accountsTable).where(and(eq(accountsTable.profileId, userId), isNull(accountsTable.archivedAt)));
  let balance = (await Promise.all(accounts.map(a => getAccountBalance(userId, a.id)))).reduce((a, b) => a + b, 0);
  const reminders = await db.select().from(remindersTable).where(and(eq(remindersTable.profileId, userId), eq(remindersTable.isCompleted, false), gte(remindersTable.dueDate, today()), lte(remindersTable.dueDate, new Date(Date.now() + days * 864e5).toISOString().slice(0, 10))));
  const events = reminders.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map(item => { balance -= Number(item.amount ?? 0); return { date: item.dueDate, title: item.title, amount: -Number(item.amount ?? 0), projectedBalance: balance, warning: balance < 0 }; });
  res.json({ openingBalance: events.length ? events[0].projectedBalance - events[0].amount : balance, events, lowestBalance: events.reduce((min, item) => Math.min(min, item.projectedBalance), balance), hasShortfall: events.some(item => item.warning) });
});

router.get("/reviews", requireAuth, async (req, res) => res.json(await db.select().from(monthlyReviewsTable).where(eq(monthlyReviewsTable.profileId, req.user!.userId)).orderBy(desc(monthlyReviewsTable.month))));
router.put("/reviews/:month", requireAuth, async (req, res) => {
  const month = String(req.params.month); if (!/^\d{4}-\d{2}$/.test(month)) { res.status(400).json({ error: "Invalid month" }); return; }
  const values = { profileId: req.user!.userId, month, step: Math.min(5, Math.max(1, Number(req.body?.step ?? 1))), status: req.body?.status === "completed" ? "completed" : "in_progress", answers: req.body?.answers ?? {}, completedAt: req.body?.status === "completed" ? new Date() : null };
  const [review] = await db.insert(monthlyReviewsTable).values(values).onConflictDoUpdate({ target: [monthlyReviewsTable.profileId, monthlyReviewsTable.month], set: values }).returning(); res.json(review);
});

router.get("/credit", requireAuth, async (req, res) => res.json(await db.select().from(creditSnapshotsTable).where(eq(creditSnapshotsTable.profileId, req.user!.userId)).orderBy(desc(creditSnapshotsTable.snapshotDate))));
router.post("/credit", requireAuth, async (req, res) => {
  const totalLimit = money(req.body?.totalLimit); const statementBalance = money(req.body?.statementBalance); const utilization = totalLimit ? statementBalance / totalLimit * 100 : money(req.body?.utilization);
  const [snapshot] = await db.insert(creditSnapshotsTable).values({ profileId: req.user!.userId, score: req.body.score ? Math.min(850, Math.max(300, Number(req.body.score))) : null, utilization: String(utilization), totalLimit: String(totalLimit), statementBalance: String(statementBalance), snapshotDate: clean(req.body.snapshotDate) || today(), source: "manual" }).onConflictDoUpdate({ target: [creditSnapshotsTable.profileId, creditSnapshotsTable.snapshotDate], set: { score: req.body.score ? Number(req.body.score) : null, utilization: String(utilization), totalLimit: String(totalLimit), statementBalance: String(statementBalance) } }).returning(); res.status(201).json(snapshot);
});

router.get("/investments", requireAuth, async (req, res) => {
  const rows = await db.select().from(investmentsTable).where(eq(investmentsTable.profileId, req.user!.userId)); const positions = rows.map(row => ({ ...row, value: Number(row.quantity) * Number(row.currentPrice), gain: Number(row.quantity) * Number(row.currentPrice) - Number(row.costBasis) }));
  const total = positions.reduce((s, p) => s + p.value, 0); res.json({ positions, total, allocation: Object.entries(positions.reduce<Record<string, number>>((map, p) => ({ ...map, [p.assetClass]: (map[p.assetClass] ?? 0) + p.value }), {})).map(([name, value]) => ({ name, value, percent: total ? value / total * 100 : 0 })) });
});
router.post("/investments", requireAuth, async (req, res) => {
  if (!clean(req.body?.symbol) || !clean(req.body?.name) || !money(req.body?.quantity) || !money(req.body?.currentPrice)) { res.status(400).json({ error: "Symbol, name, quantity, and current price are required" }); return; }
  const [position] = await db.insert(investmentsTable).values({ profileId: req.user!.userId, symbol: clean(req.body.symbol).toUpperCase(), name: clean(req.body.name), assetClass: clean(req.body.assetClass) || "Other", quantity: String(money(req.body.quantity)), costBasis: String(money(req.body.costBasis)), currentPrice: String(money(req.body.currentPrice)), accountId: req.body.accountId ? Number(req.body.accountId) : null }).returning(); res.status(201).json(position);
});

router.get("/dashboard-layouts", requireAuth, async (req, res) => res.json(await db.select().from(dashboardLayoutsTable).where(eq(dashboardLayoutsTable.profileId, req.user!.userId))));
router.post("/dashboard-layouts", requireAuth, async (req, res) => {
  const name = clean(req.body?.name); if (!name || !Array.isArray(req.body?.widgets)) { res.status(400).json({ error: "Name and widget list are required" }); return; }
  const [layout] = await db.insert(dashboardLayoutsTable).values({ profileId: req.user!.userId, name, widgets: req.body.widgets, isDefault: Boolean(req.body.isDefault) }).onConflictDoUpdate({ target: [dashboardLayoutsTable.profileId, dashboardLayoutsTable.name], set: { widgets: req.body.widgets, isDefault: Boolean(req.body.isDefault) } }).returning(); res.status(201).json(layout);
});

router.get("/notifications", requireAuth, async (req, res) => {
  const [items, preferences] = await Promise.all([db.select().from(notificationsTable).where(eq(notificationsTable.profileId, req.user!.userId)).orderBy(desc(notificationsTable.createdAt)).limit(100), db.select().from(notificationPreferencesTable).where(eq(notificationPreferencesTable.profileId, req.user!.userId)).limit(1)]); res.json({ items, preferences: preferences[0] ?? null });
});
router.put("/notification-preferences", requireAuth, async (req, res) => {
  const values = { profileId: req.user!.userId, lowBalance: req.body?.lowBalance !== false, bills: req.body?.bills !== false, budgets: req.body?.budgets !== false, subscriptions: req.body?.subscriptions !== false, weeklyDigest: req.body?.weeklyDigest !== false, lowBalanceThreshold: String(money(req.body?.lowBalanceThreshold ?? 500)) };
  const [prefs] = await db.insert(notificationPreferencesTable).values(values).onConflictDoUpdate({ target: notificationPreferencesTable.profileId, set: values }).returning(); res.json(prefs);
});
router.patch("/notifications/:id/read", requireAuth, async (req, res) => { const [item] = await db.update(notificationsTable).set({ readAt: new Date() }).where(and(eq(notificationsTable.id, Number(req.params.id)), eq(notificationsTable.profileId, req.user!.userId))).returning(); res.json(item); });

router.get("/search", requireAuth, async (req, res) => {
  const q = clean(req.query.q); if (q.length < 2) { res.json([]); return; } const pattern = `%${q.replace(/[%_]/g, "")}%`; const userId = req.user!.userId;
  const [txs, accounts, goals] = await Promise.all([db.select().from(transactionsTable).where(and(eq(transactionsTable.profileId, userId), or(ilike(transactionsTable.description, pattern), ilike(transactionsTable.merchant, pattern), ilike(transactionsTable.category, pattern)), isNull(transactionsTable.deletedAt))).limit(8), db.select().from(accountsTable).where(and(eq(accountsTable.profileId, userId), ilike(accountsTable.name, pattern), isNull(accountsTable.archivedAt))).limit(5), db.select().from(goalsTable).where(and(eq(goalsTable.profileId, userId), ilike(goalsTable.name, pattern), isNull(goalsTable.archivedAt))).limit(5)]);
  res.json([...txs.map(x => ({ type: "transaction", id: x.id, title: x.description || x.merchant || "Transaction", subtitle: `${x.date} · ${x.amount}`, href: "/transactions" })), ...accounts.map(x => ({ type: "account", id: x.id, title: x.name, subtitle: x.type, href: "/accounts" })), ...goals.map(x => ({ type: "goal", id: x.id, title: x.name, subtitle: `${x.currentAmount} of ${x.targetAmount}`, href: "/goals" }))]);
});

router.get("/household-approvals", requireAuth, async (req, res) => {
  const memberships = await db.select({ id: householdMembersTable.householdId }).from(householdMembersTable).where(and(eq(householdMembersTable.profileId, req.user!.userId), eq(householdMembersTable.status, "active"))); if (!memberships.length) { res.json([]); return; }
  res.json(await db.select().from(householdApprovalsTable).where(sql`${householdApprovalsTable.householdId} in (${sql.join(memberships.map(x => sql`${x.id}`), sql`,`)})`).orderBy(desc(householdApprovalsTable.createdAt)));
});
router.post("/household-approvals", requireAuth, async (req, res) => {
  const householdId = Number(req.body?.householdId); const [member] = await db.select().from(householdMembersTable).where(and(eq(householdMembersTable.householdId, householdId), eq(householdMembersTable.profileId, req.user!.userId), eq(householdMembersTable.status, "active"))).limit(1); if (!member || !clean(req.body?.title)) { res.status(403).json({ error: "Active household membership and title are required" }); return; }
  const [approval] = await db.insert(householdApprovalsTable).values({ householdId, requestedByProfileId: req.user!.userId, type: clean(req.body.type) || "expense", title: clean(req.body.title), amount: money(req.body.amount) ? String(money(req.body.amount)) : null, payload: req.body.payload ?? {} }).returning(); res.status(201).json(approval);
});
router.patch("/household-approvals/:id", requireAuth, async (req, res) => {
  const status = req.body?.status; if (!["approved", "rejected"].includes(status)) { res.status(400).json({ error: "Status must be approved or rejected" }); return; }
  const [approval] = await db.select().from(householdApprovalsTable).where(eq(householdApprovalsTable.id, Number(req.params.id))).limit(1); if (!approval) { res.sendStatus(404); return; }
  const [member] = await db.select().from(householdMembersTable).where(and(eq(householdMembersTable.householdId, approval.householdId), eq(householdMembersTable.profileId, req.user!.userId), eq(householdMembersTable.status, "active"))).limit(1); if (!member || !["owner", "admin"].includes(member.role)) { res.sendStatus(403); return; }
  const [updated] = await db.update(householdApprovalsTable).set({ status, decidedByProfileId: req.user!.userId, decidedAt: new Date() }).where(eq(householdApprovalsTable.id, approval.id)).returning(); await writeAudit(req, status, "household_approval", approval.id, approval, updated); res.json(updated);
});

export default router;
