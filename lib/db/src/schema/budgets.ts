import { pgTable, serial, text, numeric, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const budgetsTable = pgTable("budgets", {
  id: serial("id").primaryKey(),
  period: text("period").notNull(), // daily | weekly | monthly | yearly
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  category_id: integer("category_id"),
  name: text("name"),
  start_date: date("start_date"),
  end_date: date("end_date"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertBudgetSchema = createInsertSchema(budgetsTable).omit({ id: true, created_at: true });
export type InsertBudget = z.infer<typeof insertBudgetSchema>;
export type Budget = typeof budgetsTable.$inferSelect;
