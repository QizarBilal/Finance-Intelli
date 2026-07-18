import { Router } from "express";
import { db, categoriesTable } from "@workspace/db";
import { eq, or, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { CreateCategoryBody, ListCategoriesQueryParams } from "@workspace/api-zod";

const router = Router();

router.get("/categories", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListCategoriesQueryParams.safeParse(req.query);
  const type = parsed.success ? parsed.data.type : "all";

  let categories;
  if (type === "expense") {
    categories = await db.select().from(categoriesTable).where(or(eq(categoriesTable.type, "expense"), eq(categoriesTable.type, "both"))).orderBy(desc(categoriesTable.usageCount));
  } else if (type === "income") {
    categories = await db.select().from(categoriesTable).where(or(eq(categoriesTable.type, "income"), eq(categoriesTable.type, "both"))).orderBy(desc(categoriesTable.usageCount));
  } else {
    categories = await db.select().from(categoriesTable).orderBy(desc(categoriesTable.usageCount));
  }

  res.json(categories);
});

router.post("/categories", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, type, icon, color } = parsed.data;

  // Upsert: return existing if name already exists
  const [existing] = await db.select().from(categoriesTable).where(eq(categoriesTable.name, name)).limit(1);
  if (existing) {
    res.status(200).json(existing);
    return;
  }

  const [category] = await db.insert(categoriesTable).values({
    name,
    type: type ?? "both",
    icon: icon ?? null,
    color: color ?? null,
    usageCount: 0,
  }).returning();

  res.status(201).json(category);
});

export default router;
