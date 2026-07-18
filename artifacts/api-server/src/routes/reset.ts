import { Router } from "express";
import { db, transactionsTable, categoriesTable, budgetsTable, goalsTable, remindersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.delete("/reset", requireAuth, async (_req, res): Promise<void> => {
  // Delete all user data in dependency order (transactions first, then others)
  await db.delete(transactionsTable);
  await db.delete(budgetsTable);
  await db.delete(goalsTable);
  await db.delete(remindersTable);
  await db.delete(categoriesTable);

  res.json({ ok: true, message: "All data has been reset." });
});

export default router;
