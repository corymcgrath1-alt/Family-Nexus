import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const planningTasksTable = pgTable("planning_tasks", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull().default("other"),
  completed: boolean("completed").notNull().default(false),
  dueDate: text("due_date"),
  calendarEventId: text("calendar_event_id"),
  invitationId: text("invitation_id"),
  assigneeId: text("assignee_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPlanningTaskSchema = createInsertSchema(planningTasksTable).omit({
  id: true,
  createdAt: true,
});
export type InsertPlanningTask = z.infer<typeof insertPlanningTaskSchema>;
export type PlanningTask = typeof planningTasksTable.$inferSelect;
