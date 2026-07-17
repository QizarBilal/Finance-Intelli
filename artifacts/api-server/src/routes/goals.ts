import { Router } from "express";
import { db } from "@workspace/db";
import { goalsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

function serializeGoal(g: typeof goalsTable.$inferSelect) {
  return {
    ...g,
    target_amount: Number(g.target_amount),
    current_amount: Number(g.current_amount ?? 0),
    created_at: g.created_at.toISOString(),
  };
}

router.get("/goals", async (req, res) => {
  try {
    const rows = await db.select().from(goalsTable);
    return res.json(rows.map(serializeGoal));
  } catch (err) {
    req.log.error({ err }, "Failed to list goals");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/goals", async (req, res) => {
  try {
    const body = req.body;
    const inserted = await db.insert(goalsTable).values({
      name: body.name,
      icon: body.icon ?? null,
      color: body.color ?? null,
      target_amount: String(body.target_amount),
      current_amount: body.current_amount != null ? String(body.current_amount) : "0",
      target_date: body.target_date ?? null,
      description: body.description ?? null,
      is_completed: false,
    }).returning();
    return res.status(201).json(serializeGoal(inserted[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to create goal");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/goals/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body;
    const updated = await db.update(goalsTable).set({
      name: body.name,
      icon: body.icon,
      color: body.color,
      target_amount: body.target_amount != null ? String(body.target_amount) : undefined,
      current_amount: body.current_amount != null ? String(body.current_amount) : undefined,
      target_date: body.target_date,
      description: body.description,
      is_completed: body.is_completed,
    }).where(eq(goalsTable.id, id)).returning();
    if (updated.length === 0) return res.status(404).json({ error: "Not found" });
    return res.json(serializeGoal(updated[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to update goal");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/goals/:id", async (req, res) => {
  try {
    await db.delete(goalsTable).where(eq(goalsTable.id, Number(req.params.id)));
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete goal");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
