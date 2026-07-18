import { pgTable, text, serial, timestamp, numeric, date, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const remindersTable = pgTable("reminders", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  type: text("type").notNull(), // bills | recharge | rent | insurance | emi | investment | salary | personal | custom
  amount: numeric("amount", { precision: 15, scale: 2 }),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  recurring: boolean("recurring").notNull().default(false),
  recurringFrequency: text("recurring_frequency"),
  notes: text("notes"),
  isCompleted: boolean("is_completed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertReminderSchema = createInsertSchema(remindersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertReminder = z.infer<typeof insertReminderSchema>;
export type Reminder = typeof remindersTable.$inferSelect;
