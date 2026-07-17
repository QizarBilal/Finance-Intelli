import { Router } from "express";
import { db } from "@workspace/db";
import { transactionsTable, categoriesTable } from "@workspace/db";
import { eq, and, gte, lte, ilike, desc, sql } from "drizzle-orm";

const router = Router();

async function enrichTransaction(t: typeof transactionsTable.$inferSelect) {
  let cat: typeof categoriesTable.$inferSelect | null = null;
  if (t.category_id) {
    const cats = await db.select().from(categoriesTable).where(eq(categoriesTable.id, t.category_id)).limit(1);
    cat = cats[0] ?? null;
  }
  return {
    ...t,
    amount: Number(t.amount),
    category_name: cat?.name ?? null,
    category_color: cat?.color ?? null,
    category_icon: cat?.icon ?? null,
    created_at: t.created_at.toISOString(),
  };
}

router.get("/transactions", async (req, res) => {
  try {
    const { type, category_id, start_date, end_date, payment_method, search, limit = "50", offset = "0" } = req.query as Record<string, string>;

    let rows = await db.select().from(transactionsTable).orderBy(desc(transactionsTable.date), desc(transactionsTable.created_at));

    if (type) rows = rows.filter(r => r.type === type);
    if (category_id) rows = rows.filter(r => r.category_id === Number(category_id));
    if (start_date) rows = rows.filter(r => r.date >= start_date);
    if (end_date) rows = rows.filter(r => r.date <= end_date);
    if (payment_method) rows = rows.filter(r => r.payment_method === payment_method);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        (r.description ?? "").toLowerCase().includes(q) ||
        (r.notes ?? "").toLowerCase().includes(q) ||
        (r.tags ?? "").toLowerCase().includes(q) ||
        String(r.amount).includes(q)
      );
    }

    const total = rows.length;
    const paginated = rows.slice(Number(offset), Number(offset) + Number(limit));

    const enriched = await Promise.all(paginated.map(enrichTransaction));
    return res.json({ transactions: enriched, total });
  } catch (err) {
    req.log.error({ err }, "Failed to list transactions");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/transactions", async (req, res) => {
  try {
    const body = req.body;
    const inserted = await db.insert(transactionsTable).values({
      type: body.type,
      amount: String(body.amount),
      date: body.date,
      time: body.time ?? null,
      description: body.description ?? null,
      category_id: body.category_id,
      subcategory: body.subcategory ?? null,
      payment_method: body.payment_method ?? null,
      location: body.location ?? null,
      tags: body.tags ?? null,
      notes: body.notes ?? null,
      is_recurring: body.is_recurring ?? false,
      recurring_frequency: body.recurring_frequency ?? null,
      mood: body.mood ?? null,
      need_or_want: body.need_or_want ?? null,
      is_business: body.is_business ?? false,
      is_tax_deductible: body.is_tax_deductible ?? false,
      receipt_url: body.receipt_url ?? null,
      income_source: body.income_source ?? null,
    }).returning();
    return res.status(201).json(await enrichTransaction(inserted[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to create transaction");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/transactions/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await db.select().from(transactionsTable).where(eq(transactionsTable.id, id)).limit(1);
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    return res.json(await enrichTransaction(rows[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to get transaction");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/transactions/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body;
    const updated = await db.update(transactionsTable).set({
      type: body.type,
      amount: body.amount != null ? String(body.amount) : undefined,
      date: body.date,
      time: body.time,
      description: body.description,
      category_id: body.category_id,
      subcategory: body.subcategory,
      payment_method: body.payment_method,
      location: body.location,
      tags: body.tags,
      notes: body.notes,
      is_recurring: body.is_recurring,
      recurring_frequency: body.recurring_frequency,
      mood: body.mood,
      need_or_want: body.need_or_want,
      is_business: body.is_business,
      is_tax_deductible: body.is_tax_deductible,
      receipt_url: body.receipt_url,
      income_source: body.income_source,
    }).where(eq(transactionsTable.id, id)).returning();
    if (updated.length === 0) return res.status(404).json({ error: "Not found" });
    return res.json(await enrichTransaction(updated[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to update transaction");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/transactions/:id", async (req, res) => {
  try {
    await db.delete(transactionsTable).where(eq(transactionsTable.id, Number(req.params.id)));
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete transaction");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
