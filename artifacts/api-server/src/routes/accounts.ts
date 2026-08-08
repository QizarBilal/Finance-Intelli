import { randomUUID } from "node:crypto";
import { Router } from "express";
import { accountBalanceSnapshotsTable, accountsTable, db, reconciliationsTable, transactionsTable } from "@workspace/db";
import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getAccountBalance } from "../lib/accounts";
import { writeAudit } from "../lib/audit";

const router = Router();
const accountTypes = new Set(["cash", "bank", "credit_card", "loan", "investment", "wallet"]);

function positiveAmount(value: unknown): number | null {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

async function serializeAccount(account: typeof accountsTable.$inferSelect) {
  return {
    id: account.id, name: account.name, type: account.type, currency: account.currency,
    openingBalance: Number(account.openingBalance),
    currentBalance: await getAccountBalance(account.profileId, account.id),
    institution: account.institution, accountNumberLast4: account.accountNumberLast4,
    color: account.color, icon: account.icon, includeInNetWorth: account.includeInNetWorth,
    status: account.status, lastReconciledDate: account.lastReconciledDate, version: account.version,
  };
}

router.get("/accounts", requireAuth, async (req, res) => {
  const rows = await db.select().from(accountsTable)
    .where(and(eq(accountsTable.profileId, req.user!.userId), isNull(accountsTable.archivedAt)))
    .orderBy(asc(accountsTable.createdAt));
  res.json(await Promise.all(rows.map(serializeAccount)));
});

router.post("/accounts", requireAuth, async (req, res) => {
  const { name, type, currency, openingBalance, institution, accountNumberLast4, color, icon, includeInNetWorth } = req.body ?? {};
  if (typeof name !== "string" || name.trim().length < 2 || !accountTypes.has(type)) {
    res.status(400).json({ error: "A valid account name and type are required." }); return;
  }
  const balance = Number(openingBalance ?? 0);
  if (!Number.isFinite(balance)) { res.status(400).json({ error: "Opening balance must be a number." }); return; }
  const [account] = await db.insert(accountsTable).values({
    profileId: req.user!.userId, name: name.trim(), type,
    currency: typeof currency === "string" ? currency : "INR", openingBalance: String(balance),
    institution: institution || null, accountNumberLast4: accountNumberLast4 || null,
    color: color || null, icon: icon || null, includeInNetWorth: includeInNetWorth !== false,
  }).returning();
  await writeAudit(req, "create", "account", account.id, null, account);
  res.status(201).json(await serializeAccount(account));
});

router.patch("/accounts/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const [before] = await db.select().from(accountsTable)
    .where(and(eq(accountsTable.id, id), eq(accountsTable.profileId, req.user!.userId))).limit(1);
  if (!before) { res.status(404).json({ error: "Account not found" }); return; }
  if (req.body.version != null && Number(req.body.version) !== before.version) {
    res.status(409).json({ error: "This account changed elsewhere. Refresh and retry." }); return;
  }
  const updates: Record<string, unknown> = { version: sql`${accountsTable.version} + 1` };
  for (const key of ["name", "institution", "accountNumberLast4", "color", "icon"] as const) {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) updates[key] = req.body[key] || null;
  }
  if (req.body.type != null && accountTypes.has(req.body.type)) updates.type = req.body.type;
  if (req.body.includeInNetWorth != null) updates.includeInNetWorth = Boolean(req.body.includeInNetWorth);
  const [account] = await db.update(accountsTable).set(updates)
    .where(and(eq(accountsTable.id, id), eq(accountsTable.profileId, req.user!.userId))).returning();
  await writeAudit(req, "update", "account", id, before, account);
  res.json(await serializeAccount(account));
});

router.delete("/accounts/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const [before] = await db.select().from(accountsTable)
    .where(and(eq(accountsTable.id, id), eq(accountsTable.profileId, req.user!.userId))).limit(1);
  if (!before) { res.status(404).json({ error: "Account not found" }); return; }
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(transactionsTable)
    .where(and(eq(transactionsTable.accountId, id), isNull(transactionsTable.deletedAt)));
  if (count > 0) {
    await db.update(accountsTable).set({ status: "archived", archivedAt: new Date(), version: sql`${accountsTable.version} + 1` })
      .where(eq(accountsTable.id, id));
  } else {
    await db.delete(accountsTable).where(eq(accountsTable.id, id));
  }
  await writeAudit(req, count > 0 ? "archive" : "delete", "account", id, before, null);
  res.sendStatus(204);
});

router.post("/transfers", requireAuth, async (req, res) => {
  const { fromAccountId, toAccountId, amount: rawAmount, date, description, status = "cleared" } = req.body ?? {};
  const amount = positiveAmount(rawAmount);
  if (!amount || Number(fromAccountId) === Number(toAccountId) || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
    res.status(400).json({ error: "Different source/destination accounts, a positive amount, and a date are required." }); return;
  }
  const ids = [Number(fromAccountId), Number(toAccountId)];
  const owned = await db.select({ id: accountsTable.id }).from(accountsTable)
    .where(and(eq(accountsTable.profileId, req.user!.userId), sql`${accountsTable.id} in (${sql.join(ids.map(id => sql`${id}`), sql`,`)})`));
  if (owned.length !== 2) { res.status(404).json({ error: "One or both accounts were not found." }); return; }
  const transferGroupId = randomUUID();
  const created = await db.transaction(async tx => {
    return tx.insert(transactionsTable).values([
      { profileId: req.user!.userId, accountId: ids[0], type: "transfer", direction: "debit", amount: String(amount), date, description: description || "Transfer", status, transferGroupId },
      { profileId: req.user!.userId, accountId: ids[1], type: "transfer", direction: "credit", amount: String(amount), date, description: description || "Transfer", status, transferGroupId },
    ]).returning();
  });
  await writeAudit(req, "create", "transfer", transferGroupId, null, { fromAccountId, toAccountId, amount, date });
  res.status(201).json({ transferGroupId, entries: created });
});

router.get("/accounts/:id/balance-history", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const rows = await db.select({
    date: transactionsTable.date,
    movement: sql<string>`sum(case when ${transactionsTable.direction} = 'credit' then ${transactionsTable.amount} else -${transactionsTable.amount} end)`,
  }).from(transactionsTable)
    .where(and(eq(transactionsTable.profileId, req.user!.userId), eq(transactionsTable.accountId, id), isNull(transactionsTable.deletedAt)))
    .groupBy(transactionsTable.date).orderBy(transactionsTable.date);
  const [account] = await db.select().from(accountsTable)
    .where(and(eq(accountsTable.id, id), eq(accountsTable.profileId, req.user!.userId))).limit(1);
  if (!account) { res.status(404).json({ error: "Account not found" }); return; }
  let balance = Number(account.openingBalance);
  res.json(rows.map(row => ({ date: row.date, balance: balance += Number(row.movement) })));
});

router.post("/accounts/:id/reconcile", requireAuth, async (req, res) => {
  const accountId = Number(req.params.id);
  const statementBalance = Number(req.body?.statementBalance);
  const statementDate = String(req.body?.statementDate ?? "");
  if (!Number.isFinite(statementBalance) || !/^\d{4}-\d{2}-\d{2}$/.test(statementDate)) {
    res.status(400).json({ error: "Statement date and balance are required." }); return;
  }
  const calculatedBalance = await getAccountBalance(req.user!.userId, accountId);
  const difference = Math.round((statementBalance - calculatedBalance) * 100) / 100;
  const [reconciliation] = await db.transaction(async tx => {
    await tx.update(transactionsTable).set({ status: "reconciled", version: sql`${transactionsTable.version} + 1` })
      .where(and(eq(transactionsTable.profileId, req.user!.userId), eq(transactionsTable.accountId, accountId),
        eq(transactionsTable.status, "cleared"), lte(transactionsTable.date, statementDate), isNull(transactionsTable.deletedAt)));
    await tx.update(accountsTable).set({ lastReconciledDate: statementDate, version: sql`${accountsTable.version} + 1` })
      .where(and(eq(accountsTable.id, accountId), eq(accountsTable.profileId, req.user!.userId)));
    await tx.insert(accountBalanceSnapshotsTable).values({
      profileId: req.user!.userId, accountId, balance: String(statementBalance), asOfDate: statementDate, source: "reconciliation",
    }).onConflictDoUpdate({
      target: [accountBalanceSnapshotsTable.accountId, accountBalanceSnapshotsTable.asOfDate, accountBalanceSnapshotsTable.source],
      set: { balance: String(statementBalance) },
    });
    return tx.insert(reconciliationsTable).values({
      profileId: req.user!.userId, accountId, statementDate, statementBalance: String(statementBalance),
      calculatedBalance: String(calculatedBalance), difference: String(difference),
      status: difference === 0 ? "completed" : "open", completedAt: difference === 0 ? new Date() : null,
    }).returning();
  });
  await writeAudit(req, "reconcile", "account", accountId, null, reconciliation);
  res.status(201).json({ ...reconciliation, statementBalance, calculatedBalance, difference });
});

export default router;
