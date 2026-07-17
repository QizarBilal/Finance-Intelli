import { pgTable, serial, text, numeric, boolean, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // expense | income
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  date: date("date").notNull(),
  time: text("time"),
  description: text("description"),
  category: text("category"),           // free-text category name (user typed)
  category_id: integer("category_id"),  // optional FK — null when using free-text
  subcategory: text("subcategory"),
  payment_method: text("payment_method"),
  location: text("location"),
  tags: text("tags"),
  notes: text("notes"),
  is_recurring: boolean("is_recurring").default(false),
  recurring_frequency: text("recurring_frequency"),
  mood: text("mood"),
  need_or_want: text("need_or_want"),
  is_business: boolean("is_business").default(false),
  is_tax_deductible: boolean("is_tax_deductible").default(false),
  receipt_url: text("receipt_url"),
  income_source: text("income_source"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ id: true, created_at: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
