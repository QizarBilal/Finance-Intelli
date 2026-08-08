import { createHash, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { Router } from "express";
import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import {
  accountsTable, auditLogsTable, budgetsTable, categorizationRulesTable, categoriesTable, db,
  goalsTable, householdMembersTable, householdsTable, importBatchesTable, jobsTable,
  profileTable, remindersTable, savedViewsTable, sessionsTable, transactionsTable,
} from "@workspace/db";
import { requireAuth, revokeSession } from "../middlewares/auth";
import { getAccountBalance } from "../lib/accounts";
import { writeAudit } from "../lib/audit";

const router = Router();
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const fingerprint = (accountId: number, date: string, amount: number, description: string) =>
  createHash("sha256").update([accountId, date, amount.toFixed(2), description.toLowerCase().replace(/\s+/g, " ")].join("|")).digest("hex");

function parseCsv(input: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let value = ""; let quoted = false;
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (char === '"' && quoted && input[index + 1] === '"') { value += '"'; index++; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(value.trim()); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[index + 1] === "\n") index++;
      row.push(value.trim()); value = ""; if (row.some(Boolean)) rows.push(row); row = [];
    } else value += char;
  }
  row.push(value.trim()); if (row.some(Boolean)) rows.push(row);
  return rows;
}

router.get("/rules", requireAuth, async (req, res) => {
  res.json(await db.select().from(categorizationRulesTable)
    .where(eq(categorizationRulesTable.profileId, req.user!.userId)).orderBy(categorizationRulesTable.priority));
});
router.post("/rules", requireAuth, async (req, res) => {
  const { name, field, operator, value, categoryId, merchant, priority = 100 } = req.body ?? {};
  if (!text(name) || !["description", "merchant", "amount"].includes(field) || !["contains", "equals", "starts_with", "greater_than", "less_than"].includes(operator) || !text(String(value ?? ""))) {
    res.status(400).json({ error: "Valid rule name, field, operator and value are required." }); return;
  }
  const [rule] = await db.insert(categorizationRulesTable).values({
    profileId: req.user!.userId, name: text(name), field, operator, value: text(String(value)),
    categoryId: categoryId ? Number(categoryId) : null, merchant: text(merchant) || null, priority: Number(priority),
  }).returning();
  await writeAudit(req, "create", "categorization_rule", rule.id, null, rule);
  res.status(201).json(rule);
});
router.delete("/rules/:id", requireAuth, async (req, res) => {
  const [deleted] = await db.delete(categorizationRulesTable).where(and(
    eq(categorizationRulesTable.id, Number(req.params.id)), eq(categorizationRulesTable.profileId, req.user!.userId),
  )).returning();
  if (!deleted) { res.status(404).json({ error: "Rule not found" }); return; }
  res.sendStatus(204);
});

router.post("/imports/preview", requireAuth, async (req, res) => {
  const accountId = Number(req.body?.accountId);
  const csv = text(req.body?.csv);
  const mapping = req.body?.mapping ?? { date: "Date", amount: "Amount", description: "Description", type: "Type", category: "Category" };
  const [account] = await db.select({ id: accountsTable.id }).from(accountsTable).where(and(
    eq(accountsTable.id, accountId), eq(accountsTable.profileId, req.user!.userId),
  )).limit(1);
  if (!account || !csv) { res.status(400).json({ error: "An account and CSV content are required." }); return; }
  const parsed = parseCsv(csv);
  const headers = parsed.shift() ?? [];
  const column = (name: string) => headers.findIndex(header => header.toLowerCase() === text(mapping[name]).toLowerCase());
  const rows = parsed.slice(0, 10_000).map((cells, index) => {
    const rawAmount = Number(cells[column("amount")]?.replace(/[^0-9.-]/g, ""));
    const rawType = cells[column("type")]?.toLowerCase();
    const type = rawType === "income" || rawAmount > 0 ? "income" : "expense";
    const amount = Math.abs(rawAmount);
    const date = cells[column("date")] ?? "";
    const description = cells[column("description")] ?? "";
    return { row: index + 2, date, amount, type, description, category: cells[column("category")] || null,
      fingerprint: fingerprint(accountId, date, amount, description), valid: /^\d{4}-\d{2}-\d{2}$/.test(date) && amount > 0 };
  });
  const fingerprints = rows.map(row => row.fingerprint);
  const duplicates = fingerprints.length ? await db.select({ fingerprint: transactionsTable.fingerprint }).from(transactionsTable)
    .where(and(eq(transactionsTable.profileId, req.user!.userId), inArray(transactionsTable.fingerprint, fingerprints))) : [];
  const duplicateSet = new Set(duplicates.map(row => row.fingerprint));
  const preview = rows.map(row => ({ ...row, duplicate: duplicateSet.has(row.fingerprint) }));
  const [batch] = await db.insert(importBatchesTable).values({
    profileId: req.user!.userId, accountId, filename: text(req.body?.filename) || "statement.csv",
    totalRows: rows.length, duplicateRows: preview.filter(row => row.duplicate).length, mapping,
  }).returning();
  res.json({ batchId: batch.id, headers, rows: preview, validRows: preview.filter(row => row.valid && !row.duplicate).length });
});

router.post("/imports/:batchId/commit", requireAuth, async (req, res) => {
  const batchId = Number(req.params.batchId);
  const [batch] = await db.select().from(importBatchesTable).where(and(
    eq(importBatchesTable.id, batchId), eq(importBatchesTable.profileId, req.user!.userId), eq(importBatchesTable.status, "preview"),
  )).limit(1);
  if (!batch || !Array.isArray(req.body?.rows)) { res.status(400).json({ error: "Import preview is missing or already committed." }); return; }
  const rows = req.body.rows.filter((row: any) => row.valid && !row.duplicate).slice(0, 10_000);
  const rules = await db.select().from(categorizationRulesTable).where(and(
    eq(categorizationRulesTable.profileId, req.user!.userId), eq(categorizationRulesTable.enabled, true),
  )).orderBy(asc(categorizationRulesTable.priority));
  const categories = await db.select().from(categoriesTable).where(eq(categoriesTable.profileId, req.user!.userId));
  const created = await db.transaction(async tx => {
    const values = rows.map((row: any) => {
      const matched = rules.find(rule => {
        const actual = String(row[rule.field] ?? "").toLowerCase(); const expected = rule.value.toLowerCase();
        return rule.operator === "contains" ? actual.includes(expected) : rule.operator === "starts_with" ? actual.startsWith(expected) :
          rule.operator === "equals" ? actual === expected : rule.operator === "greater_than" ? Number(actual) > Number(expected) : Number(actual) < Number(expected);
      });
      const category = matched?.categoryId ? categories.find(item => item.id === matched.categoryId) : null;
      return {
        profileId: req.user!.userId, accountId: batch.accountId, categoryId: category?.id ?? null,
        type: row.type, direction: row.type === "income" ? "credit" : "debit", amount: String(row.amount),
        date: row.date, description: row.description || null, category: category?.name ?? row.category ?? null,
        merchant: matched?.merchant ?? null, status: "cleared", fingerprint: row.fingerprint,
      };
    });
    const inserted = values.length ? await tx.insert(transactionsTable).values(values).onConflictDoNothing().returning() : [];
    await tx.update(importBatchesTable).set({ status: "completed", importedRows: inserted.length }).where(eq(importBatchesTable.id, batch.id));
    return inserted;
  });
  await writeAudit(req, "import", "import_batch", batch.id, null, { imported: created.length });
  res.status(201).json({ imported: created.length });
});

router.get("/planning/forecast", requireAuth, async (req, res) => {
  const days = Math.min(365, Math.max(7, Number(req.query.days ?? 90)));
  const since = new Date(); since.setDate(since.getDate() - 90);
  const [accounts, movement, reminders] = await Promise.all([
    db.select().from(accountsTable).where(and(eq(accountsTable.profileId, req.user!.userId), isNull(accountsTable.archivedAt))),
    db.select({ total: sql<string>`coalesce(sum(case when ${transactionsTable.direction}='credit' then ${transactionsTable.amount} else -${transactionsTable.amount} end),0)` })
      .from(transactionsTable).where(and(eq(transactionsTable.profileId, req.user!.userId), gte(transactionsTable.date, since.toISOString().slice(0, 10)), isNull(transactionsTable.deletedAt))),
    db.select().from(remindersTable).where(and(eq(remindersTable.profileId, req.user!.userId), eq(remindersTable.isCompleted, false))),
  ]);
  const current = (await Promise.all(accounts.map(account => getAccountBalance(req.user!.userId, account.id)))).reduce((sum, value) => sum + value, 0);
  const dailyAverage = Number(movement[0]?.total ?? 0) / 90;
  const due = reminders.filter(item => item.dueDate <= new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10))
    .reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
  res.json({ currentBalance: current, days, dailyAverage, scheduledOutflow: due, projectedBalance: current + dailyAverage * days - due,
    explanation: "Current cleared balances plus the trailing 90-day average movement, less scheduled reminders." });
});

router.get("/planning/debt-payoff", requireAuth, async (req, res) => {
  const strategy = req.query.strategy === "avalanche" ? "avalanche" : "snowball";
  const debts = await db.select().from(accountsTable).where(and(
    eq(accountsTable.profileId, req.user!.userId), sql`${accountsTable.type} in ('credit_card','loan')`, isNull(accountsTable.archivedAt),
  ));
  const enriched = await Promise.all(debts.map(async account => ({ account, balance: Math.abs(await getAccountBalance(req.user!.userId, account.id)) })));
  enriched.sort((a, b) => strategy === "avalanche" ? Number(b.account.interestRate ?? 0) - Number(a.account.interestRate ?? 0) : a.balance - b.balance);
  res.json({ strategy, order: enriched.map(({ account, balance }) => ({ id: account.id, name: account.name, balance, interestRate: Number(account.interestRate ?? 0), minimumPayment: Number(account.minimumPayment ?? 0) })) });
});

router.get("/saved-views", requireAuth, async (req, res) => {
  res.json(await db.select().from(savedViewsTable).where(eq(savedViewsTable.profileId, req.user!.userId)));
});
router.post("/saved-views", requireAuth, async (req, res) => {
  const [view] = await db.insert(savedViewsTable).values({
    profileId: req.user!.userId, name: text(req.body?.name), scope: text(req.body?.scope), filters: req.body?.filters ?? {},
    isDefault: Boolean(req.body?.isDefault),
  }).onConflictDoUpdate({
    target: [savedViewsTable.profileId, savedViewsTable.scope, savedViewsTable.name],
    set: { filters: req.body?.filters ?? {}, isDefault: Boolean(req.body?.isDefault) },
  }).returning();
  res.status(201).json(view);
});

router.post("/jobs", requireAuth, async (req, res) => {
  const allowed = new Set(["recurring", "report", "receipt", "bank_sync", "export", "notification"]);
  if (!allowed.has(req.body?.type)) { res.status(400).json({ error: "Unsupported job type" }); return; }
  const [job] = await db.insert(jobsTable).values({
    profileId: req.user!.userId, type: req.body.type, payload: req.body.payload ?? {},
    runAt: req.body.runAt ? new Date(req.body.runAt) : new Date(),
    idempotencyKey: text(req.body.idempotencyKey) || randomUUID(),
  }).onConflictDoNothing().returning();
  res.status(job ? 201 : 200).json(job ?? { duplicate: true });
});

router.post("/households", requireAuth, async (req, res) => {
  if (!text(req.body?.name)) { res.status(400).json({ error: "Household name is required" }); return; }
  const household = await db.transaction(async tx => {
    const [created] = await tx.insert(householdsTable).values({ name: text(req.body.name), ownerProfileId: req.user!.userId }).returning();
    await tx.insert(householdMembersTable).values({ householdId: created.id, profileId: req.user!.userId, role: "owner" });
    return created;
  });
  res.status(201).json(household);
});
router.get("/households", requireAuth, async (req, res) => {
  res.json(await db.select({ household: householdsTable, role: householdMembersTable.role })
    .from(householdMembersTable).innerJoin(householdsTable, eq(householdsTable.id, householdMembersTable.householdId))
    .where(and(eq(householdMembersTable.profileId, req.user!.userId), eq(householdMembersTable.status, "active"))));
});

router.get("/privacy/export", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const [profile, accounts, transactions, budgets, goals, reminders, audit] = await Promise.all([
    db.select().from(profileTable).where(eq(profileTable.id, userId)),
    db.select().from(accountsTable).where(eq(accountsTable.profileId, userId)),
    db.select().from(transactionsTable).where(eq(transactionsTable.profileId, userId)),
    db.select().from(budgetsTable).where(eq(budgetsTable.profileId, userId)),
    db.select().from(goalsTable).where(eq(goalsTable.profileId, userId)),
    db.select().from(remindersTable).where(eq(remindersTable.profileId, userId)),
    db.select().from(auditLogsTable).where(eq(auditLogsTable.profileId, userId)),
  ]);
  const safeProfile = profile.map(({ passwordHash: _passwordHash, ...item }) => item);
  res.setHeader("Content-Disposition", 'attachment; filename="finance-intelli-data.json"');
  res.json({ exportedAt: new Date().toISOString(), profile: safeProfile, accounts, transactions, budgets, goals, reminders, audit });
});

router.delete("/privacy/account", requireAuth, async (req, res) => {
  const [profile] = await db.select().from(profileTable).where(eq(profileTable.id, req.user!.userId)).limit(1);
  if (!profile || !await bcrypt.compare(text(req.body?.password), profile.passwordHash)) {
    res.status(403).json({ error: "Password confirmation failed" }); return;
  }
  await writeAudit(req, "delete_account", "profile", profile.id);
  await db.delete(profileTable).where(eq(profileTable.id, profile.id));
  await revokeSession(req, res);
  res.sendStatus(204);
});

export default router;
