import { Router } from "express";
import { db, remindersTable } from "@workspace/db";
import { eq, and, gte, asc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import {
  CreateReminderBody, UpdateReminderBody,
  GetReminderParams, UpdateReminderParams, DeleteReminderParams,
  CompleteReminderParams, ListRemindersQueryParams,
} from "@workspace/api-zod";
import { nextOccurrence } from "../lib/dates";
import { writeAudit } from "../lib/audit";

const router = Router();

function serializeReminder(r: typeof remindersTable.$inferSelect) {
  return {
    id: r.id, title: r.title, type: r.type,
    amount: r.amount != null ? parseFloat(r.amount) : null,
    dueDate: r.dueDate, recurring: r.recurring,
    recurringFrequency: r.recurringFrequency, notes: r.notes,
    isCompleted: r.isCompleted, createdAt: r.createdAt.toISOString(),
  };
}

router.get("/reminders", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListRemindersQueryParams.safeParse(req.query);
  const upcoming = parsed.success ? parsed.data.upcoming : undefined;
  const userId = req.user!.userId;
  const today = new Date().toISOString().slice(0, 10);

  let reminders;
  if (upcoming === true) {
    reminders = await db.select().from(remindersTable)
      .where(and(eq(remindersTable.profileId, userId), gte(remindersTable.dueDate, today)))
      .orderBy(asc(remindersTable.dueDate));
  } else {
    reminders = await db.select().from(remindersTable)
      .where(eq(remindersTable.profileId, userId))
      .orderBy(asc(remindersTable.dueDate));
  }
  res.json(reminders.map(serializeReminder));
});

router.post("/reminders", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateReminderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const data = parsed.data;
  const [reminder] = await db.insert(remindersTable).values({
    profileId: req.user!.userId,
    title: data.title, type: data.type,
    amount: data.amount != null ? String(data.amount) : null,
    dueDate: data.dueDate, recurring: data.recurring ?? false,
    recurringFrequency: data.recurringFrequency ?? null,
    notes: data.notes ?? null, isCompleted: false,
  }).returning();
  res.status(201).json(serializeReminder(reminder));
});

router.get("/reminders/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetReminderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [reminder] = await db.select().from(remindersTable)
    .where(and(eq(remindersTable.id, params.data.id), eq(remindersTable.profileId, req.user!.userId)));
  if (!reminder) { res.status(404).json({ error: "Reminder not found" }); return; }
  res.json(serializeReminder(reminder));
});

router.patch("/reminders/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateReminderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateReminderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const data = parsed.data;
  const updates: Record<string, unknown> = {};
  if (data.title != null) updates.title = data.title;
  if (data.type != null) updates.type = data.type;
  if (data.amount != null) updates.amount = String(data.amount);
  if (data.dueDate != null) updates.dueDate = data.dueDate;
  if (data.recurring != null) updates.recurring = data.recurring;
  if (data.recurringFrequency != null) updates.recurringFrequency = data.recurringFrequency;
  if (data.notes != null) updates.notes = data.notes;
  if (data.isCompleted != null) updates.isCompleted = data.isCompleted;

  const [reminder] = await db.update(remindersTable).set(updates)
    .where(and(eq(remindersTable.id, params.data.id), eq(remindersTable.profileId, req.user!.userId))).returning();
  if (!reminder) { res.status(404).json({ error: "Reminder not found" }); return; }
  res.json(serializeReminder(reminder));
});

router.delete("/reminders/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteReminderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [deleted] = await db.delete(remindersTable)
    .where(and(eq(remindersTable.id, params.data.id), eq(remindersTable.profileId, req.user!.userId))).returning();
  if (!deleted) { res.status(404).json({ error: "Reminder not found" }); return; }
  res.sendStatus(204);
});

router.post("/reminders/:id/complete", requireAuth, async (req, res): Promise<void> => {
  const params = CompleteReminderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [current] = await db.select().from(remindersTable)
    .where(and(eq(remindersTable.id, params.data.id), eq(remindersTable.profileId, req.user!.userId))).limit(1);
  if (!current) { res.status(404).json({ error: "Reminder not found" }); return; }
  const [reminder] = await db.transaction(async tx => {
    const completed = await tx.update(remindersTable)
      .set({ isCompleted: true, version: sql`${remindersTable.version} + 1` })
      .where(eq(remindersTable.id, current.id)).returning();
    if (current.recurring && current.recurringFrequency) {
      await tx.insert(remindersTable).values({
        profileId: current.profileId, title: current.title, type: current.type, amount: current.amount,
        dueDate: nextOccurrence(current.dueDate, current.recurringFrequency), recurring: true,
        recurringFrequency: current.recurringFrequency, notes: current.notes, isCompleted: false,
      });
    }
    return completed;
  });
  await writeAudit(req, "complete", "reminder", reminder.id, current, reminder);
  res.json(serializeReminder(reminder));
});

export default router;
