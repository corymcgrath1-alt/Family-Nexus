import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  householdId: integer("household_id").notNull(),
  userId: integer("user_id").notNull(),
  type: text("type").notNull(), // 'message' | 'invitation' | 'rsvp_change' | 'planning_task'
  title: text("title").notNull(),
  body: text("body"),
  referenceId: text("reference_id"),
  referenceType: text("reference_type"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notificationsTable).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notificationsTable.$inferSelect;
