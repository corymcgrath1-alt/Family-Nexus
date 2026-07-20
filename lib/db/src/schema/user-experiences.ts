import { pgTable, serial, integer, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userExperiencesTable = pgTable("user_experiences", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  householdId: integer("household_id").notNull(),
  createdByUserId: integer("created_by_user_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  category: text("category").notNull().default("custom"),
  setting: text("setting").notNull().default("any"),
  durationMinutes: integer("duration_minutes"),
  costEstimate: integer("cost_estimate"),
  energyLevel: text("energy_level").notNull().default("medium"),
  participantIds: jsonb("participant_ids").notNull().default([]),
  visibility: text("visibility").notNull().default("household"), // 'household' | 'private'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserExperienceSchema = createInsertSchema(userExperiencesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUserExperience = z.infer<typeof insertUserExperienceSchema>;
export type UserExperience = typeof userExperiencesTable.$inferSelect;
