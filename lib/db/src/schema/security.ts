import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { profileTable } from "./profile";

export const sessionsTable = pgTable("sessions", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull().references(() => profileTable.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("sessions_profile_active_idx").on(table.profileId, table.revokedAt, table.expiresAt)]);

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").references(() => profileTable.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("audit_logs_profile_created_idx").on(table.profileId, table.createdAt)]);

export const loginAttemptsTable = pgTable("login_attempts", {
  id: serial("id").primaryKey(),
  identifierHash: text("identifier_hash").notNull(),
  ipAddress: text("ip_address"),
  succeeded: text("succeeded").notNull().default("false"),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("login_attempts_identifier_time_idx").on(table.identifierHash, table.attemptedAt)]);
