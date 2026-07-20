import { pgTable, text, serial, timestamp, boolean, numeric, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const memoriesTable = pgTable("memories", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  sourceType: text("source_type").notNull().default("manual"),
  sourceMessage: text("source_message"),
  mentionedBy: text("mentioned_by"),
  imageUrl: text("image_url"),
  link: text("link"),
  season: text("season"),
  budgetEstimate: numeric("budget_estimate"),
  participantIds: jsonb("participant_ids").notNull().default([]),
  surpriseEligible: boolean("surprise_eligible").notNull().default(false),
  advancePlanningNeeded: boolean("advance_planning_needed").notNull().default(false),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMemorySchema = createInsertSchema(memoriesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMemory = z.infer<typeof insertMemorySchema>;
export type Memory = typeof memoriesTable.$inferSelect;
