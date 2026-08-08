import { Router, type Request } from "express";
import bcrypt from "bcryptjs";
import { mongo, nextId, publicDocument } from "@workspace/db/mongo";
import { issueSession, requireAuth, revokeSession, rotateSession } from "../middlewares/auth";

const router = Router();
const now = () => new Date();
const clean = (value: unknown) => String(value ?? "").trim();
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const userId = (req: Request) => req.user!.userId;
const expose = (row: any) => publicDocument(row) ?? row;
const collection = async (name: string) => (await mongo()).db.collection<any>(name);
const owned = (req: Request, extra: Record<string, unknown> = {}) => ({ profileId: userId(req), ...extra });

async function createOwned(req: Request, name: string, values: Record<string, unknown>) {
  const id = await nextId(name);
  const row = { id, profileId: userId(req), ...values, createdAt: now(), updatedAt: now() };
  await (await collection(name)).insertOne(row);
  return expose(row);
}

router.post(["/auth/signup", "/auth/setup"], async (req, res) => {
  const username = clean(req.body.username).toLowerCase();
  const password = clean(req.body.password);
  const email = clean(req.body.email).toLowerCase() || undefined;
  if (username.length < 3 || password.length < 8) { res.status(400).json({ error: "Username and an 8-character password are required" }); return; }
  const profiles = await collection("profiles");
  if (await profiles.findOne({ $or: [{ username }, ...(email ? [{ email }] : [])] })) { res.status(409).json({ error: "Account already exists" }); return; }
  const id = await nextId("profiles");
  const profile = { id, username, ...(email ? { email } : {}), passwordHash: await bcrypt.hash(password, 12), name: clean(req.body.name) || username, occupation: clean(req.body.occupation) || undefined, jobStatus: clean(req.body.jobStatus) || undefined, currency: clean(req.body.currency) || "INR", timezone: "UTC", theme: clean(req.body.theme) || "system", weekStarts: "monday", setupCompleted: true, failedLoginCount: 0, createdAt: now(), updatedAt: now() };
  await profiles.insertOne(profile);
  await issueSession(req, res, profile);
  res.status(201).json({ user: { id, username, name: profile.name, email: profile.email } });
});

router.post("/auth/login", async (req, res) => {
  const username = clean(req.body.username).toLowerCase();
  const profiles = await collection("profiles");
  const profile = await profiles.findOne({ username });
  if (!profile || !(await bcrypt.compare(clean(req.body.password), profile.passwordHash))) { res.status(401).json({ error: "Invalid username or password" }); return; }
  await issueSession(req, res, profile, req.body.rememberMe !== false);
  res.json({ user: { id: profile.id, username: profile.username, name: profile.name, email: profile.email } });
});
router.post("/auth/refresh", async (req, res) => { const payload = await rotateSession(req, res); payload ? res.json({ ok: true }) : res.status(401).json({ error: "Invalid session" }); });
router.post("/auth/logout", async (req, res) => { await revokeSession(req, res); res.json({ ok: true }); });

router.get(["/profile", "/auth/me"], requireAuth, async (req, res) => { const row = await (await collection("profiles")).findOne({ id: userId(req) }, { projection: { passwordHash: 0 } }); res.json(expose(row)); });
router.get("/profile/setup-status", requireAuth, async (req, res) => { const row = await (await collection("profiles")).findOne({ id: userId(req) }, { projection: { setupCompleted: 1 } }); res.json({ setupCompleted: Boolean(row?.setupCompleted) }); });
router.post("/profile/setup", requireAuth, async (req, res) => { const values = { name: clean(req.body.name), currency: clean(req.body.currency) || "USD", timezone: clean(req.body.timezone) || "UTC", weekStarts: clean(req.body.weekStarts) || "monday", setupCompleted: true, updatedAt: now() }; const profiles = await collection("profiles"); await profiles.updateOne({ id: userId(req) }, { $set: values }); res.json(expose(await profiles.findOne({ id: userId(req) }, { projection: { passwordHash: 0 } }))); });
router.patch("/profile", requireAuth, async (req, res) => { const allowed = ["name", "email", "currency", "timezone", "theme", "weekStarts"]; const values = Object.fromEntries(allowed.filter(k => req.body[k] !== undefined).map(k => [k, clean(req.body[k])])); const profiles = await collection("profiles"); await profiles.updateOne({ id: userId(req) }, { $set: { ...values, updatedAt: now() } }); res.json(expose(await profiles.findOne({ id: userId(req) }, { projection: { passwordHash: 0 } }))); });
router.post("/profile/password", requireAuth, async (req, res) => { const profiles = await collection("profiles"); const row = await profiles.findOne({ id: userId(req) }); if (!row || !(await bcrypt.compare(clean(req.body.currentPassword), row.passwordHash)) || clean(req.body.newPassword).length < 8) { res.status(400).json({ error: "Current password or new password is invalid" }); return; } await profiles.updateOne({ id: row.id }, { $set: { passwordHash: await bcrypt.hash(clean(req.body.newPassword), 12), updatedAt: now() } }); await (await collection("sessions")).updateMany({ profileId: row.id }, { $set: { revokedAt: now() } }); res.json({ ok: true }); });

const resources: Record<string, { date?: string; defaults?: Record<string, unknown> }> = {
  accounts: { defaults: { type: "checking", currency: "USD", openingBalance: 0, currentBalance: 0, status: "active", version: 1 } },
  categories: { defaults: { type: "expense", color: "#64748b", icon: "circle" } },
  budgets: { defaults: { period: "monthly", spent: 0 } }, goals: { defaults: { currentAmount: 0, priority: "medium" } },
  reminders: { date: "dueDate", defaults: { type: "other", isCompleted: false } },
};

for (const [name, config] of Object.entries(resources)) {
  router.get(`/${name}`, requireAuth, async (req, res) => { const query: any = owned(req); if (name === "accounts") query.status = { $ne: "archived" }; else query.archivedAt = null; const rows = await (await collection(name)).find(query).sort(config.date ? { [config.date]: 1 } : { createdAt: -1 }).toArray(); res.json(rows.map(expose)); });
  router.post(`/${name}`, requireAuth, async (req, res) => { const values: any = { ...config.defaults, ...req.body }; for (const key of ["amount", "limitAmount", "targetAmount", "currentAmount", "openingBalance", "currentBalance"]) if (values[key] !== undefined) values[key] = number(values[key]); const row = await createOwned(req, name, values); res.status(201).json(row); });
  router.patch(`/${name}/:id`, requireAuth, async (req, res) => { const rows = await collection(name); const id = number(req.params.id); const values: any = { ...req.body, updatedAt: now() }; for (const key of ["amount", "limitAmount", "targetAmount", "currentAmount", "openingBalance", "currentBalance"]) if (values[key] !== undefined) values[key] = number(values[key]); await rows.updateOne(owned(req, { id }), { $set: values }); const row = await rows.findOne(owned(req, { id })); row ? res.json(expose(row)) : res.sendStatus(404); });
  router.delete(`/${name}/:id`, requireAuth, async (req, res) => { const rows = await collection(name); const id = number(req.params.id); if (["accounts", "budgets", "goals"].includes(name)) await rows.updateOne(owned(req, { id }), { $set: { archivedAt: now(), status: name === "accounts" ? "archived" : undefined, updatedAt: now() } }); else await rows.deleteOne(owned(req, { id })); res.json({ ok: true }); });
}

router.get("/transactions", requireAuth, async (req, res) => { const query: any = owned(req, { deletedAt: null }); if (req.query.type) query.type = req.query.type; if (req.query.accountId) query.accountId = number(req.query.accountId); if (req.query.search) query.$or = ["description", "merchant", "category"].map(field => ({ [field]: { $regex: clean(req.query.search), $options: "i" } })); const limit = Math.min(10000, Math.max(1, number(req.query.limit) || 50)); const page = Math.max(1, number(req.query.page) || 1); const rows = await collection("transactions"); const [items, total] = await Promise.all([rows.find(query).sort({ date: -1, id: -1 }).skip((page - 1) * limit).limit(limit).toArray(), rows.countDocuments(query)]); res.json({ items: items.map(expose), total, page, limit }); });
router.post("/transactions", requireAuth, async (req, res) => { const amount = Math.abs(number(req.body.amount)); const row = await createOwned(req, "transactions", { ...req.body, amount, type: req.body.type || "expense", direction: req.body.direction || (req.body.type === "income" ? "credit" : "debit"), date: clean(req.body.date) || new Date().toISOString().slice(0, 10), deletedAt: null }); res.status(201).json(row); });
router.patch("/transactions/:id", requireAuth, async (req, res) => { const rows = await collection("transactions"); const id = number(req.params.id); const values = { ...req.body, ...(req.body.amount !== undefined ? { amount: Math.abs(number(req.body.amount)) } : {}), updatedAt: now() }; await rows.updateOne(owned(req, { id }), { $set: values }); res.json(expose(await rows.findOne(owned(req, { id })))); });
router.delete("/transactions/:id", requireAuth, async (req, res) => { await (await collection("transactions")).updateOne(owned(req, { id: number(req.params.id) }), { $set: { deletedAt: now(), updatedAt: now() } }); res.json({ ok: true }); });

router.post("/accounts/:id/transfer", requireAuth, async (req, res) => { const accounts = await collection("accounts"); const fromId = number(req.params.id), toId = number(req.body.toAccountId), amount = Math.abs(number(req.body.amount)); if (!amount || fromId === toId) { res.status(400).json({ error: "Valid transfer is required" }); return; } await accounts.updateOne(owned(req, { id: fromId }), { $inc: { currentBalance: -amount }, $set: { updatedAt: now() } }); await accounts.updateOne(owned(req, { id: toId }), { $inc: { currentBalance: amount }, $set: { updatedAt: now() } }); const date = new Date().toISOString().slice(0, 10); await createOwned(req, "transactions", { accountId: fromId, amount, type: "transfer", direction: "debit", description: clean(req.body.description) || "Account transfer", date, deletedAt: null }); await createOwned(req, "transactions", { accountId: toId, amount, type: "transfer", direction: "credit", description: clean(req.body.description) || "Account transfer", date, deletedAt: null }); res.json({ ok: true }); });

async function transactionTotals(req: Request, since?: string) { const match: any = owned(req, { deletedAt: null }); if (since) match.date = { $gte: since }; const rows = await (await collection("transactions")).aggregate([{ $match: match }, { $group: { _id: "$type", total: { $sum: "$amount" } } }]).toArray(); return Object.fromEntries(rows.map((x: any) => [x._id, x.total])); }
router.get("/dashboard/summary", requireAuth, async (req, res) => { const month = new Date().toISOString().slice(0, 7) + "-01"; const totals = await transactionTotals(req, month); const accounts = await (await collection("accounts")).find(owned(req, { status: { $ne: "archived" } })).toArray(); res.json({ totalIncome: totals.income || 0, totalExpense: totals.expense || 0, balance: accounts.reduce((s: number, a: any) => s + number(a.currentBalance), 0), savings: (totals.income || 0) - (totals.expense || 0), savingsRate: totals.income ? (((totals.income || 0) - (totals.expense || 0)) / totals.income) * 100 : 0 }); });
router.get("/dashboard/recent-transactions", requireAuth, async (req, res) => { const rows = await (await collection("transactions")).find(owned(req, { deletedAt: null })).sort({ date: -1 }).limit(Math.min(20, number(req.query.limit) || 5)).toArray(); res.json(rows.map(expose)); });
router.get("/dashboard/upcoming-reminders", requireAuth, async (req, res) => { const rows = await (await collection("reminders")).find(owned(req, { isCompleted: false })).sort({ dueDate: 1 }).limit(Math.min(20, number(req.query.limit) || 5)).toArray(); res.json(rows.map(expose)); });
router.get("/analytics/categories", requireAuth, async (req, res) => { const rows = await (await collection("transactions")).aggregate([{ $match: owned(req, { type: clean(req.query.type) || "expense", deletedAt: null }) }, { $group: { _id: "$category", amount: { $sum: "$amount" } } }, { $sort: { amount: -1 } }]).toArray(); res.json(rows.map((x: any) => ({ category: x._id || "Uncategorized", amount: x.amount }))); });
router.get("/analytics/trends", requireAuth, async (req, res) => { const rows = await (await collection("transactions")).aggregate([{ $match: owned(req, { deletedAt: null }) }, { $group: { _id: { $substr: ["$date", 0, 7] }, income: { $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] } }, expense: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0] } } } }, { $sort: { _id: 1 } }]).toArray(); res.json(rows.map((x: any) => ({ period: x._id, income: x.income, expense: x.expense }))); });
router.get("/analytics/calendar", requireAuth, async (req, res) => { const rows = await (await collection("transactions")).aggregate([{ $match: owned(req, { deletedAt: null }) }, { $group: { _id: "$date", income: { $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] } }, expense: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0] } } } }]).toArray(); res.json(rows.map((x: any) => ({ date: x._id, income: x.income, expense: x.expense }))); });
router.get("/insights", requireAuth, async (req, res) => { const totals = await transactionTotals(req); const insights = []; if ((totals.expense || 0) > (totals.income || 0)) insights.push({ id: "cashflow", type: "warning", severity: "high", title: "Expenses exceed income", message: "Review recent spending and upcoming commitments." }); res.json(insights); });

const simpleNames = ["subscriptions", "receipts", "credit", "investments", "dashboard-layouts", "households", "household-approvals", "notifications"];
for (const name of simpleNames) {
  router.get(`/${name}`, requireAuth, async (req, res) => { const rows = await (await collection(name)).find(owned(req)).sort({ createdAt: -1 }).limit(200).toArray(); res.json(rows.map(expose)); });
  router.post(`/${name}`, requireAuth, async (req, res) => { res.status(201).json(await createOwned(req, name, req.body)); });
  router.patch(`/${name}/:id`, requireAuth, async (req, res) => { const rows = await collection(name); const id = number(req.params.id); await rows.updateOne(owned(req, { id }), { $set: { ...req.body, updatedAt: now() } }); res.json(expose(await rows.findOne(owned(req, { id })))); });
}
router.put("/reviews/:month", requireAuth, async (req, res) => { const rows = await collection("reviews"); const key = owned(req, { month: clean(req.params.month) }); await rows.updateOne(key, { $set: { ...req.body, ...key, updatedAt: now() }, $setOnInsert: { id: await nextId("reviews"), createdAt: now() } }, { upsert: true }); res.json(expose(await rows.findOne(key))); });
router.get("/reviews", requireAuth, async (req, res) => { res.json((await (await collection("reviews")).find(owned(req)).sort({ month: -1 }).toArray()).map(expose)); });
router.put("/notification-preferences", requireAuth, async (req, res) => { const rows = await collection("notification-preferences"); await rows.updateOne(owned(req), { $set: { ...req.body, ...owned(req), updatedAt: now() } }, { upsert: true }); res.json(expose(await rows.findOne(owned(req)))); });
router.get("/search", requireAuth, async (req, res) => { const q = clean(req.query.q); if (q.length < 2) { res.json([]); return; } const regex = { $regex: q, $options: "i" }; const [transactions, accounts, goals] = await Promise.all([(await collection("transactions")).find(owned(req, { $or: [{ description: regex }, { merchant: regex }, { category: regex }], deletedAt: null })).limit(8).toArray(), (await collection("accounts")).find(owned(req, { name: regex })).limit(5).toArray(), (await collection("goals")).find(owned(req, { name: regex })).limit(5).toArray()]); res.json([...transactions.map((x: any) => ({ ...expose(x), resultType: "transaction" })), ...accounts.map((x: any) => ({ ...expose(x), resultType: "account" })), ...goals.map((x: any) => ({ ...expose(x), resultType: "goal" }))]); });
router.post("/reset", requireAuth, async (req, res) => { const names = ["transactions", "categories", "budgets", "goals", "reminders", "accounts", ...simpleNames, "reviews", "notification-preferences"]; await Promise.all(names.map(async name => (await collection(name)).deleteMany(owned(req)))); res.json({ ok: true }); });

export default router;
