import { Router } from "express";
import { and, eq, lte, sql } from "drizzle-orm";
import { db, recurrenceRunsTable, recurringRulesTable, remindersTable, transactionsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { nextOccurrence } from "../lib/dates";
import { writeAudit } from "../lib/audit";

const router = Router();
const frequencies = new Set(["daily", "weekly", "monthly", "quarterly", "yearly"]);

router.get("/recurring", requireAuth, async (req, res) => {
  const rules = await db.select().from(recurringRulesTable)
    .where(eq(recurringRulesTable.profileId, req.user!.userId))
    .orderBy(recurringRulesTable.nextRunAt);
  res.json(rules);
});

router.post("/recurring", requireAuth, async (req, res) => {
  const { entityType, entityId, frequency, interval = 1, nextRunAt, endDate, maxOccurrences, mode = "confirm", timezone = "UTC" } = req.body ?? {};
  if (!["transaction", "reminder"].includes(entityType) || !Number.isInteger(Number(entityId)) ||
      !frequencies.has(frequency) || !["automatic", "confirm"].includes(mode) || !nextRunAt) {
    res.status(400).json({ error: "A valid source, schedule, and execution mode are required." }); return;
  }
  const [rule] = await db.insert(recurringRulesTable).values({
    profileId: req.user!.userId, entityType, entityId: Number(entityId), frequency,
    interval: Math.max(1, Number(interval)), nextRunAt: new Date(nextRunAt),
    endDate: endDate || null, maxOccurrences: maxOccurrences ? Number(maxOccurrences) : null,
    mode, timezone,
  }).returning();
  await writeAudit(req, "create", "recurring_rule", rule.id, null, rule);
  res.status(201).json(rule);
});

router.post("/recurring/:id/skip", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const [rule] = await db.select().from(recurringRulesTable)
    .where(and(eq(recurringRulesTable.id, id), eq(recurringRulesTable.profileId, req.user!.userId))).limit(1);
  if (!rule) { res.status(404).json({ error: "Recurring rule not found" }); return; }
  const next = nextOccurrence(rule.nextRunAt.toISOString().slice(0, 10), rule.frequency, rule.interval);
  await db.transaction(async tx => {
    await tx.insert(recurrenceRunsTable).values({ ruleId: id, scheduledFor: rule.nextRunAt, status: "skipped" }).onConflictDoNothing();
    await tx.update(recurringRulesTable).set({ nextRunAt: new Date(`${next}T12:00:00Z`) }).where(eq(recurringRulesTable.id, id));
  });
  res.json({ nextRunAt: next });
});

router.post("/recurring/process", requireAuth, async (req, res) => {
  const now = new Date();
  const due = await db.select().from(recurringRulesTable).where(and(
    eq(recurringRulesTable.profileId, req.user!.userId),
    eq(recurringRulesTable.status, "active"),
    lte(recurringRulesTable.nextRunAt, now),
  ));
  const results: Array<{ ruleId: number; status: string }> = [];
  for (const rule of due) {
    const shouldStop = (rule.endDate && rule.endDate < now.toISOString().slice(0, 10)) ||
      (rule.maxOccurrences != null && rule.occurrenceCount >= rule.maxOccurrences);
    if (shouldStop) {
      await db.update(recurringRulesTable).set({ status: "completed" }).where(eq(recurringRulesTable.id, rule.id));
      continue;
    }
    const [existing] = await db.select().from(recurrenceRunsTable)
      .where(and(eq(recurrenceRunsTable.ruleId, rule.id), eq(recurrenceRunsTable.scheduledFor, rule.nextRunAt))).limit(1);
    if (existing) continue;
    let resultEntityId: number | null = null;
    const runStatus = rule.mode === "confirm" ? "awaiting_confirmation" : "created";
    await db.transaction(async tx => {
      if (rule.mode === "automatic" && rule.entityType === "transaction") {
        const [source] = await tx.select().from(transactionsTable).where(and(
          eq(transactionsTable.id, rule.entityId), eq(transactionsTable.profileId, rule.profileId),
        )).limit(1);
        if (source) {
          const [created] = await tx.insert(transactionsTable).values({
            profileId: source.profileId, accountId: source.accountId, categoryId: source.categoryId,
            type: source.type, direction: source.direction, amount: source.amount,
            date: rule.nextRunAt.toISOString().slice(0, 10), time: source.time, category: source.category,
            description: source.description, paymentMethod: source.paymentMethod, location: source.location,
            tags: source.tags, notes: source.notes, priority: source.priority, recurring: true,
            recurringFrequency: rule.frequency, needOrWant: source.needOrWant,
            taxDeductible: source.taxDeductible, status: "pending", merchant: source.merchant,
          }).returning({ id: transactionsTable.id });
          resultEntityId = created.id;
        }
      }
      const next = nextOccurrence(rule.nextRunAt.toISOString().slice(0, 10), rule.frequency, rule.interval);
      await tx.insert(recurrenceRunsTable).values({
        ruleId: rule.id, scheduledFor: rule.nextRunAt, status: runStatus, resultEntityId,
      });
      await tx.update(recurringRulesTable).set({
        nextRunAt: new Date(`${next}T12:00:00Z`),
        occurrenceCount: sql`${recurringRulesTable.occurrenceCount} + 1`,
      }).where(eq(recurringRulesTable.id, rule.id));
    });
    results.push({ ruleId: rule.id, status: runStatus });
  }
  res.json({ processed: results.length, results });
});

export default router;
