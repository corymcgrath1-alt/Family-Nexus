import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const reflectionsTable = pgTable("reflections", {
  id: serial("id").primaryKey(),
  memberId: text("member_id").notNull(),
  calendarEventId: text("calendar_event_id").notNull(),
  visibility: text("visibility").notNull().default("private"),
  enjoyment: integer("enjoyment"),
  wouldRepeat: boolean("would_repeat"),
  bestPart: text("best_part"),
  costComfort: text("cost_comfort"),
  durationFit: text("duration_fit"),
  crowdFit: text("crowd_fit"),
  feltConsidered: boolean("felt_considered"),
  planningEffortFelt: text("planning_effort_felt"),
  traditionWorthy: boolean("tradition_worthy"),
  rememberFor: text("remember_for"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertReflectionSchema = createInsertSchema(reflectionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertReflection = z.infer<typeof insertReflectionSchema>;
export type Reflection = typeof reflectionsTable.$inferSelect;
