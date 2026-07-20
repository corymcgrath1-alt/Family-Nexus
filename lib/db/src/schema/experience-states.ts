import { pgTable, text, boolean, timestamp, serial, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const experienceStatesTable = pgTable(
  "experience_states",
  {
    id: serial("id").primaryKey(),
    experienceId: text("experience_id").notNull(),
    viewerId: text("viewer_id").notNull().default("alex"),
    isSaved: boolean("is_saved").notNull().default(false),
    isHidden: boolean("is_hidden").notNull().default(false),
    isShortlisted: boolean("is_shortlisted").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("uniq_exp_viewer").on(table.experienceId, table.viewerId)]
);

export const insertExperienceStateSchema = createInsertSchema(experienceStatesTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertExperienceState = z.infer<typeof insertExperienceStateSchema>;
export type ExperienceState = typeof experienceStatesTable.$inferSelect;
