import { pgTable, text, serial, timestamp, numeric, date, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const goalsTable = pgTable("goals", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  targetAmount: numeric("target_amount", { precision: 15, scale: 2 }).notNull(),
  currentAmount: numeric("current_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  deadline: date("deadline", { mode: "string" }),
  priority: text("priority"),
  color: text("color"),
  icon: text("icon"),
  notes: text("notes"),
  recurringContribution: numeric("recurring_contribution", { precision: 15, scale: 2 }),
  recurringFrequency: text("recurring_frequency"),
  isCompleted: boolean("is_completed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertGoalSchema = createInsertSchema(goalsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGoal = z.infer<typeof insertGoalSchema>;
export type Goal = typeof goalsTable.$inferSelect;
