import { pgTable, serial, text, numeric, boolean, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const goalsTable = pgTable("goals", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon"),
  color: text("color"),
  target_amount: numeric("target_amount", { precision: 15, scale: 2 }).notNull(),
  current_amount: numeric("current_amount", { precision: 15, scale: 2 }).default("0"),
  target_date: date("target_date"),
  description: text("description"),
  is_completed: boolean("is_completed").default(false),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertGoalSchema = createInsertSchema(goalsTable).omit({ id: true, created_at: true });
export type InsertGoal = z.infer<typeof insertGoalSchema>;
export type Goal = typeof goalsTable.$inferSelect;
