import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const householdInvitesTable = pgTable("household_invites", {
  id: serial("id").primaryKey(),
  householdId: integer("household_id").notNull(),
  inviterUserId: integer("inviter_user_id").notNull(),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertHouseholdInviteSchema = createInsertSchema(householdInvitesTable).omit({ id: true, createdAt: true });
export type InsertHouseholdInvite = z.infer<typeof insertHouseholdInviteSchema>;
export type HouseholdInvite = typeof householdInvitesTable.$inferSelect;
