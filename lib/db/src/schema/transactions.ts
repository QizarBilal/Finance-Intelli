import { pgTable, serial, text, numeric, boolean, timestamp, date, integer, index, check, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { profileTable } from "./profile";
import { accountsTable } from "./accounts";
import { categoriesTable } from "./categories";

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull().references(() => profileTable.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => accountsTable.id, { onDelete: "restrict" }),
  categoryId: integer("category_id").references(() => categoriesTable.id, { onDelete: "set null" }),
  transferGroupId: uuid("transfer_group_id"),
  type: text("type").notNull(),
  direction: text("direction").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  date: date("date", { mode: "string" }).notNull(),
  time: text("time"),
  category: text("category"),
  description: text("description"),
  paymentMethod: text("payment_method"),
  receipt: text("receipt"),
  location: text("location"),
  tags: text("tags"),
  notes: text("notes"),
  priority: text("priority"),
  recurring: boolean("recurring").notNull().default(false),
  recurringFrequency: text("recurring_frequency"),
  needOrWant: text("need_or_want"),
  taxDeductible: boolean("tax_deductible").notNull().default(false),
  status: text("status").notNull().default("cleared"),
  merchant: text("merchant"),
  externalId: text("external_id"),
  fingerprint: text("fingerprint"),
  version: integer("version").notNull().default(1),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("transactions_profile_date_idx").on(table.profileId, table.date),
  index("transactions_profile_type_date_idx").on(table.profileId, table.type, table.date),
  index("transactions_profile_category_date_idx").on(table.profileId, table.categoryId, table.date),
  index("transactions_account_status_date_idx").on(table.accountId, table.status, table.date),
  index("transactions_transfer_group_idx").on(table.transferGroupId),
  check("transactions_amount_positive_check", sql`${table.amount} > 0`),
  check("transactions_type_check", sql`${table.type} in ('expense','income','transfer')`),
  check("transactions_direction_check", sql`${table.direction} in ('debit','credit')`),
  check("transactions_status_check", sql`${table.status} in ('pending','cleared','reconciled','void')`),
]);
