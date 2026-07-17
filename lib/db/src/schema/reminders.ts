import { pgTable, serial, text, numeric, boolean, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const remindersTable = pgTable("reminders", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  due_date: date("due_date").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }),
  category: text("category"),
  is_recurring: boolean("is_recurring").default(false),
  recurring_frequency: text("recurring_frequency"),
  is_paid: boolean("is_paid").default(false),
  notify_days_before: integer("notify_days_before").default(3),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertReminderSchema = createInsertSchema(remindersTable).omit({ id: true, created_at: true });
export type InsertReminder = z.infer<typeof insertReminderSchema>;
export type Reminder = typeof remindersTable.$inferSelect;
