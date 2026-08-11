import { Router } from "express";
import { collections, getCollection } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.delete("/reset", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  await Promise.all([
    collections.transactions, collections.budgets, collections.goals,
    collections.goalContributions, collections.reminders, collections.categories,
  ].map(async (name) => (await getCollection(name)).deleteMany({ profileId: userId })));

  res.json({ ok: true, message: "All your data has been reset." });
});

export default router;
