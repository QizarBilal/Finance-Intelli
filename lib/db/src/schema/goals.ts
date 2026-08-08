import { pgTable, serial, text, numeric, boolean, timestamp, date, integer } from "drizzle-orm/pg-core";
import { profileTable } from "./profile";

export const goalsTable = pgTable("goals", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull().references(() => profileTable.id, { onDelete: "cascade" }),
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
  version: integer("version").notNull().default(1),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
