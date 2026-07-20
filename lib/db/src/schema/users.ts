import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  householdId: integer("household_id").notNull(),
  lighthousePassportId: text("lighthouse_passport_id").unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull().default(""),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("adult"), // 'adult' | 'child'
  avatarInitials: text("avatar_initials").notNull().default(""),
  color: text("color").notNull().default("#888888"),
  age: integer("age"),
  messagesLastSeenAt: timestamp("messages_last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
