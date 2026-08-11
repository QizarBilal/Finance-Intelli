import { Router } from "express";
import { getCollection, nextId, withoutMongoId } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import {
  CreateReminderBody,
  UpdateReminderBody,
  GetReminderParams,
  UpdateReminderParams,
  DeleteReminderParams,
  CompleteReminderParams,
  ListRemindersQueryParams,
} from "@workspace/api-zod";
import { nextOccurrence } from "../lib/dates";
import { writeAudit } from "../lib/audit";

const router = Router();
const serialize = (r: any) => ({
  ...withoutMongoId(r),
  amount: r.amount == null ? null : Number(r.amount),
  createdAt: new Date(r.createdAt).toISOString(),
});

router.get("/reminders", requireAuth, async (req, res) => {
  const parsed = ListRemindersQueryParams.safeParse(req.query);
  const filter: any = { profileId: req.user!.userId };
  if (parsed.success && parsed.data.upcoming === true)
    filter.dueDate = { $gte: new Date().toISOString().slice(0, 10) };
  const reminders = await getCollection("reminders");
  res.json(
    (await reminders.find(filter).sort({ dueDate: 1 }).toArray()).map(
      serialize,
    ),
  );
});

router.post("/reminders", requireAuth, async (req, res) => {
  const parsed = CreateReminderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const now = new Date();
  const d = parsed.data;
  const reminder: any = {
    id: await nextId("reminders"),
    profileId: req.user!.userId,
    title: d.title,
    type: d.type,
    amount: d.amount ?? null,
    dueDate: d.dueDate,
    recurring: d.recurring ?? false,
    recurringFrequency: d.recurringFrequency ?? null,
    notes: d.notes ?? null,
    isCompleted: false,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  await (await getCollection("reminders")).insertOne(reminder);
  res.status(201).json(serialize(reminder));
});

router.get("/reminders/:id", requireAuth, async (req, res) => {
  const p = GetReminderParams.safeParse(req.params);
  if (!p.success) {
    res.status(400).json({ error: p.error.message });
    return;
  }
  const row = await (
    await getCollection("reminders")
  ).findOne({ id: p.data.id, profileId: req.user!.userId });
  if (!row) {
    res.status(404).json({ error: "Reminder not found" });
    return;
  }
  res.json(serialize(row));
});

router.patch("/reminders/:id", requireAuth, async (req, res) => {
  const p = UpdateReminderParams.safeParse(req.params),
    b = UpdateReminderBody.safeParse(req.body);
  if (!p.success) {
    res.status(400).json({ error: p.error.message });
    return;
  }
  if (!b.success) {
    res.status(400).json({ error: b.error.message });
    return;
  }
  const updates: any = { ...b.data, updatedAt: new Date() };
  const result = await (
    await getCollection("reminders")
  ).findOneAndUpdate(
    { id: p.data.id, profileId: req.user!.userId },
    { $set: updates, $inc: { version: 1 } },
    { returnDocument: "after" },
  );
  if (!result) {
    res.status(404).json({ error: "Reminder not found" });
    return;
  }
  res.json(serialize(result));
});

router.delete("/reminders/:id", requireAuth, async (req, res) => {
  const p = DeleteReminderParams.safeParse(req.params);
  if (!p.success) {
    res.status(400).json({ error: p.error.message });
    return;
  }
  const result = await (
    await getCollection("reminders")
  ).deleteOne({ id: p.data.id, profileId: req.user!.userId });
  if (!result.deletedCount) {
    res.status(404).json({ error: "Reminder not found" });
    return;
  }
  res.sendStatus(204);
});

router.post("/reminders/:id/complete", requireAuth, async (req, res) => {
  const p = CompleteReminderParams.safeParse(req.params);
  if (!p.success) {
    res.status(400).json({ error: p.error.message });
    return;
  }
  const col = await getCollection("reminders"),
    current: any = await col.findOne({
      id: p.data.id,
      profileId: req.user!.userId,
    });
  if (!current) {
    res.status(404).json({ error: "Reminder not found" });
    return;
  }
  const reminder: any = await col.findOneAndUpdate(
    { id: current.id },
    {
      $set: { isCompleted: true, updatedAt: new Date() },
      $inc: { version: 1 },
    },
    { returnDocument: "after" },
  );
  if (current.recurring && current.recurringFrequency) {
    const now = new Date();
    await col.insertOne({
      ...withoutMongoId(current),
      id: await nextId("reminders"),
      dueDate: nextOccurrence(current.dueDate, current.recurringFrequency),
      isCompleted: false,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }
  await writeAudit(req, "complete", "reminder", reminder.id, current, reminder);
  res.json(serialize(reminder));
});

export default router;
