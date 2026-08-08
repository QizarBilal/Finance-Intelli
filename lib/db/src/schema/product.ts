import { boolean, index, integer, jsonb, numeric, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { profileTable } from "./profile";
import { accountsTable } from "./accounts";
import { categoriesTable } from "./categories";
import { transactionsTable } from "./transactions";

export const transactionSplitsTable = pgTable("transaction_splits", {
  id: serial("id").primaryKey(),
  transactionId: integer("transaction_id").notNull().references(() => transactionsTable.id, { onDelete: "cascade" }),
  categoryId: integer("category_id").references(() => categoriesTable.id, { onDelete: "set null" }),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  note: text("note"),
}, table => [index("transaction_splits_transaction_idx").on(table.transactionId)]);

export const categorizationRulesTable = pgTable("categorization_rules", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull().references(() => profileTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  field: text("field").notNull(),
  operator: text("operator").notNull(),
  value: text("value").notNull(),
  categoryId: integer("category_id").references(() => categoriesTable.id, { onDelete: "set null" }),
  merchant: text("merchant"),
  priority: integer("priority").notNull().default(100),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("categorization_rules_profile_priority_idx").on(table.profileId, table.priority)]);

export const importBatchesTable = pgTable("import_batches", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull().references(() => profileTable.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => accountsTable.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  status: text("status").notNull().default("preview"),
  totalRows: integer("total_rows").notNull().default(0),
  importedRows: integer("imported_rows").notNull().default(0),
  duplicateRows: integer("duplicate_rows").notNull().default(0),
  mapping: jsonb("mapping"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const attachmentsTable = pgTable("attachments", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull().references(() => profileTable.id, { onDelete: "cascade" }),
  transactionId: integer("transaction_id").references(() => transactionsTable.id, { onDelete: "cascade" }),
  storageKey: text("storage_key").notNull(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  encrypted: boolean("encrypted").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const exchangeRatesTable = pgTable("exchange_rates", {
  id: serial("id").primaryKey(),
  baseCurrency: text("base_currency").notNull(),
  quoteCurrency: text("quote_currency").notNull(),
  rate: numeric("rate", { precision: 20, scale: 8 }).notNull(),
  rateDate: text("rate_date").notNull(),
  source: text("source").notNull(),
}, table => [uniqueIndex("exchange_rates_pair_date_uq").on(table.baseCurrency, table.quoteCurrency, table.rateDate)]);

export const jobsTable = pgTable("jobs", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").references(() => profileTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  lastError: text("last_error"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("jobs_ready_idx").on(table.status, table.runAt)]);

export const savedViewsTable = pgTable("saved_views", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull().references(() => profileTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  scope: text("scope").notNull(),
  filters: jsonb("filters").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex("saved_views_profile_scope_name_uq").on(table.profileId, table.scope, table.name)]);

export const householdsTable = pgTable("households", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ownerProfileId: integer("owner_profile_id").notNull().references(() => profileTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const householdMembersTable = pgTable("household_members", {
  id: serial("id").primaryKey(),
  householdId: integer("household_id").notNull().references(() => householdsTable.id, { onDelete: "cascade" }),
  profileId: integer("profile_id").notNull().references(() => profileTable.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex("household_members_household_profile_uq").on(table.householdId, table.profileId)]);
