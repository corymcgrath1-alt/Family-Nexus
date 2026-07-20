import { pgTable, integer, text, serial, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const experienceProfilesTable = pgTable("experience_profiles", {
  id: serial("id").primaryKey(),
  householdId: integer("household_id").notNull(),
  userId: integer("user_id").notNull().unique(),
  interests: jsonb("interests").notNull().default([]),
  dislikes: jsonb("dislikes").notNull().default([]),
  curiosityItems: jsonb("curiosity_items").notNull().default([]),
  foodPreferences: jsonb("food_preferences").notNull().default([]),
  allergies: jsonb("allergies").notNull().default([]),
  crowdTolerance: text("crowd_tolerance").notNull().default("medium"),
  activityLevel: text("activity_level").notNull().default("medium"),
  preferredTimeOfDay: jsonb("preferred_time_of_day").notNull().default([]),
  travelTolerance: text("travel_tolerance").notNull().default("regional"),
  spendingComfort: text("spending_comfort").notNull().default("moderate"),
  surpriseComfort: text("surprise_comfort").notNull().default("some-ok"),
  accessibilityNeeds: jsonb("accessibility_needs").notNull().default([]),
  favorites: jsonb("favorites").notNull().default([]),
  neverSuggest: jsonb("never_suggest").notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertExperienceProfileSchema = createInsertSchema(experienceProfilesTable).omit({ id: true, updatedAt: true });
export type InsertExperienceProfile = z.infer<typeof insertExperienceProfileSchema>;
export type ExperienceProfile = typeof experienceProfilesTable.$inferSelect;
