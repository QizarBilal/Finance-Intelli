import { Router } from "express";
import { accountsTable, db, goalContributionsTable, goalsTable, transactionsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import {
  CreateGoalBody, UpdateGoalBody,
  GetGoalParams, UpdateGoalParams, DeleteGoalParams,
  ContributeToGoalParams, ContributeToGoalBody,
} from "@workspace/api-zod";
import { writeAudit } from "../lib/audit";

const router = Router();

function serializeGoal(g: typeof goalsTable.$inferSelect) {
  return {
    id: g.id, name: g.name,
    targetAmount: parseFloat(g.targetAmount),
    currentAmount: parseFloat(g.currentAmount),
    deadline: g.deadline, priority: g.priority, color: g.color, icon: g.icon, notes: g.notes,
    recurringContribution: g.recurringContribution != null ? parseFloat(g.recurringContribution) : null,
    recurringFrequency: g.recurringFrequency, isCompleted: g.isCompleted,
    createdAt: g.createdAt.toISOString(),
  };
}

router.get("/goals", requireAuth, async (req, res): Promise<void> => {
  const goals = await db.select().from(goalsTable)
    .where(eq(goalsTable.profileId, req.user!.userId)).orderBy(goalsTable.createdAt);
  res.json(goals.map(serializeGoal));
});

router.post("/goals", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateGoalBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const data = parsed.data;
  const [goal] = await db.insert(goalsTable).values({
    profileId: req.user!.userId,
    name: data.name, targetAmount: String(data.targetAmount),
    currentAmount: data.currentAmount != null ? String(data.currentAmount) : "0",
    deadline: data.deadline ?? null, priority: data.priority ?? null,
    color: data.color ?? null, icon: data.icon ?? null, notes: data.notes ?? null,
    recurringContribution: data.recurringContribution != null ? String(data.recurringContribution) : null,
    recurringFrequency: data.recurringFrequency ?? null, isCompleted: false,
  }).returning();
  res.status(201).json(serializeGoal(goal));
});

router.get("/goals/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetGoalParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [goal] = await db.select().from(goalsTable)
    .where(and(eq(goalsTable.id, params.data.id), eq(goalsTable.profileId, req.user!.userId)));
  if (!goal) { res.status(404).json({ error: "Goal not found" }); return; }
  res.json(serializeGoal(goal));
});

router.patch("/goals/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateGoalParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateGoalBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const data = parsed.data;
  const updates: Record<string, unknown> = {};
  if (data.name != null) updates.name = data.name;
  if (data.targetAmount != null) updates.targetAmount = String(data.targetAmount);
  if (data.currentAmount != null) updates.currentAmount = String(data.currentAmount);
  if (data.deadline != null) updates.deadline = data.deadline;
  if (data.priority != null) updates.priority = data.priority;
  if (data.color != null) updates.color = data.color;
  if (data.icon != null) updates.icon = data.icon;
  if (data.notes != null) updates.notes = data.notes;
  if (data.recurringContribution != null) updates.recurringContribution = String(data.recurringContribution);
  if (data.recurringFrequency != null) updates.recurringFrequency = data.recurringFrequency;
  if (data.isCompleted != null) updates.isCompleted = data.isCompleted;

  const [goal] = await db.update(goalsTable).set(updates)
    .where(and(eq(goalsTable.id, params.data.id), eq(goalsTable.profileId, req.user!.userId))).returning();
  if (!goal) { res.status(404).json({ error: "Goal not found" }); return; }
  res.json(serializeGoal(goal));
});

router.delete("/goals/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteGoalParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [deleted] = await db.delete(goalsTable)
    .where(and(eq(goalsTable.id, params.data.id), eq(goalsTable.profileId, req.user!.userId))).returning();
  if (!deleted) { res.status(404).json({ error: "Goal not found" }); return; }
  res.sendStatus(204);
});

router.post("/goals/:id/contribute", requireAuth, async (req, res): Promise<void> => {
  const params = ContributeToGoalParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = ContributeToGoalBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [current] = await db.select().from(goalsTable)
    .where(and(eq(goalsTable.id, params.data.id), eq(goalsTable.profileId, req.user!.userId)));
  if (!current) { res.status(404).json({ error: "Goal not found" }); return; }

  const accountId = req.body?.accountId ? Number(req.body.accountId) : null;
  if (accountId) {
    const [account] = await db.select({ id: accountsTable.id }).from(accountsTable)
      .where(and(eq(accountsTable.id, accountId), eq(accountsTable.profileId, req.user!.userId))).limit(1);
    if (!account) { res.status(404).json({ error: "Account not found" }); return; }
  }
  const newAmount = parseFloat(current.currentAmount) + parsed.data.amount;
  const isCompleted = newAmount >= parseFloat(current.targetAmount);
  const result = await db.transaction(async tx => {
    let transactionId: number | null = null;
    if (accountId) {
      const [entry] = await tx.insert(transactionsTable).values({
        profileId: req.user!.userId, accountId, type: "expense", direction: "debit",
        amount: String(parsed.data.amount), date: new Date().toISOString().slice(0, 10),
        description: `Contribution to ${current.name}`, category: "Savings goals",
        status: "cleared",
      }).returning({ id: transactionsTable.id });
      transactionId = entry.id;
    }
    const [contribution] = await tx.insert(goalContributionsTable).values({
      profileId: req.user!.userId, goalId: current.id, accountId, transactionId,
      amount: String(parsed.data.amount), note: req.body?.note || null,
    }).returning();
    const [goal] = await tx.update(goalsTable)
      .set({ currentAmount: String(newAmount), isCompleted, version: sql`${goalsTable.version} + 1` })
      .where(and(eq(goalsTable.id, params.data.id), eq(goalsTable.profileId, req.user!.userId))).returning();
    return { goal, contribution };
  });
  await writeAudit(req, "contribute", "goal", current.id, current, result);
  res.json({ ...serializeGoal(result.goal), contribution: result.contribution });
});

router.get("/goals/:id/contributions", requireAuth, async (req, res) => {
  const goalId = Number(req.params.id);
  const rows = await db.select().from(goalContributionsTable)
    .where(and(eq(goalContributionsTable.goalId, goalId), eq(goalContributionsTable.profileId, req.user!.userId)))
    .orderBy(goalContributionsTable.createdAt);
  res.json(rows.map(row => ({ ...row, amount: Number(row.amount) })));
});

router.post("/goals/:id/contributions/:contributionId/reverse", requireAuth, async (req, res) => {
  const goalId = Number(req.params.id);
  const contributionId = Number(req.params.contributionId);
  const [contribution] = await db.select().from(goalContributionsTable).where(and(
    eq(goalContributionsTable.id, contributionId), eq(goalContributionsTable.goalId, goalId),
    eq(goalContributionsTable.profileId, req.user!.userId), eq(goalContributionsTable.isReversed, false),
  )).limit(1);
  const [goal] = await db.select().from(goalsTable).where(and(
    eq(goalsTable.id, goalId), eq(goalsTable.profileId, req.user!.userId),
  )).limit(1);
  if (!contribution || !goal) { res.status(404).json({ error: "Contribution not found" }); return; }
  const updated = await db.transaction(async tx => {
    await tx.update(goalContributionsTable).set({ isReversed: true }).where(eq(goalContributionsTable.id, contributionId));
    if (contribution.transactionId) {
      await tx.update(transactionsTable).set({ status: "void", version: sql`${transactionsTable.version} + 1` })
        .where(and(eq(transactionsTable.id, contribution.transactionId), eq(transactionsTable.profileId, req.user!.userId)));
    }
    const amount = Math.max(0, Number(goal.currentAmount) - Number(contribution.amount));
    const [next] = await tx.update(goalsTable).set({
      currentAmount: String(amount), isCompleted: amount >= Number(goal.targetAmount),
      version: sql`${goalsTable.version} + 1`,
    }).where(eq(goalsTable.id, goalId)).returning();
    return next;
  });
  await writeAudit(req, "reverse_contribution", "goal", goalId, contribution, updated);
  res.json(serializeGoal(updated));
});

export default router;
