import { pgTable, serial, text, numeric, timestamp, date, integer } from "drizzle-orm/pg-core";
import { profileTable } from "./profile";

export const budgetsTable = pgTable("budgets", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull().references(() => profileTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  period: text("period").notNull(),
  category: text("category"),
  color: text("color"),
  startDate: date("start_date", { mode: "string" }),
  endDate: date("end_date", { mode: "string" }),
  alertThreshold: numeric("alert_threshold", { precision: 5, scale: 2 }),
  rollover: integer("rollover").notNull().default(0),
  version: integer("version").notNull().default(1),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
