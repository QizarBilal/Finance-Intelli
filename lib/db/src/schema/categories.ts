import { pgTable, serial, text, numeric, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const categoriesTable = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull().default("expense"), // expense | income | any
  icon: text("icon"),
  color: text("color"),
  description: text("description"),
  budget: numeric("budget", { precision: 15, scale: 2 }),
  is_default: boolean("is_default").default(false),
  sort_order: integer("sort_order").default(0),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertCategorySchema = createInsertSchema(categoriesTable).omit({ id: true, created_at: true });
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categoriesTable.$inferSelect;
