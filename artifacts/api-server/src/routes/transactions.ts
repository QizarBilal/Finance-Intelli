import { Router } from "express";
import { db } from "@workspace/db";
import { transactionsTable, categoriesTable } from "@workspace/db";
import { eq, desc, ilike } from "drizzle-orm";

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
    // prefer free-text category over FK lookup
    category_name: t.category ?? cat?.name ?? null,
    category_color: cat?.color ?? null,
    category_icon: cat?.icon ?? null,
    created_at: t.created_at.toISOString(),
  };
}

/**
 * Given a free-text category name, find or create the category and return its id.
 * Returns null if name is blank.
 */
async function resolveCategoryId(name: string | null | undefined): Promise<number | null> {
  if (!name || !name.trim()) return null;
  const trimmed = name.trim();
  const existing = await db.select().from(categoriesTable)
    .where(ilike(categoriesTable.name, trimmed)).limit(1);
  if (existing.length > 0) return existing[0].id;
  // Create a new category on the fly
  const [created] = await db.insert(categoriesTable).values({
    name: trimmed,
    type: "expense", // default; user can edit later
    icon: "Tag",
    color: "#6366f1",
    is_default: false,
    sort_order: 99,
  }).returning();
  return created.id;
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
        (r.category ?? "").toLowerCase().includes(q) ||
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
    // Support free-text category: resolve to category_id if possible
    const resolvedCategoryId = body.category_id
      ? Number(body.category_id)
      : await resolveCategoryId(body.category);

    const [inserted] = await db.insert(transactionsTable).values({
      type: body.type,
      amount: String(body.amount),
      date: body.date,
      time: body.time ?? null,
      description: body.description ?? null,
      category: body.category ?? null,
      category_id: resolvedCategoryId,
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
    return res.status(201).json(await enrichTransaction(inserted));
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
    const resolvedCategoryId = body.category_id != null
      ? Number(body.category_id)
      : body.category != null
        ? await resolveCategoryId(body.category)
        : undefined;

    const [updated] = await db.update(transactionsTable).set({
      type: body.type,
      amount: body.amount != null ? String(body.amount) : undefined,
      date: body.date,
      time: body.time,
      description: body.description,
      category: body.category,
      category_id: resolvedCategoryId,
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
    if (!updated) return res.status(404).json({ error: "Not found" });
    return res.json(await enrichTransaction(updated));
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
