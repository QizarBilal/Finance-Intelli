import { Router } from "express";
import { db } from "@workspace/db";
import { remindersTable } from "@workspace/db";
import { eq, gte, lte, and } from "drizzle-orm";

const router = Router();

function serializeReminder(r: typeof remindersTable.$inferSelect) {
  return {
    ...r,
    amount: r.amount ? Number(r.amount) : null,
    created_at: r.created_at.toISOString(),
  };
}

router.get("/reminders", async (req, res) => {
  try {
    const upcomingDays = req.query.upcoming_days ? Number(req.query.upcoming_days) : undefined;
    let rows = await db.select().from(remindersTable);
    if (upcomingDays != null) {
      const today = new Date();
      const future = new Date();
      future.setDate(future.getDate() + upcomingDays);
      const todayStr = today.toISOString().split("T")[0];
      const futureStr = future.toISOString().split("T")[0];
      rows = rows.filter(r => r.due_date >= todayStr && r.due_date <= futureStr);
    }
    rows.sort((a, b) => a.due_date.localeCompare(b.due_date));
    return res.json(rows.map(serializeReminder));
  } catch (err) {
    req.log.error({ err }, "Failed to list reminders");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/reminders", async (req, res) => {
  try {
    const body = req.body;
    const inserted = await db.insert(remindersTable).values({
      title: body.title,
      description: body.description ?? null,
      due_date: body.due_date,
      amount: body.amount != null ? String(body.amount) : null,
      category: body.category ?? null,
      is_recurring: body.is_recurring ?? false,
      recurring_frequency: body.recurring_frequency ?? null,
      is_paid: false,
      notify_days_before: body.notify_days_before ?? 3,
    }).returning();
    return res.status(201).json(serializeReminder(inserted[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to create reminder");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/reminders/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body;
    const updated = await db.update(remindersTable).set({
      title: body.title,
      description: body.description,
      due_date: body.due_date,
      amount: body.amount != null ? String(body.amount) : undefined,
      category: body.category,
      is_recurring: body.is_recurring,
      recurring_frequency: body.recurring_frequency,
      is_paid: body.is_paid,
      notify_days_before: body.notify_days_before,
    }).where(eq(remindersTable.id, id)).returning();
    if (updated.length === 0) return res.status(404).json({ error: "Not found" });
    return res.json(serializeReminder(updated[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to update reminder");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/reminders/:id", async (req, res) => {
  try {
    await db.delete(remindersTable).where(eq(remindersTable.id, Number(req.params.id)));
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete reminder");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
