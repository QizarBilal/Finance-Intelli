import { Router } from "express";
import {
  collections,
  getCollection,
  nextId,
  withoutMongoId,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { nextOccurrence } from "../lib/dates";
import { writeAudit } from "../lib/audit";
const router = Router(),
  frequencies = new Set(["daily", "weekly", "monthly", "quarterly", "yearly"]);
router.get("/recurring", requireAuth, async (req, res) =>
  res.json(
    (await getCollection(collections.recurringRules))
      .find({ profileId: req.user!.userId })
      .sort({ nextRunAt: 1 })
      .map(withoutMongoId)
      .toArray(),
  ),
);
router.post("/recurring", requireAuth, async (req, res) => {
  const {
    entityType,
    entityId,
    frequency,
    interval = 1,
    nextRunAt,
    endDate,
    maxOccurrences,
    mode = "confirm",
    timezone = "UTC",
  } = req.body ?? {};
  if (
    !["transaction", "reminder"].includes(entityType) ||
    !Number.isInteger(Number(entityId)) ||
    !frequencies.has(frequency) ||
    !["automatic", "confirm"].includes(mode) ||
    !nextRunAt
  ) {
    res
      .status(400)
      .json({
        error: "A valid source, schedule, and execution mode are required.",
      });
    return;
  }
  const now = new Date(),
    rule: any = {
      id: await nextId(collections.recurringRules),
      profileId: req.user!.userId,
      entityType,
      entityId: Number(entityId),
      frequency,
      interval: Math.max(1, Number(interval)),
      nextRunAt: new Date(nextRunAt),
      endDate: endDate || null,
      maxOccurrences: maxOccurrences ? Number(maxOccurrences) : null,
      mode,
      timezone,
      status: "active",
      occurrenceCount: 0,
      createdAt: now,
      updatedAt: now,
    };
  await (await getCollection(collections.recurringRules)).insertOne(rule);
  await writeAudit(req, "create", "recurring_rule", rule.id, null, rule);
  res.status(201).json(withoutMongoId(rule));
});
router.post("/recurring/:id/skip", requireAuth, async (req, res) => {
  const id = Number(req.params.id),
    rules = await getCollection(collections.recurringRules),
    rule: any = await rules.findOne({ id, profileId: req.user!.userId });
  if (!rule) {
    res.status(404).json({ error: "Recurring rule not found" });
    return;
  }
  const next = nextOccurrence(
    new Date(rule.nextRunAt).toISOString().slice(0, 10),
    rule.frequency,
    rule.interval,
  );
  await (
    await getCollection(collections.recurrenceRuns)
  ).updateOne(
    { ruleId: id, scheduledFor: rule.nextRunAt },
    {
      $setOnInsert: {
        id: await nextId(collections.recurrenceRuns),
        ruleId: id,
        scheduledFor: rule.nextRunAt,
        status: "skipped",
        createdAt: new Date(),
      },
    },
    { upsert: true },
  );
  await rules.updateOne(
    { id },
    {
      $set: { nextRunAt: new Date(`${next}T12:00:00Z`), updatedAt: new Date() },
    },
  );
  res.json({ nextRunAt: next });
});
router.post("/recurring/process", requireAuth, async (req, res) => {
  const rules = await getCollection(collections.recurringRules),
    runs = await getCollection(collections.recurrenceRuns),
    now = new Date(),
    due: any[] = await rules
      .find({
        profileId: req.user!.userId,
        status: "active",
        nextRunAt: { $lte: now },
      })
      .toArray(),
    results: any[] = [];
  for (const rule of due) {
    if (
      (rule.endDate && rule.endDate < now.toISOString().slice(0, 10)) ||
      (rule.maxOccurrences != null &&
        rule.occurrenceCount >= rule.maxOccurrences)
    ) {
      await rules.updateOne(
        { id: rule.id },
        { $set: { status: "completed", updatedAt: now } },
      );
      continue;
    }
    if (await runs.findOne({ ruleId: rule.id, scheduledFor: rule.nextRunAt }))
      continue;
    let resultEntityId: null | number = null,
      status = rule.mode === "confirm" ? "awaiting_confirmation" : "created";
    if (rule.mode === "automatic" && rule.entityType === "transaction") {
      const txs = await getCollection(collections.transactions),
        source: any = await txs.findOne({
          id: rule.entityId,
          profileId: rule.profileId,
        });
      if (source) {
        const created: any = {
          ...withoutMongoId(source),
          id: await nextId(collections.transactions),
          date: new Date(rule.nextRunAt).toISOString().slice(0, 10),
          status: "pending",
          recurring: true,
          recurringFrequency: rule.frequency,
          createdAt: now,
          updatedAt: now,
          version: 1,
        };
        await txs.insertOne(created);
        resultEntityId = created.id;
      }
    }
    await runs.insertOne({
      id: await nextId(collections.recurrenceRuns),
      ruleId: rule.id,
      scheduledFor: rule.nextRunAt,
      status,
      resultEntityId,
      createdAt: now,
    });
    const next = nextOccurrence(
      new Date(rule.nextRunAt).toISOString().slice(0, 10),
      rule.frequency,
      rule.interval,
    );
    await rules.updateOne(
      { id: rule.id },
      {
        $set: { nextRunAt: new Date(`${next}T12:00:00Z`), updatedAt: now },
        $inc: { occurrenceCount: 1 },
      },
    );
    results.push({ ruleId: rule.id, status });
  }
  res.json({ processed: results.length, results });
});
export default router;
