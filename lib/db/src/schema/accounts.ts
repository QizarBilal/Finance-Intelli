import { boolean, check, date, index, integer, numeric, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { profileTable } from "./profile";

export const accountsTable = pgTable("accounts", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull().references(() => profileTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull(),
  currency: text("currency").notNull().default("INR"),
  openingBalance: numeric("opening_balance", { precision: 18, scale: 2 }).notNull().default("0"),
  interestRate: numeric("interest_rate", { precision: 7, scale: 4 }),
  minimumPayment: numeric("minimum_payment", { precision: 18, scale: 2 }),
  institution: text("institution"),
  accountNumberLast4: text("account_number_last4"),
  color: text("color"),
  icon: text("icon"),
  includeInNetWorth: boolean("include_in_net_worth").notNull().default(true),
  status: text("status").notNull().default("active"),
  lastReconciledDate: date("last_reconciled_date", { mode: "string" }),
  version: integer("version").notNull().default(1),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("accounts_profile_name_uq").on(table.profileId, table.name),
  index("accounts_profile_status_idx").on(table.profileId, table.status),
  check("accounts_type_check", sql`${table.type} in ('cash','bank','credit_card','loan','investment','wallet')`),
  check("accounts_status_check", sql`${table.status} in ('active','archived','closed')`),
]);

export const accountBalanceSnapshotsTable = pgTable("account_balance_snapshots", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull().references(() => profileTable.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => accountsTable.id, { onDelete: "cascade" }),
  balance: numeric("balance", { precision: 18, scale: 2 }).notNull(),
  asOfDate: date("as_of_date", { mode: "string" }).notNull(),
  source: text("source").notNull().default("system"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("account_balance_snapshot_uq").on(table.accountId, table.asOfDate, table.source),
  index("account_balance_snapshot_profile_date_idx").on(table.profileId, table.asOfDate),
]);

export const reconciliationsTable = pgTable("reconciliations", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull().references(() => profileTable.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => accountsTable.id, { onDelete: "cascade" }),
  statementDate: date("statement_date", { mode: "string" }).notNull(),
  statementBalance: numeric("statement_balance", { precision: 18, scale: 2 }).notNull(),
  calculatedBalance: numeric("calculated_balance", { precision: 18, scale: 2 }).notNull(),
  difference: numeric("difference", { precision: 18, scale: 2 }).notNull(),
  status: text("status").notNull().default("open"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("reconciliations_profile_account_idx").on(table.profileId, table.accountId),
  check("reconciliations_status_check", sql`${table.status} in ('open','completed','cancelled')`),
]);
