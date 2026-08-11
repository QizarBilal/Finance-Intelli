import { createHash, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { Router } from "express";
import {
  collections,
  getCollection,
  nextId,
  withoutMongoId,
  withoutMongoIds,
} from "@workspace/db";
import { requireAuth, revokeSession } from "../middlewares/auth";
import { getAccountBalance } from "../lib/accounts";
import { writeAudit } from "../lib/audit";
const router = Router(),
  text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const fp = (a: number, d: string, n: number, s: string) =>
  createHash("sha256")
    .update(
      [a, d, n.toFixed(2), s.toLowerCase().replace(/\s+/g, " ")].join("|"),
    )
    .digest("hex");
function csv(input: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    v = "",
    q = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"' && q && input[i + 1] === '"') {
      v += '"';
      i++;
    } else if (c === '"') q = !q;
    else if (c === "," && !q) {
      row.push(v.trim());
      v = "";
    } else if ((c === "\n" || c === "\r") && !q) {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(v.trim());
      v = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else v += c;
  }
  row.push(v.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
router.get("/rules", requireAuth, async (req, res) =>
  res.json(
    withoutMongoIds(
      await (
        await getCollection(collections.categorizationRules)
      )
        .find({ profileId: req.user!.userId })
        .sort({ priority: 1 })
        .toArray(),
    ),
  ),
);
router.post("/rules", requireAuth, async (req, res) => {
  const {
    name,
    field,
    operator,
    value,
    categoryId,
    merchant,
    priority = 100,
  } = req.body ?? {};
  if (
    !text(name) ||
    !["description", "merchant", "amount"].includes(field) ||
    ![
      "contains",
      "equals",
      "starts_with",
      "greater_than",
      "less_than",
    ].includes(operator) ||
    !text(String(value ?? ""))
  ) {
    res
      .status(400)
      .json({
        error: "Valid rule name, field, operator and value are required.",
      });
    return;
  }
  const now = new Date(),
    rule: any = {
      id: await nextId(collections.categorizationRules),
      profileId: req.user!.userId,
      name: text(name),
      field,
      operator,
      value: text(String(value)),
      categoryId: categoryId ? Number(categoryId) : null,
      merchant: text(merchant) || null,
      priority: Number(priority),
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
  await (await getCollection(collections.categorizationRules)).insertOne(rule);
  await writeAudit(req, "create", "categorization_rule", rule.id, null, rule);
  res.status(201).json(withoutMongoId(rule));
});
router.delete("/rules/:id", requireAuth, async (req, res) => {
  const r = await (
    await getCollection(collections.categorizationRules)
  ).deleteOne({ id: Number(req.params.id), profileId: req.user!.userId });
  if (!r.deletedCount) {
    res.status(404).json({ error: "Rule not found" });
    return;
  }
  res.sendStatus(204);
});
router.post("/imports/preview", requireAuth, async (req, res) => {
  const accountId = Number(req.body?.accountId),
    raw = text(req.body?.csv),
    mapping = req.body?.mapping ?? {
      date: "Date",
      amount: "Amount",
      description: "Description",
      type: "Type",
      category: "Category",
    };
  if (
    !raw ||
    !(await (
      await getCollection(collections.accounts)
    ).findOne({ id: accountId, profileId: req.user!.userId }))
  ) {
    res.status(400).json({ error: "An account and CSV content are required." });
    return;
  }
  const parsed = csv(raw),
    headers = parsed.shift() ?? [],
    col = (n: string) =>
      headers.findIndex(
        (h) => h.toLowerCase() === text(mapping[n]).toLowerCase(),
      ),
    rows = parsed.slice(0, 10000).map((cells, index) => {
      const signed = Number(cells[col("amount")]?.replace(/[^0-9.-]/g, "")),
        type =
          cells[col("type")]?.toLowerCase() === "income" || signed > 0
            ? "income"
            : "expense",
        amount = Math.abs(signed),
        date = cells[col("date")] ?? "",
        description = cells[col("description")] ?? "";
      return {
        row: index + 2,
        date,
        amount,
        type,
        description,
        category: cells[col("category")] || null,
        fingerprint: fp(accountId, date, amount, description),
        valid: /^\d{4}-\d{2}-\d{2}$/.test(date) && amount > 0,
      };
    }),
    existing: any[] = await (
      await getCollection(collections.transactions)
    )
      .find({
        profileId: req.user!.userId,
        fingerprint: { $in: rows.map((r) => r.fingerprint) },
      })
      .project({ fingerprint: 1 })
      .toArray(),
    set = new Set(existing.map((r) => r.fingerprint)),
    preview = rows.map((r) => ({ ...r, duplicate: set.has(r.fingerprint) })),
    now = new Date(),
    batch: any = {
      id: await nextId(collections.importBatches),
      profileId: req.user!.userId,
      accountId,
      filename: text(req.body?.filename) || "statement.csv",
      totalRows: rows.length,
      duplicateRows: preview.filter((r) => r.duplicate).length,
      mapping,
      status: "preview",
      createdAt: now,
      updatedAt: now,
    };
  await (await getCollection(collections.importBatches)).insertOne(batch);
  res.json({
    batchId: batch.id,
    headers,
    rows: preview,
    validRows: preview.filter((r) => r.valid && !r.duplicate).length,
  });
});
router.post("/imports/:batchId/commit", requireAuth, async (req, res) => {
  const batches = await getCollection(collections.importBatches),
    batch: any = await batches.findOne({
      id: Number(req.params.batchId),
      profileId: req.user!.userId,
      status: "preview",
    });
  if (!batch || !Array.isArray(req.body?.rows)) {
    res
      .status(400)
      .json({ error: "Import preview is missing or already committed." });
    return;
  }
  const rows = req.body.rows
      .filter((r: any) => r.valid && !r.duplicate)
      .slice(0, 10000),
    rules: any[] = await (
      await getCollection(collections.categorizationRules)
    )
      .find({ profileId: req.user!.userId, enabled: true })
      .sort({ priority: 1 })
      .toArray(),
    categories: any[] = await (
      await getCollection(collections.categories)
    )
      .find({ profileId: req.user!.userId })
      .toArray(),
    txs = await getCollection(collections.transactions),
    now = new Date(),
    docs: any[] = [];
  for (const row of rows) {
    const match = rules.find((rule) => {
        const a = String(row[rule.field] ?? "").toLowerCase(),
          e = String(rule.value).toLowerCase();
        return rule.operator === "contains"
          ? a.includes(e)
          : rule.operator === "starts_with"
            ? a.startsWith(e)
            : rule.operator === "equals"
              ? a === e
              : rule.operator === "greater_than"
                ? Number(a) > Number(e)
                : Number(a) < Number(e);
      }),
      cat = match?.categoryId
        ? categories.find((c) => c.id === match.categoryId)
        : null;
    docs.push({
      id: await nextId(collections.transactions),
      profileId: req.user!.userId,
      accountId: batch.accountId,
      categoryId: cat?.id ?? null,
      type: row.type,
      direction: row.type === "income" ? "credit" : "debit",
      amount: Number(row.amount),
      date: row.date,
      description: row.description || null,
      category: cat?.name ?? row.category ?? null,
      merchant: match?.merchant ?? null,
      status: "cleared",
      fingerprint: row.fingerprint,
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }
  if (docs.length) await txs.insertMany(docs, { ordered: false });
  await batches.updateOne(
    { id: batch.id },
    {
      $set: { status: "completed", importedRows: docs.length, updatedAt: now },
    },
  );
  await writeAudit(req, "import", "import_batch", batch.id, null, {
    imported: docs.length,
  });
  res.status(201).json({ imported: docs.length });
});
router.get("/planning/forecast", requireAuth, async (req, res) => {
  const days = Math.min(365, Math.max(7, Number(req.query.days ?? 90))),
    since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10),
    accounts: any[] = await (
      await getCollection(collections.accounts)
    )
      .find({ profileId: req.user!.userId, archivedAt: null })
      .toArray(),
    txs: any[] = await (
      await getCollection(collections.transactions)
    )
      .find({
        profileId: req.user!.userId,
        deletedAt: null,
        date: { $gte: since },
      })
      .toArray(),
    rem: any[] = await (
      await getCollection(collections.reminders)
    )
      .find({ profileId: req.user!.userId, isCompleted: false })
      .toArray(),
    current = (
      await Promise.all(
        accounts.map((a) => getAccountBalance(req.user!.userId, a.id)),
      )
    ).reduce((s, n) => s + n, 0),
    daily =
      txs.reduce(
        (s, t) => s + (t.direction === "credit" ? 1 : -1) * Number(t.amount),
        0,
      ) / 90,
    until = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10),
    due = rem
      .filter((r) => r.dueDate <= until)
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);
  res.json({
    currentBalance: current,
    days,
    dailyAverage: daily,
    scheduledOutflow: due,
    projectedBalance: current + daily * days - due,
    explanation:
      "Current cleared balances plus the trailing 90-day average movement, less scheduled reminders.",
  });
});
router.get("/planning/debt-payoff", requireAuth, async (req, res) => {
  const strategy =
      req.query.strategy === "avalanche" ? "avalanche" : "snowball",
    accounts: any[] = await (
      await getCollection(collections.accounts)
    )
      .find({
        profileId: req.user!.userId,
        type: { $in: ["credit_card", "loan"] },
        archivedAt: null,
      })
      .toArray(),
    rows = await Promise.all(
      accounts.map(async (a) => ({
        account: a,
        balance: Math.abs(await getAccountBalance(req.user!.userId, a.id)),
      })),
    );
  rows.sort((a, b) =>
    strategy === "avalanche"
      ? Number(b.account.interestRate ?? 0) -
        Number(a.account.interestRate ?? 0)
      : a.balance - b.balance,
  );
  res.json({
    strategy,
    order: rows.map(({ account, balance }) => ({
      id: account.id,
      name: account.name,
      balance,
      interestRate: Number(account.interestRate ?? 0),
      minimumPayment: Number(account.minimumPayment ?? 0),
    })),
  });
});
router.get("/saved-views", requireAuth, async (req, res) =>
  res.json(
    withoutMongoIds(
      await (
        await getCollection(collections.savedViews)
      )
        .find({ profileId: req.user!.userId })
        .toArray(),
    ),
  ),
);
router.post("/saved-views", requireAuth, async (req, res) => {
  const col = await getCollection(collections.savedViews),
    key = {
      profileId: req.user!.userId,
      name: text(req.body?.name),
      scope: text(req.body?.scope),
    },
    now = new Date();
  const row = await col.findOneAndUpdate(
    key,
    {
      $set: {
        filters: req.body?.filters ?? {},
        isDefault: Boolean(req.body?.isDefault),
        updatedAt: now,
      },
      $setOnInsert: {
        id: await nextId(collections.savedViews),
        ...key,
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: "after" },
  );
  res.status(201).json(withoutMongoId(row));
});
router.post("/jobs", requireAuth, async (req, res) => {
  if (
    !new Set([
      "recurring",
      "report",
      "receipt",
      "bank_sync",
      "export",
      "notification",
    ]).has(req.body?.type)
  ) {
    res.status(400).json({ error: "Unsupported job type" });
    return;
  }
  const col = await getCollection(collections.jobs),
    key = text(req.body.idempotencyKey) || randomUUID(),
    existing = await col.findOne({
      profileId: req.user!.userId,
      idempotencyKey: key,
    });
  if (existing) {
    res.json({ duplicate: true });
    return;
  }
  const now = new Date(),
    job: any = {
      id: await nextId(collections.jobs),
      profileId: req.user!.userId,
      type: req.body.type,
      payload: req.body.payload ?? {},
      runAt: req.body.runAt ? new Date(req.body.runAt) : now,
      idempotencyKey: key,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
  await col.insertOne(job);
  res.status(201).json(withoutMongoId(job));
});
router.post("/households", requireAuth, async (req, res) => {
  if (!text(req.body?.name)) {
    res.status(400).json({ error: "Household name is required" });
    return;
  }
  const now = new Date(),
    h: any = {
      id: await nextId(collections.households),
      name: text(req.body.name),
      ownerProfileId: req.user!.userId,
      createdAt: now,
      updatedAt: now,
    };
  await (await getCollection(collections.households)).insertOne(h);
  await (
    await getCollection(collections.householdMembers)
  ).insertOne({
    id: await nextId(collections.householdMembers),
    householdId: h.id,
    profileId: req.user!.userId,
    role: "owner",
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  res.status(201).json(withoutMongoId(h));
});
router.get("/households", requireAuth, async (req, res) => {
  const members: any[] = await (
      await getCollection(collections.householdMembers)
    )
      .find({ profileId: req.user!.userId, status: "active" })
      .toArray(),
    households: any[] = await (
      await getCollection(collections.households)
    )
      .find({ id: { $in: members.map((m) => m.householdId) } })
      .toArray();
  res.json(
    members.map((m) => ({
      household: withoutMongoId(households.find((h) => h.id === m.householdId)),
      role: m.role,
    })),
  );
});
router.get("/privacy/export", requireAuth, async (req, res) => {
  const id = req.user!.userId,
    names = [
      collections.accounts,
      collections.transactions,
      collections.budgets,
      collections.goals,
      collections.reminders,
      collections.auditLogs,
    ] as const,
    rows = await Promise.all(
      names.map(async (n) =>
        withoutMongoIds(
          await (await getCollection(n)).find({ profileId: id }).toArray(),
        ),
      ),
    ),
    profile: any = await (
      await getCollection(collections.profiles)
    ).findOne({ id });
  if (profile) delete profile.passwordHash;
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="finance-intelli-data.json"',
  );
  res.json({
    exportedAt: new Date().toISOString(),
    profile: withoutMongoId(profile),
    accounts: rows[0],
    transactions: rows[1],
    budgets: rows[2],
    goals: rows[3],
    reminders: rows[4],
    audit: rows[5],
  });
});
router.delete("/privacy/account", requireAuth, async (req, res) => {
  const col = await getCollection(collections.profiles),
    profile: any = await col.findOne({ id: req.user!.userId });
  if (
    !profile ||
    !(await bcrypt.compare(text(req.body?.password), profile.passwordHash))
  ) {
    res.status(403).json({ error: "Password confirmation failed" });
    return;
  }
  await writeAudit(req, "delete_account", "profile", profile.id);
  await col.deleteOne({ id: profile.id });
  await revokeSession(req, res);
  res.sendStatus(204);
});
export default router;
