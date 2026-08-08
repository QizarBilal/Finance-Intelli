import { pgTable, serial, text, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { profileTable } from "./profile";

export const categoriesTable = pgTable("categories", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull().references(() => profileTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  type: text("type").notNull().default("both"),
  icon: text("icon"),
  color: text("color"),
  usageCount: integer("usage_count").notNull().default(0),
}, (table) => [uniqueIndex("categories_profile_normalized_type_uq").on(table.profileId, table.normalizedName, table.type)]);
