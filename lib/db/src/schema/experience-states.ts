import { pgTable, integer, boolean, timestamp, serial, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { text } from "drizzle-orm/pg-core";

export const experienceStatesTable = pgTable(
  "experience_states",
  {
    id: serial("id").primaryKey(),
    householdId: integer("household_id").notNull(),
    userId: integer("user_id").notNull(),
    experienceId: text("experience_id").notNull(),
    isSaved: boolean("is_saved").notNull().default(false),
    isHidden: boolean("is_hidden").notNull().default(false),
    isShortlisted: boolean("is_shortlisted").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("uniq_exp_user").on(table.experienceId, table.userId)]
);

export const insertExperienceStateSchema = createInsertSchema(experienceStatesTable).omit({ id: true, updatedAt: true });
export type InsertExperienceState = z.infer<typeof insertExperienceStateSchema>;
export type ExperienceState = typeof experienceStatesTable.$inferSelect;
