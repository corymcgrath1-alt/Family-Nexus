import { pgTable, text, serial, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const invitationsTable = pgTable("invitations", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  inviterId: text("inviter_id").notNull(),
  inviteeIds: jsonb("invitee_ids").notNull().default([]),
  experienceId: text("experience_id").notNull(),
  experienceTitle: text("experience_title").notNull().default(""),
  status: text("status").notNull().default("draft"),
  purpose: text("purpose"),
  proposedDate: text("proposed_date"),
  proposedDateFlexible: boolean("proposed_date_flexible").notNull().default(false),
  durationMinutes: integer("duration_minutes"),
  detailLevel: text("detail_level").notNull().default("full"),
  dressGuidance: text("dress_guidance"),
  whatToBring: text("what_to_bring"),
  planningResponsibility: text("planning_responsibility"),
  paymentArrangement: text("payment_arrangement"),
  transportationNotes: text("transportation_notes"),
  childcareNotes: text("childcare_notes"),
  reservationStatus: text("reservation_status"),
  accessibilityNotes: text("accessibility_notes"),
  message: text("message"),
  isSurprise: boolean("is_surprise").notNull().default(false),
  surpriseRevealedFields: jsonb("surprise_revealed_fields").notNull().default([]),
  rsvpResponse: text("rsvp_response"),
  rsvpNote: text("rsvp_note"),
  rsvpAt: timestamp("rsvp_at", { withTimezone: true }),
  calendarEventId: text("calendar_event_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertInvitationSchema = createInsertSchema(invitationsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  rsvpAt: true,
});
export type InsertInvitation = z.infer<typeof insertInvitationSchema>;
export type Invitation = typeof invitationsTable.$inferSelect;
