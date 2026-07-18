import { pgTable, text, serial, timestamp, numeric, boolean, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // expense | income | transfer
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  date: date("date", { mode: "string" }).notNull(),
  time: text("time"),
  category: text("category"),
  description: text("description"),
  paymentMethod: text("payment_method"),
  receipt: text("receipt"),
  location: text("location"),
  tags: text("tags"),
  notes: text("notes"),
  priority: text("priority"),
  recurring: boolean("recurring").notNull().default(false),
  recurringFrequency: text("recurring_frequency"),
  needOrWant: text("need_or_want"),
  taxDeductible: boolean("tax_deductible").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
