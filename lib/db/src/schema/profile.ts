import { pgTable, serial, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const profileTable = pgTable("profile", {
  id: serial("id").primaryKey(),
  username: text("username").unique(),
  password_hash: text("password_hash"),
  full_name: text("full_name").notNull(),
  occupation: text("occupation"),
  company: text("company"),
  job_status: text("job_status"),
  income_type: text("income_type"),
  currency: text("currency").notNull().default("INR"),
  country: text("country"),
  state: text("state"),
  city: text("city"),
  monthly_income: numeric("monthly_income", { precision: 15, scale: 2 }),
  salary_frequency: text("salary_frequency"),
  monthly_goal: numeric("monthly_goal", { precision: 15, scale: 2 }),
  weekly_savings_goal: numeric("weekly_savings_goal", { precision: 15, scale: 2 }),
  emergency_fund_goal: numeric("emergency_fund_goal", { precision: 15, scale: 2 }),
  week_start_day: text("week_start_day").default("Monday"),
  theme: text("theme").notNull().default("dark"),
  date_format: text("date_format").default("DD/MM/YYYY"),
  avatar_url: text("avatar_url"),
  notification_preferences: text("notification_preferences"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProfileSchema = createInsertSchema(profileTable).omit({ id: true, created_at: true, updated_at: true });
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profileTable.$inferSelect;
