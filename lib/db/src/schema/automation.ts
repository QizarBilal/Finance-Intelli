import { boolean, date, index, integer, numeric, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { profileTable } from "./profile";
import { accountsTable } from "./accounts";
import { goalsTable } from "./goals";
import { transactionsTable } from "./transactions";

export const recurringRulesTable = pgTable("recurring_rules", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull().references(() => profileTable.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  frequency: text("frequency").notNull(),
  interval: integer("interval").notNull().default(1),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
  endDate: date("end_date", { mode: "string" }),
  maxOccurrences: integer("max_occurrences"),
  occurrenceCount: integer("occurrence_count").notNull().default(0),
  mode: text("mode").notNull().default("confirm"),
  status: text("status").notNull().default("active"),
  timezone: text("timezone").notNull().default("UTC"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [index("recurring_rules_due_idx").on(table.status, table.nextRunAt)]);

export const recurrenceRunsTable = pgTable("recurrence_runs", {
  id: serial("id").primaryKey(),
  ruleId: integer("rule_id").notNull().references(() => recurringRulesTable.id, { onDelete: "cascade" }),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
  status: text("status").notNull(),
  resultEntityId: integer("result_entity_id"),
  error: text("error"),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("recurrence_runs_idempotency_uq").on(table.ruleId, table.scheduledFor)]);

export const goalContributionsTable = pgTable("goal_contributions", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull().references(() => profileTable.id, { onDelete: "cascade" }),
  goalId: integer("goal_id").notNull().references(() => goalsTable.id, { onDelete: "cascade" }),
  accountId: integer("account_id").references(() => accountsTable.id, { onDelete: "set null" }),
  transactionId: integer("transaction_id").references(() => transactionsTable.id, { onDelete: "set null" }),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  note: text("note"),
  reversedContributionId: integer("reversed_contribution_id"),
  isReversed: boolean("is_reversed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("goal_contributions_goal_created_idx").on(table.goalId, table.createdAt)]);
