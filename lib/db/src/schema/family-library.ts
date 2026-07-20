import { pgTable, serial, integer, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const libraryItemsTable = pgTable(
  "library_items",
  {
    id: serial("id").primaryKey(),
    householdId: integer("household_id").notNull(),
    ownerUserId: integer("owner_user_id").notNull(),
    subjectUserId: integer("subject_user_id"),
    ownerKind: text("owner_kind").notNull().default("person"),
    visibility: text("visibility").notNull().default("private"),
    category: text("category").notNull().default("note"),
    title: text("title").notNull(),
    body: text("body"),
    sourceType: text("source_type").notNull().default("manual"),
    sourceLabel: text("source_label"),
    provenance: jsonb("provenance").notNull().default({}),
    effectiveDate: text("effective_date"),
    sensitivity: text("sensitivity").notNull().default("personal"),
    retentionPolicy: text("retention_policy").notNull().default("keep-until-archived"),
    retentionDeleteAfter: text("retention_delete_after"),
    allowedPurposes: jsonb("allowed_purposes").notNull().default(["remember", "search", "share"]),
    status: text("status").notNull().default("active"),
    version: integer("version").notNull().default(1),
    createdById: integer("created_by_id").notNull(),
    updatedById: integer("updated_by_id").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("library_items_household_status_idx").on(t.householdId, t.status),
    index("library_items_owner_idx").on(t.ownerUserId),
    index("library_items_visibility_idx").on(t.visibility),
  ]
);

export const insertLibraryItemSchema = createInsertSchema(libraryItemsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertLibraryItem = z.infer<typeof insertLibraryItemSchema>;
export type LibraryItem = typeof libraryItemsTable.$inferSelect;
