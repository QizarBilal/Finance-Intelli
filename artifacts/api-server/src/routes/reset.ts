import { Router } from "express";
import { db, transactionsTable, categoriesTable, budgetsTable, goalsTable, remindersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.delete("/reset", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  // Delete only the authenticated user's data, in dependency order
  await db.delete(transactionsTable).where(eq(transactionsTable.profileId, userId));
  await db.delete(budgetsTable).where(eq(budgetsTable.profileId, userId));
  await db.delete(goalsTable).where(eq(goalsTable.profileId, userId));
  await db.delete(remindersTable).where(eq(remindersTable.profileId, userId));
  await db.delete(categoriesTable).where(eq(categoriesTable.profileId, userId));

  res.json({ ok: true, message: "All your data has been reset." });
});

export default router;
