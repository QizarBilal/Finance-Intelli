import { createHash, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { Router } from "express";
import {
  collections,
  getCollection,
  nextId,
  withMongoTransaction,
  withoutMongoId,
  withoutMongoIds,
} from "@workspace/db";
import { requireAuth, revokeSession } from "../middlewares/auth";
import { getAccountBalance } from "../lib/accounts";
import { writeAudit } from "../lib/audit";
const router = Router(),
  active = { $in: [null, undefined] },
  text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const fp = (a: number, d: string, n: number, s: string, t: string) =>
  createHash("sha256")
    .update(
      [a, d, n.toFixed(2), s.toLowerCase().replace(/\s+/g, " "), t].join("|"),
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
      const rawAmount = cells[col("amount")] ?? "",
        signed = Number(rawAmount.replace(/[^0-9.-]/g, "")),
        rawType = (cells[col("type")] ?? "").trim().toLowerCase(),
        type = /income|credit|received|refund|cashback|deposit|\bcr\b/.test(rawType)
          ? "income"
          : /expense|debit|paid|sent|withdraw|\bdr\b/.test(rawType)
            ? "expense"
            : signed < 0 ? "expense" : signed > 0 ? "income" : null,
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
        fingerprint: type ? fp(accountId, date, amount, description, type) : "",
        valid: /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(amount) && amount > 0 && Boolean(type) && Boolean(description.trim()),
        reason: !/^\d{4}-\d{2}-\d{2}$/.test(date) ? "Invalid date" : !Number.isFinite(amount) || amount <= 0 ? "Invalid amount" : !type ? "Unknown transaction type" : !description.trim() ? "Description is required" : null,
      };
    }),
    existing: any[] = await (
      await getCollection(collections.transactions)
    )
      .find({
        profileId: req.user!.userId,
        fingerprint: { $in: rows.map((r) => r.fingerprint) },
        deletedAt: active,
      })
      .project({ fingerprint: 1 })
      .toArray(),
    categories: any[] = await (await getCollection(collections.categories)).find({ profileId: req.user!.userId }).toArray(),
    rules: any[] = await (await getCollection(collections.categorizationRules))
      .find({ profileId: req.user!.userId, enabled: true }).sort({ priority: 1 }).toArray(),
    seen = new Set<string>(),
    existingFingerprints = new Set(existing.map((r) => r.fingerprint)),
    preview = rows.map((r) => {
      const duplicate = Boolean(r.fingerprint) && (existingFingerprints.has(r.fingerprint) || seen.has(r.fingerprint));
      if (r.fingerprint) seen.add(r.fingerprint);
      const match = rules.find((rule) => {
        const actual = String(rule.field === "amount" ? r.amount : rule.field === "merchant" ? r.description : (r as any)[rule.field] ?? "").toLowerCase();
        const expected = String(rule.value).toLowerCase();
        return rule.operator === "contains" ? actual.includes(expected)
          : rule.operator === "starts_with" ? actual.startsWith(expected)
            : rule.operator === "equals" ? actual === expected
              : rule.operator === "greater_than" ? Number(actual) > Number(expected)
                : Number(actual) < Number(expected);
      });
      const suggested = match?.categoryId ? categories.find(category => category.id === match.categoryId && [category.type, "both"].includes(r.type)) : null;
      const named = !match && r.category ? categories.find(category => category.name?.toLowerCase() === r.category?.toLowerCase() && [category.type, "both"].includes(r.type)) : null;
      return { ...r, category: suggested?.name ?? named?.name ?? r.category ?? null, categorySource: suggested || named ? "rule" : r.category ? "statement" : null, duplicate };
    }),
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
  if (!Array.isArray(req.body?.rows)) {
    res.status(400).json({ error: "Import preview rows are required." });
    return;
  }
  const userId = req.user!.userId;
  const result = await withMongoTransaction(async (session) => {
    const batches = await getCollection(collections.importBatches);
    const batch: any = await batches.findOne({
      id: Number(req.params.batchId), profileId: userId, status: "preview",
    }, { session });
    if (!batch) return null;
    const categoriesCol = await getCollection(collections.categories);
    const categories: any[] = await categoriesCol.find({ profileId: userId }, { session }).toArray();
    const rules: any[] = await (await getCollection(collections.categorizationRules))
      .find({ profileId: userId, enabled: true }, { session }).sort({ priority: 1 }).toArray();
    const txs = await getCollection(collections.transactions);
    const sourceRows = req.body.rows.slice(0, 10000);
    const requested = sourceRows.filter((row: any) =>
      ["income", "expense"].includes(row.type) &&
      /^\d{4}-\d{2}-\d{2}$/.test(String(row.date)) && Number.isFinite(Number(row.amount)) &&
      Number(row.amount) > 0 && Number(row.amount) <= 1_000_000_000 && text(row.description).length > 0,
    );
    const docs: any[] = [], seen = new Set<string>();
    let duplicatesSkipped = 0, invalidSkipped = req.body.rows.length - sourceRows.length + sourceRows.length - requested.length;
    for (const row of requested) {
      const description = text(row.description).slice(0, 240), amount = Number(row.amount), type = row.type;
      const fingerprint = fp(batch.accountId, row.date, amount, description, type);
      if (seen.has(fingerprint) || await txs.findOne({ profileId: userId, fingerprint, deletedAt: active }, { session })) {
        duplicatesSkipped++; continue;
      }
      seen.add(fingerprint);
      const match = rules.find((rule) => {
          const actual = String(rule.field === "amount" ? amount : rule.field === "merchant" ? row.merchant ?? row.description : row[rule.field] ?? "").toLowerCase(),
            expected = String(rule.value).toLowerCase();
          return rule.operator === "contains" ? actual.includes(expected)
            : rule.operator === "starts_with" ? actual.startsWith(expected)
              : rule.operator === "equals" ? actual === expected
                : rule.operator === "greater_than" ? Number(actual) > Number(expected)
                  : Number(actual) < Number(expected);
        }),
        chosen = row.categoryEdited ? categories.find((candidate) => candidate.name?.toLowerCase() === text(row.category).toLowerCase() && [candidate.type, "both"].includes(type)) : null,
        category = row.categoryEdited ? chosen : categories.find((candidate) =>
          (match?.categoryId && candidate.id === match.categoryId && [candidate.type, "both"].includes(type)) ||
          (!match && candidate.name?.toLowerCase() === text(row.category).toLowerCase() && [candidate.type, "both"].includes(type)),
        );
      docs.push({
        id: await nextId(collections.transactions, session), profileId: userId, accountId: batch.accountId,
        importBatchId: batch.id, categoryId: category?.id ?? null, type,
        direction: type === "income" ? "credit" : "debit", amount, date: row.date,
        description, category: category?.name ?? (text(row.category).slice(0, 80) || null),
        merchant: match?.merchant ?? null, status: "cleared", fingerprint, version: 1,
        createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
      });
    }
    const now = new Date();
    if (docs.length) await txs.insertMany(docs, { ordered: true, session });
    await batches.updateOne({ id: batch.id, profileId: userId, status: "preview" }, {
      $set: { status: "completed", importedRows: docs.length, duplicateRows: duplicatesSkipped, invalidRows: invalidSkipped, updatedAt: now },
    }, { session });
    return { batchId: batch.id, imported: docs.length, duplicatesSkipped, invalidSkipped };
  });
  if (!result) {
    res.status(409).json({ error: "Import preview is missing or already committed." });
    return;
  }
  await writeAudit(req, "import", "import_batch", result.batchId, null, result);
  res.status(201).json(result);
});

router.get("/imports", requireAuth, async (req, res) => {
  const batches: any[] = withoutMongoIds(await (await getCollection(collections.importBatches))
    .find({ profileId: req.user!.userId }).sort({ createdAt: -1 }).limit(25).toArray());
  const accounts: any[] = withoutMongoIds(await (await getCollection(collections.accounts))
    .find({ profileId: req.user!.userId }).toArray());
  const names = new Map(accounts.map((account) => [account.id, account.name]));
  res.json(batches.map(({ mapping: _mapping, ...batch }) => ({ ...batch, accountName: names.get(batch.accountId) ?? "Archived account" })));
});

router.delete("/imports/:batchId", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const undone = await withMongoTransaction(async (session) => {
    const batches = await getCollection(collections.importBatches);
    const batch: any = await batches.findOne({ id: Number(req.params.batchId), profileId: userId, status: "completed" }, { session });
    if (!batch) return null;
    const now = new Date();
    const txs = await getCollection(collections.transactions);
    const result = await txs.updateMany({ profileId: userId, importBatchId: batch.id, deletedAt: active }, {
      $set: { deletedAt: now, updatedAt: now }, $inc: { version: 1 },
    }, { session });
    await batches.updateOne({ id: batch.id, profileId: userId, status: "completed" }, {
      $set: { status: "undone", undoneRows: result.modifiedCount, undoneAt: now, updatedAt: now },
    }, { session });
    return { batchId: batch.id, undone: result.modifiedCount };
  });
  if (!undone) { res.status(404).json({ error: "Completed import not found or already undone." }); return; }
  await writeAudit(req, "undo_import", "import_batch", undone.batchId, null, undone);
  res.json(undone);
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
    balancesByAccount = await Promise.all(accounts.map(async (account) => ({
      currency: account.currency ?? "INR",
      balance: await getAccountBalance(req.user!.userId, account.id),
    }))),
    currencyBalances = Object.entries(balancesByAccount.reduce<Record<string, number>>((totals, row) => {
      totals[row.currency] = (totals[row.currency] ?? 0) + row.balance;
      return totals;
    }, {})).map(([currency, balance]) => ({ currency, balance })),
    hasMixedCurrencies = currencyBalances.length > 1,
    current = hasMixedCurrencies ? null : balancesByAccount.reduce((s, row) => s + row.balance, 0),
    daily = hasMixedCurrencies ? null :
      txs.reduce(
        (s, t) => s + (t.direction === "credit" ? 1 : -1) * Number(t.amount),
        0,
      ) / 90,
    until = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10),
    due = hasMixedCurrencies ? null : rem
      .filter((r) => r.dueDate <= until)
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);
  res.json({
    currentBalance: current,
    currencyBalances,
    hasMixedCurrencies,
    days,
    dailyAverage: daily,
    scheduledOutflow: due,
    projectedBalance: current == null || daily == null || due == null ? null : current + daily * days - due,
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
  const id = req.user!.userId;
  const exportCollections = {
    accounts: collections.accounts,
    transactions: collections.transactions,
    budgets: collections.budgets,
    categories: collections.categories,
    goals: collections.goals,
    goalContributions: collections.goalContributions,
    reminders: collections.reminders,
    recurringRules: collections.recurringRules,
    subscriptions: collections.subscriptions,
    receipts: collections.receipts,
    creditSnapshots: collections.creditSnapshots,
    investments: collections.investments,
    taxTags: collections.taxTags,
    monthlyReviews: collections.monthlyReviews,
    savedViews: collections.savedViews,
    categorizationRules: collections.categorizationRules,
    notifications: collections.notifications,
    notificationPreferences: collections.notificationPreferences,
    importBatches: collections.importBatches,
    reconciliations: collections.reconciliations,
    accountBalanceSnapshots: collections.accountBalanceSnapshots,
    householdMembers: collections.householdMembers,
    householdApprovals: collections.householdApprovals,
    audit: collections.auditLogs,
  } as const;
  const exported = Object.fromEntries(await Promise.all(
    Object.entries(exportCollections).map(async ([key, collection]) => [
      key,
      withoutMongoIds(await (await getCollection(collection)).find({ profileId: id }).toArray()),
    ]),
  ));
  const households = withoutMongoIds(await (await getCollection(collections.households))
    .find({ ownerProfileId: id }).toArray());
  const profile: any = await (
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
    households,
    ...exported,
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
