import { Router } from "express";
import {
  collections,
  getCollection,
  nextId,
  withoutMongoId,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import {
  CreateGoalBody,
  UpdateGoalBody,
  GetGoalParams,
  UpdateGoalParams,
  DeleteGoalParams,
  ContributeToGoalParams,
  ContributeToGoalBody,
} from "@workspace/api-zod";
import { writeAudit } from "../lib/audit";
import { randomUUID } from "node:crypto";

const router = Router();
const clean = (value: any) => withoutMongoId(value);
const serialize = (g: any) => ({
  ...clean(g),
  currency: g.currency ?? "INR",
  targetAmount: Number(g.targetAmount),
  currentAmount: Number(g.currentAmount),
  recurringContribution:
    g.recurringContribution == null ? null : Number(g.recurringContribution),
  createdAt: new Date(g.createdAt).toISOString(),
});
const owned = (id: number, profileId: number) => ({ id, profileId });

router.get("/goals", requireAuth, async (req, res) => {
  const rawGoals: any[] = await (
    await getCollection(collections.goals)
  )
    .find({ profileId: req.user!.userId })
    .sort({ createdAt: 1 })
    .toArray();
  const goalIds = rawGoals.map(goal => goal.id);
  const contributions: any[] = goalIds.length ? await (await getCollection(collections.goalContributions))
    .find({ profileId: req.user!.userId, goalId: { $in: goalIds }, isReversed: { $ne: true } })
    .sort({ createdAt: 1 }).toArray() : [];
  const summaries = new Map<number, { contributed: number; byMonth: Map<string, number>; recent: any[] }>();
  for (const contribution of contributions) {
    const summary = summaries.get(contribution.goalId) ?? { contributed: 0, byMonth: new Map<string, number>(), recent: [] };
    const amount = Number(contribution.amount);
    const month = new Date(contribution.createdAt).toISOString().slice(0, 7);
    summary.contributed += amount;
    summary.byMonth.set(month, (summary.byMonth.get(month) ?? 0) + amount);
    summary.recent.unshift({ amount, note: contribution.note ?? null, createdAt: contribution.createdAt, transferGroupId: contribution.transferGroupId ?? null });
    summaries.set(contribution.goalId, summary);
  }
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, index) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + index, 1, 12)).toISOString().slice(0, 7));
  res.json(rawGoals.map(goal => {
    const summary = summaries.get(goal.id) ?? { contributed: 0, byMonth: new Map<string, number>(), recent: [] };
    let running = Math.max(0, Number(goal.currentAmount) - summary.contributed);
    const progressHistory = months.map(month => ({ month, amount: running += summary.byMonth.get(month) ?? 0 }));
    return { ...serialize(goal), progressHistory, recentContributions: summary.recent.slice(0, 5) };
  }));
});
router.post("/goals", requireAuth, async (req, res) => {
  const p = CreateGoalBody.safeParse(req.body);
  if (!p.success) {
    res.status(400).json({ error: p.error.message });
    return;
  }
  const now = new Date(),
    d = p.data;
  const row: any = {
    id: await nextId(collections.goals),
    profileId: req.user!.userId,
    name: d.name,
    targetAmount: d.targetAmount,
    currentAmount: d.currentAmount ?? 0,
    deadline: d.deadline ?? null,
    priority: d.priority ?? null,
    color: d.color ?? null,
    icon: d.icon ?? null,
    notes: d.notes ?? null,
    recurringContribution: d.recurringContribution ?? null,
    recurringFrequency: d.recurringFrequency ?? null,
    isCompleted: false,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  await (await getCollection(collections.goals)).insertOne(row);
  res.status(201).json(serialize(row));
});
router.get("/goals/:id", requireAuth, async (req, res) => {
  const p = GetGoalParams.safeParse(req.params);
  if (!p.success) {
    res.status(400).json({ error: p.error.message });
    return;
  }
  const row = await (
    await getCollection(collections.goals)
  ).findOne(owned(p.data.id, req.user!.userId));
  if (!row) {
    res.status(404).json({ error: "Goal not found" });
    return;
  }
  res.json(serialize(row));
});
router.patch("/goals/:id", requireAuth, async (req, res) => {
  const p = UpdateGoalParams.safeParse(req.params);
  const b = UpdateGoalBody.safeParse(req.body);
  if (!p.success) {
    res.status(400).json({ error: p.error.message });
    return;
  }
  if (!b.success) {
    res.status(400).json({ error: b.error.message });
    return;
  }
  const row = await (
    await getCollection(collections.goals)
  ).findOneAndUpdate(
    owned(p.data.id, req.user!.userId),
    { $set: { ...b.data, updatedAt: new Date() }, $inc: { version: 1 } },
    { returnDocument: "after" },
  );
  if (!row) {
    res.status(404).json({ error: "Goal not found" });
    return;
  }
  res.json(serialize(row));
});
router.delete("/goals/:id", requireAuth, async (req, res) => {
  const p = DeleteGoalParams.safeParse(req.params);
  if (!p.success) {
    res.status(400).json({ error: p.error.message });
    return;
  }
  const result = await (
    await getCollection(collections.goals)
  ).deleteOne(owned(p.data.id, req.user!.userId));
  if (!result.deletedCount) {
    res.status(404).json({ error: "Goal not found" });
    return;
  }
  await (
    await getCollection(collections.goalContributions)
  ).deleteMany({ goalId: p.data.id, profileId: req.user!.userId });
  res.sendStatus(204);
});

router.post("/goals/:id/contribute", requireAuth, async (req, res) => {
  const p = ContributeToGoalParams.safeParse(req.params),
    b = ContributeToGoalBody.safeParse(req.body);
  if (!p.success) {
    res.status(400).json({ error: p.error.message });
    return;
  }
  if (!b.success) {
    res.status(400).json({ error: b.error.message });
    return;
  }
  const profileId = req.user!.userId,
    goals = await getCollection(collections.goals),
    current: any = await goals.findOne(owned(p.data.id, profileId));
  if (!current) {
    res.status(404).json({ error: "Goal not found" });
    return;
  }
  const accountId = req.body?.accountId ? Number(req.body.accountId) : null;
  const destinationAccountId = req.body?.destinationAccountId ? Number(req.body.destinationAccountId) : null;
  let fundingAccount: any = null;
  if (
    accountId &&
    !(fundingAccount = await (await getCollection(collections.accounts)).findOne(owned(accountId, profileId)))
  ) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  if (destinationAccountId) {
    const destination: any = await (await getCollection(collections.accounts)).findOne(owned(destinationAccountId, profileId));
    if (!accountId || !fundingAccount || !destination || destinationAccountId === accountId) {
      res.status(400).json({ error: "Choose different source and savings accounts." });
      return;
    }
    if ((destination.currency ?? "INR") !== (fundingAccount.currency ?? "INR")) {
      res.status(400).json({ error: "Savings transfers must use the same currency on both accounts." });
      return;
    }
    if (current.currency && current.currency !== (fundingAccount.currency ?? "INR")) {
      res.status(400).json({ error: `This goal is tracked in ${current.currency}. Choose accounts in that currency.` });
      return;
    }
  }
  const now = new Date(),
    amount = Number(b.data.amount),
    newAmount = Number(current.currentAmount) + amount;
  let transactionId: number | null = null;
  let transferGroupId: string | null = null;
  if (accountId) {
    const transactions = await getCollection(collections.transactions);
    transactionId = await nextId(collections.transactions);
    if (destinationAccountId) {
      const targetId = await nextId(collections.transactions);
      transferGroupId = randomUUID();
      await transactions.insertMany([
        { id: transactionId, profileId, accountId, type: "transfer", direction: "debit", amount, date: now.toISOString().slice(0, 10), description: `Savings transfer · ${current.name}`, status: "cleared", transferGroupId, version: 1, deletedAt: null, createdAt: now, updatedAt: now },
        { id: targetId, profileId, accountId: destinationAccountId, type: "transfer", direction: "credit", amount, date: now.toISOString().slice(0, 10), description: `Savings transfer · ${current.name}`, status: "cleared", transferGroupId, version: 1, deletedAt: null, createdAt: now, updatedAt: now },
      ]);
    } else {
      await transactions.insertOne({
        id: transactionId, profileId, accountId, type: "expense", direction: "debit", amount,
        date: now.toISOString().slice(0, 10), description: `Contribution to ${current.name}`, category: "Savings goals",
        status: "cleared", version: 1, deletedAt: null, createdAt: now, updatedAt: now,
      });
    }
  }
  const contribution: any = {
    id: await nextId(collections.goalContributions),
    profileId,
    goalId: current.id,
    accountId,
    transactionId,
    transferGroupId,
    amount,
    note: req.body?.note || null,
    isReversed: false,
    createdAt: now,
    updatedAt: now,
  };
  await (
    await getCollection(collections.goalContributions)
  ).insertOne(contribution);
  const goal: any = await goals.findOneAndUpdate(
    owned(current.id, profileId),
    {
      $set: {
        currentAmount: newAmount,
        currency: current.currency ?? fundingAccount?.currency ?? "INR",
        isCompleted: newAmount >= Number(current.targetAmount),
        updatedAt: now,
      },
      $inc: { version: 1 },
    },
    { returnDocument: "after" },
  );
  await writeAudit(req, "contribute", "goal", current.id, current, {
    goal,
    contribution,
  });
  res.json({ ...serialize(goal), contribution: clean(contribution) });
});
router.get("/goals/:id/contributions", requireAuth, async (req, res) => {
  const rows = await (
    await getCollection(collections.goalContributions)
  )
    .find({ goalId: Number(req.params.id), profileId: req.user!.userId })
    .sort({ createdAt: 1 })
    .toArray();
  res.json(rows.map((r: any) => ({ ...clean(r), amount: Number(r.amount) })));
});
router.post(
  "/goals/:id/contributions/:contributionId/reverse",
  requireAuth,
  async (req, res) => {
    const profileId = req.user!.userId,
      goalId = Number(req.params.id),
      contributionId = Number(req.params.contributionId),
      contributions = await getCollection(collections.goalContributions),
      goals = await getCollection(collections.goals);
    const contribution: any = await contributions.findOne({
        id: contributionId,
        goalId,
        profileId,
        isReversed: { $ne: true },
      }),
      goal: any = await goals.findOne(owned(goalId, profileId));
    if (!contribution || !goal) {
      res.status(404).json({ error: "Contribution not found" });
      return;
    }
    await contributions.updateOne(
      { id: contributionId },
      { $set: { isReversed: true, updatedAt: new Date() } },
    );
    if (contribution.transferGroupId) {
      await (await getCollection(collections.transactions)).updateMany({ transferGroupId: contribution.transferGroupId, profileId }, { $set: { status: "void", updatedAt: new Date() }, $inc: { version: 1 } });
    } else if (contribution.transactionId) {
      await (await getCollection(collections.transactions)).updateOne(owned(contribution.transactionId, profileId), { $set: { status: "void", updatedAt: new Date() }, $inc: { version: 1 } });
    }
    const amount = Math.max(
      0,
      Number(goal.currentAmount) - Number(contribution.amount),
    );
    const updated: any = await goals.findOneAndUpdate(
      owned(goalId, profileId),
      {
        $set: {
          currentAmount: amount,
          isCompleted: amount >= Number(goal.targetAmount),
          updatedAt: new Date(),
        },
        $inc: { version: 1 },
      },
      { returnDocument: "after" },
    );
    await writeAudit(
      req,
      "reverse_contribution",
      "goal",
      goalId,
      contribution,
      updated,
    );
    res.json(serialize(updated));
  },
);
export default router;
