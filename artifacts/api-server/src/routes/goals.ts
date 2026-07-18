import { Router } from "express";
import { db, goalsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
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

const router = Router();

function serializeGoal(g: typeof goalsTable.$inferSelect) {
  return {
    id: g.id,
    name: g.name,
    targetAmount: parseFloat(g.targetAmount),
    currentAmount: parseFloat(g.currentAmount),
    deadline: g.deadline,
    priority: g.priority,
    color: g.color,
    icon: g.icon,
    notes: g.notes,
    recurringContribution: g.recurringContribution != null ? parseFloat(g.recurringContribution) : null,
    recurringFrequency: g.recurringFrequency,
    isCompleted: g.isCompleted,
    createdAt: g.createdAt.toISOString(),
  };
}

router.get("/goals", requireAuth, async (_req, res): Promise<void> => {
  const goals = await db.select().from(goalsTable).orderBy(goalsTable.createdAt);
  res.json(goals.map(serializeGoal));
});

router.post("/goals", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateGoalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const [goal] = await db.insert(goalsTable).values({
    name: data.name,
    targetAmount: String(data.targetAmount),
    currentAmount: data.currentAmount != null ? String(data.currentAmount) : "0",
    deadline: data.deadline ?? null,
    priority: data.priority ?? null,
    color: data.color ?? null,
    icon: data.icon ?? null,
    notes: data.notes ?? null,
    recurringContribution: data.recurringContribution != null ? String(data.recurringContribution) : null,
    recurringFrequency: data.recurringFrequency ?? null,
    isCompleted: false,
  }).returning();

  res.status(201).json(serializeGoal(goal));
});

router.get("/goals/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetGoalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [goal] = await db.select().from(goalsTable).where(eq(goalsTable.id, params.data.id));
  if (!goal) {
    res.status(404).json({ error: "Goal not found" });
    return;
  }

  res.json(serializeGoal(goal));
});

router.patch("/goals/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateGoalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateGoalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

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

  const [goal] = await db.update(goalsTable).set(updates).where(eq(goalsTable.id, params.data.id)).returning();
  if (!goal) {
    res.status(404).json({ error: "Goal not found" });
    return;
  }

  res.json(serializeGoal(goal));
});

router.delete("/goals/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteGoalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db.delete(goalsTable).where(eq(goalsTable.id, params.data.id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Goal not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/goals/:id/contribute", requireAuth, async (req, res): Promise<void> => {
  const params = ContributeToGoalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = ContributeToGoalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [current] = await db.select().from(goalsTable).where(eq(goalsTable.id, params.data.id));
  if (!current) {
    res.status(404).json({ error: "Goal not found" });
    return;
  }

  const newAmount = parseFloat(current.currentAmount) + parsed.data.amount;
  const isCompleted = newAmount >= parseFloat(current.targetAmount);

  const [goal] = await db.update(goalsTable)
    .set({ currentAmount: String(newAmount), isCompleted })
    .where(eq(goalsTable.id, params.data.id))
    .returning();

  res.json(serializeGoal(goal));
});

export default router;
