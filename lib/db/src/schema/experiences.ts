import { boolean, index, integer, jsonb, numeric, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { profileTable } from "./profile";
import { transactionsTable } from "./transactions";
import { accountsTable } from "./accounts";
import { householdsTable } from "./product";

export const subscriptionsTable = pgTable("subscriptions", {
  id: serial("id").primaryKey(), profileId: integer("profile_id").notNull().references(() => profileTable.id, { onDelete: "cascade" }),
  merchant: text("merchant").notNull(), amount: numeric("amount", { precision: 18, scale: 2 }).notNull(), frequency: text("frequency").notNull().default("monthly"),
  nextChargeDate: text("next_charge_date"), status: text("status").notNull().default("active"), cancelUrl: text("cancel_url"), source: text("source").notNull().default("detected"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("subscriptions_profile_status_idx").on(table.profileId, table.status)]);

export const receiptsTable = pgTable("receipts", {
  id: serial("id").primaryKey(), profileId: integer("profile_id").notNull().references(() => profileTable.id, { onDelete: "cascade" }),
  transactionId: integer("transaction_id").references(() => transactionsTable.id, { onDelete: "set null" }), filename: text("filename").notNull(),
  storageKey: text("storage_key"), merchant: text("merchant"), amount: numeric("amount", { precision: 18, scale: 2 }), purchasedAt: text("purchased_at"),
  ocrStatus: text("ocr_status").notNull().default("manual_review"), extractedData: jsonb("extracted_data").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const taxTagsTable = pgTable("tax_tags", {
  id: serial("id").primaryKey(), profileId: integer("profile_id").notNull().references(() => profileTable.id, { onDelete: "cascade" }),
  transactionId: integer("transaction_id").notNull().references(() => transactionsTable.id, { onDelete: "cascade" }), taxYear: integer("tax_year").notNull(),
  classification: text("classification").notNull(), deductiblePercent: numeric("deductible_percent", { precision: 5, scale: 2 }).notNull().default("100"), note: text("note"),
}, table => [uniqueIndex("tax_tags_profile_transaction_uq").on(table.profileId, table.transactionId)]);

export const monthlyReviewsTable = pgTable("monthly_reviews", {
  id: serial("id").primaryKey(), profileId: integer("profile_id").notNull().references(() => profileTable.id, { onDelete: "cascade" }),
  month: text("month").notNull(), step: integer("step").notNull().default(1), status: text("status").notNull().default("in_progress"),
  answers: jsonb("answers").notNull().default({}), completedAt: timestamp("completed_at", { withTimezone: true }),
}, table => [uniqueIndex("monthly_reviews_profile_month_uq").on(table.profileId, table.month)]);

export const notificationPreferencesTable = pgTable("notification_preferences", {
  id: serial("id").primaryKey(), profileId: integer("profile_id").notNull().references(() => profileTable.id, { onDelete: "cascade" }),
  lowBalance: boolean("low_balance").notNull().default(true), bills: boolean("bills").notNull().default(true), budgets: boolean("budgets").notNull().default(true),
  subscriptions: boolean("subscriptions").notNull().default(true), weeklyDigest: boolean("weekly_digest").notNull().default(true), lowBalanceThreshold: numeric("low_balance_threshold", { precision: 18, scale: 2 }).notNull().default("500"),
}, table => [uniqueIndex("notification_preferences_profile_uq").on(table.profileId)]);

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(), profileId: integer("profile_id").notNull().references(() => profileTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(), title: text("title").notNull(), message: text("message").notNull(), actionUrl: text("action_url"), readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("notifications_profile_read_idx").on(table.profileId, table.readAt)]);

export const creditSnapshotsTable = pgTable("credit_snapshots", {
  id: serial("id").primaryKey(), profileId: integer("profile_id").notNull().references(() => profileTable.id, { onDelete: "cascade" }),
  score: integer("score"), utilization: numeric("utilization", { precision: 5, scale: 2 }), totalLimit: numeric("total_limit", { precision: 18, scale: 2 }),
  statementBalance: numeric("statement_balance", { precision: 18, scale: 2 }), source: text("source").notNull().default("manual"), snapshotDate: text("snapshot_date").notNull(),
}, table => [uniqueIndex("credit_snapshots_profile_date_uq").on(table.profileId, table.snapshotDate)]);

export const investmentsTable = pgTable("investments", {
  id: serial("id").primaryKey(), profileId: integer("profile_id").notNull().references(() => profileTable.id, { onDelete: "cascade" }),
  accountId: integer("account_id").references(() => accountsTable.id, { onDelete: "set null" }), symbol: text("symbol").notNull(), name: text("name").notNull(),
  assetClass: text("asset_class").notNull(), quantity: numeric("quantity", { precision: 24, scale: 8 }).notNull(), costBasis: numeric("cost_basis", { precision: 18, scale: 2 }).notNull().default("0"),
  currentPrice: numeric("current_price", { precision: 18, scale: 4 }).notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dashboardLayoutsTable = pgTable("dashboard_layouts", {
  id: serial("id").primaryKey(), profileId: integer("profile_id").notNull().references(() => profileTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(), widgets: jsonb("widgets").notNull().default([]), isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex("dashboard_layouts_profile_name_uq").on(table.profileId, table.name)]);

export const householdApprovalsTable = pgTable("household_approvals", {
  id: serial("id").primaryKey(), householdId: integer("household_id").notNull().references(() => householdsTable.id, { onDelete: "cascade" }),
  requestedByProfileId: integer("requested_by_profile_id").notNull().references(() => profileTable.id, { onDelete: "cascade" }), type: text("type").notNull(),
  title: text("title").notNull(), amount: numeric("amount", { precision: 18, scale: 2 }), payload: jsonb("payload").notNull().default({}), status: text("status").notNull().default("pending"),
  decidedByProfileId: integer("decided_by_profile_id").references(() => profileTable.id, { onDelete: "set null" }), decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
