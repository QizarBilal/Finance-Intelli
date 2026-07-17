import { Router } from "express";
import { db } from "@workspace/db";
import { budgetsTable, categoriesTable, transactionsTable } from "@workspace/db";
import { eq, and, gte, lte, sql } from "drizzle-orm";

const router = Router();

function periodDates(period: string) {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  if (period === "daily") {
    return { start: today, end: today };
  } else if (period === "weekly") {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(now.setDate(diff));
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return { start: mon.toISOString().split("T")[0], end: sun.toISOString().split("T")[0] };
  } else if (period === "monthly") {
    const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start, end: endDate.toISOString().split("T")[0] };
  } else {
    return { start: `${now.getFullYear()}-01-01`, end: `${now.getFullYear()}-12-31` };
  }
}

// GET /budgets/utilization must come before /budgets/:id
router.get("/budgets/utilization", async (req, res) => {
  try {
    const period = (req.query.period as string) || "monthly";
    const budgets = await db.select().from(budgetsTable).where(eq(budgetsTable.period, period));
    const { start, end } = periodDates(period);

    const result = [];
    for (const b of budgets) {
      let spent = 0;
      if (b.category_id) {
        const rows = await db.select({ total: sql<string>`COALESCE(SUM(amount::numeric), 0)` })
          .from(transactionsTable)
          .where(and(
            eq(transactionsTable.type, "expense"),
            eq(transactionsTable.category_id, b.category_id),
            gte(transactionsTable.date, start),
            lte(transactionsTable.date, end),
          ));
        spent = Number(rows[0]?.total ?? 0);
      } else {
        const rows = await db.select({ total: sql<string>`COALESCE(SUM(amount::numeric), 0)` })
          .from(transactionsTable)
          .where(and(
            eq(transactionsTable.type, "expense"),
            gte(transactionsTable.date, start),
            lte(transactionsTable.date, end),
          ));
        spent = Number(rows[0]?.total ?? 0);
      }
      const budgetAmount = Number(b.amount);
      const pct = budgetAmount > 0 ? Math.round((spent / budgetAmount) * 100) : 0;
      let catName: string | null = null;
      if (b.category_id) {
        const cats = await db.select().from(categoriesTable).where(eq(categoriesTable.id, b.category_id)).limit(1);
        catName = cats[0]?.name ?? null;
      }
      result.push({
        budget_id: b.id,
        budget_name: b.name ?? null,
        period: b.period,
        budget_amount: budgetAmount,
        spent_amount: spent,
        utilization_percent: pct,
        category_id: b.category_id ?? null,
        category_name: catName,
        status: pct >= 100 ? "exceeded" : pct >= 80 ? "warning" : "safe",
      });
    }
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to get budget utilization");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/budgets", async (req, res) => {
  try {
    const period = req.query.period as string | undefined;
    let rows = await db.select().from(budgetsTable);
    if (period) rows = rows.filter(b => b.period === period);

    const result = [];
    for (const b of rows) {
      let catName: string | null = null;
      if (b.category_id) {
        const cats = await db.select().from(categoriesTable).where(eq(categoriesTable.id, b.category_id)).limit(1);
        catName = cats[0]?.name ?? null;
      }
      result.push({
        ...b,
        amount: Number(b.amount),
        category_name: catName,
        created_at: b.created_at.toISOString(),
      });
    }
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to list budgets");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/budgets", async (req, res) => {
  try {
    const body = req.body;
    const inserted = await db.insert(budgetsTable).values({
      period: body.period,
      amount: String(body.amount),
      category_id: body.category_id ?? null,
      name: body.name ?? null,
      start_date: body.start_date ?? null,
      end_date: body.end_date ?? null,
    }).returning();
    const b = inserted[0];
    return res.status(201).json({ ...b, amount: Number(b.amount), category_name: null, created_at: b.created_at.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to create budget");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/budgets/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body;
    const updated = await db.update(budgetsTable).set({
      period: body.period,
      amount: body.amount != null ? String(body.amount) : undefined,
      category_id: body.category_id,
      name: body.name,
      start_date: body.start_date,
      end_date: body.end_date,
    }).where(eq(budgetsTable.id, id)).returning();
    if (updated.length === 0) return res.status(404).json({ error: "Not found" });
    const b = updated[0];
    return res.json({ ...b, amount: Number(b.amount), category_name: null, created_at: b.created_at.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to update budget");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/budgets/:id", async (req, res) => {
  try {
    await db.delete(budgetsTable).where(eq(budgetsTable.id, Number(req.params.id)));
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete budget");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
