import { Router } from "express";
import { db } from "@workspace/db";
import { categoriesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";

const router = Router();

router.get("/categories", async (req, res) => {
  try {
    const type = req.query.type as string | undefined;
    let query = db.select().from(categoriesTable).orderBy(asc(categoriesTable.sort_order), asc(categoriesTable.name));
    const rows = await query;
    const filtered = type && type !== "any" ? rows.filter(r => r.type === type || r.type === "any") : rows;
    return res.json(filtered.map(c => ({
      ...c,
      budget: c.budget ? Number(c.budget) : null,
      created_at: c.created_at.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list categories");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/categories", async (req, res) => {
  try {
    const body = req.body;
    const inserted = await db.insert(categoriesTable).values({
      name: body.name,
      type: body.type ?? "expense",
      icon: body.icon ?? null,
      color: body.color ?? null,
      description: body.description ?? null,
      budget: body.budget != null ? String(body.budget) : null,
      is_default: false,
      sort_order: body.sort_order ?? 0,
    }).returning();
    const c = inserted[0];
    return res.status(201).json({ ...c, budget: c.budget ? Number(c.budget) : null, created_at: c.created_at.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to create category");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/categories/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body;
    const updated = await db.update(categoriesTable).set({
      name: body.name,
      type: body.type,
      icon: body.icon,
      color: body.color,
      description: body.description,
      budget: body.budget != null ? String(body.budget) : null,
      sort_order: body.sort_order,
    }).where(eq(categoriesTable.id, id)).returning();
    if (updated.length === 0) return res.status(404).json({ error: "Not found" });
    const c = updated[0];
    return res.json({ ...c, budget: c.budget ? Number(c.budget) : null, created_at: c.created_at.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to update category");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/categories/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(categoriesTable).where(eq(categoriesTable.id, id));
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete category");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
