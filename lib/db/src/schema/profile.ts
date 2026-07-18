import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const profileTable = pgTable("profile", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  occupation: text("occupation"),
  jobStatus: text("job_status"),
  incomeType: text("income_type"),
  country: text("country"),
  state: text("state"),
  currency: text("currency").notNull().default("INR"),
  currencySymbol: text("currency_symbol").notNull().default("₹"),
  theme: text("theme").notNull().default("dark"),
  weekStarts: text("week_starts").notNull().default("monday"),
  salaryFrequency: text("salary_frequency"),
  photo: text("photo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertProfileSchema = createInsertSchema(profileTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profileTable.$inferSelect;
