import { pgTable, serial, integer, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const messagesTable = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    householdId: integer("household_id").notNull(),
    senderId: integer("sender_id").notNull(),
    body: text("body").notNull(),
    messageType: text("message_type").notNull().default("message"),
    hasExperienceMention: boolean("has_experience_mention").notNull().default(false),
    experienceMentionText: text("experience_mention_text"),
    savedAsMemoryId: integer("saved_as_memory_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_household_created_idx").on(t.householdId, t.createdAt)]
);

export const insertMessageSchema = createInsertSchema(messagesTable).omit({ id: true, createdAt: true });
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messagesTable.$inferSelect;
