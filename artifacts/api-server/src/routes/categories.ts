import { Router } from "express";
import { db, categoriesTable, transactionsTable } from "@workspace/db";
import { eq, and, or, desc, sql, isNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { CreateCategoryBody, ListCategoriesQueryParams } from "@workspace/api-zod";

const router = Router();

router.get("/categories", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListCategoriesQueryParams.safeParse(req.query);
  const type = parsed.success ? parsed.data.type : "all";
  const userId = req.user!.userId;

  let categories;
  if (type === "expense") {
    categories = await db.select().from(categoriesTable)
      .where(and(eq(categoriesTable.profileId, userId), or(eq(categoriesTable.type, "expense"), eq(categoriesTable.type, "both"))))
      .orderBy(desc(categoriesTable.usageCount));
  } else if (type === "income") {
    categories = await db.select().from(categoriesTable)
      .where(and(eq(categoriesTable.profileId, userId), or(eq(categoriesTable.type, "income"), eq(categoriesTable.type, "both"))))
      .orderBy(desc(categoriesTable.usageCount));
  } else {
    categories = await db.select().from(categoriesTable)
      .where(eq(categoriesTable.profileId, userId))
      .orderBy(desc(categoriesTable.usageCount));
  }
  const usage = await db.select({
    categoryId: transactionsTable.categoryId,
    count: sql<number>`count(*)::int`,
  }).from(transactionsTable).where(and(
    eq(transactionsTable.profileId, userId), isNull(transactionsTable.deletedAt),
  )).groupBy(transactionsTable.categoryId);
  const usageMap = new Map(usage.map(row => [row.categoryId, row.count]));
  res.json(categories.map(category => ({ ...category, usageCount: usageMap.get(category.id) ?? 0 })));
});

router.post("/categories", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { name, type, icon, color } = parsed.data;
  const normalizedName = name.trim().toLocaleLowerCase();
  const userId = req.user!.userId;

  // Upsert per user
  const [existing] = await db.select().from(categoriesTable)
    .where(and(eq(categoriesTable.normalizedName, normalizedName), eq(categoriesTable.profileId, userId))).limit(1);
  if (existing) { res.status(200).json(existing); return; }

  const [category] = await db.insert(categoriesTable).values({
    profileId: userId, name: name.trim(), normalizedName, type: type ?? "both", icon: icon ?? null, color: color ?? null, usageCount: 0,
  }).returning();
  res.status(201).json(category);
});

export default router;
