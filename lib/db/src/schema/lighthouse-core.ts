import { pgTable, serial, integer, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const personalVaultsTable = pgTable(
  "personal_vaults",
  {
    id: serial("id").primaryKey(),
    householdId: integer("household_id").notNull(),
    ownerUserId: integer("owner_user_id").notNull(),
    lighthousePassportId: text("lighthouse_passport_id"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("personal_vaults_household_owner_idx").on(t.householdId, t.ownerUserId),
  ]
);

export const sharedSpacesTable = pgTable(
  "shared_spaces",
  {
    id: serial("id").primaryKey(),
    householdId: integer("household_id").notNull(),
    name: text("name").notNull(),
    contextType: text("context_type").notNull().default("household"),
    createdById: integer("created_by_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("shared_spaces_household_idx").on(t.householdId)]
);

export const dataSourcesTable = pgTable(
  "data_sources",
  {
    id: serial("id").primaryKey(),
    householdId: integer("household_id").notNull(),
    ownerUserId: integer("owner_user_id").notNull(),
    provider: text("provider").notNull(),
    connectorMode: text("connector_mode").notNull(),
    dataCategories: jsonb("data_categories").notNull().default([]),
    requiredScopes: jsonb("required_scopes").notNull().default([]),
    collectionMode: text("collection_mode").notNull().default("manual_upload"),
    refreshLimits: jsonb("refresh_limits").notNull().default({}),
    lastSuccessfulSyncAt: timestamp("last_successful_sync_at", { withTimezone: true }),
    cursor: text("cursor"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    retentionPolicy: text("retention_policy").notNull().default("user-controlled"),
    allowedPurposes: jsonb("allowed_purposes").notNull().default([]),
    sensitivity: text("sensitivity").notNull().default("personal"),
    termsReviewStatus: text("terms_review_status").notNull().default("not-reviewed"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("data_sources_owner_provider_idx").on(t.ownerUserId, t.provider),
    index("data_sources_household_idx").on(t.householdId),
  ]
);

export const dataRecordsTable = pgTable(
  "data_records",
  {
    id: serial("id").primaryKey(),
    householdId: integer("household_id").notNull(),
    ownerUserId: integer("owner_user_id").notNull(),
    subjectUserId: integer("subject_user_id"),
    sharedSpaceId: integer("shared_space_id"),
    sourceId: integer("source_id"),
    recordType: text("record_type").notNull(),
    factKind: text("fact_kind").notNull().default("recorded_fact"),
    sensitivity: text("sensitivity").notNull().default("personal"),
    provenance: jsonb("provenance").notNull().default({}),
    allowedPurposes: jsonb("allowed_purposes").notNull().default([]),
    retentionState: text("retention_state").notNull().default("active"),
    deletionRequestedAt: timestamp("deletion_requested_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("data_records_household_owner_idx").on(t.householdId, t.ownerUserId),
    index("data_records_subject_idx").on(t.subjectUserId),
  ]
);

export const consentGrantsTable = pgTable(
  "consent_grants",
  {
    id: serial("id").primaryKey(),
    householdId: integer("household_id").notNull(),
    ownerUserId: integer("owner_user_id").notNull(),
    subjectUserId: integer("subject_user_id"),
    granteeUserId: integer("grantee_user_id"),
    dataCategory: text("data_category").notNull(),
    purpose: text("purpose").notNull(),
    allowedUse: text("allowed_use").notNull(),
    prohibitedUses: jsonb("prohibited_uses").notNull().default([]),
    sensitivity: text("sensitivity").notNull().default("personal"),
    status: text("status").notNull().default("active"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("consent_grants_owner_idx").on(t.ownerUserId),
    index("consent_grants_household_idx").on(t.householdId),
  ]
);

export const sharingGrantsTable = pgTable(
  "sharing_grants",
  {
    id: serial("id").primaryKey(),
    householdId: integer("household_id").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: integer("resource_id").notNull(),
    grantorUserId: integer("grantor_user_id").notNull(),
    granteeUserId: integer("grantee_user_id").notNull(),
    permission: text("permission").notNull().default("read"),
    purpose: text("purpose").notNull().default("user_share"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedById: integer("revoked_by_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => [
    index("sharing_grants_resource_idx").on(t.resourceType, t.resourceId),
    index("sharing_grants_grantee_idx").on(t.householdId, t.granteeUserId),
  ]
);

export const auditEventsTable = pgTable(
  "audit_events",
  {
    id: serial("id").primaryKey(),
    householdId: integer("household_id").notNull(),
    actorUserId: integer("actor_user_id").notNull(),
    targetType: text("target_type").notNull(),
    targetId: integer("target_id"),
    eventType: text("event_type").notNull(),
    summary: text("summary").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_events_target_idx").on(t.targetType, t.targetId),
    index("audit_events_household_created_idx").on(t.householdId, t.createdAt),
  ]
);

export const signalDefinitionsTable = pgTable(
  "signal_definitions",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    domain: text("domain").notNull(),
    unit: text("unit").notNull(),
    timeWindow: text("time_window").notNull(),
    formulaVersion: text("formula_version").notNull(),
    definition: text("definition").notNull(),
    inputRequirements: jsonb("input_requirements").notNull().default({}),
    allowedUses: jsonb("allowed_uses").notNull().default([]),
    prohibitedUses: jsonb("prohibited_uses").notNull().default([]),
    sensitivity: text("sensitivity").notNull().default("personal"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("signal_definitions_domain_idx").on(t.domain)]
);

export const signalObservationsTable = pgTable(
  "signal_observations",
  {
    id: serial("id").primaryKey(),
    householdId: integer("household_id").notNull(),
    ownerUserId: integer("owner_user_id").notNull(),
    subjectUserId: integer("subject_user_id").notNull(),
    signalDefinitionId: integer("signal_definition_id").notNull(),
    value: text("value").notNull(),
    confidence: text("confidence").notNull().default("unknown"),
    missingDataCoverage: text("missing_data_coverage").notNull().default("unknown"),
    evidenceWindow: text("evidence_window").notNull(),
    provenance: jsonb("provenance").notNull().default({}),
    visibility: text("visibility").notNull().default("private"),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("signal_observations_subject_idx").on(t.subjectUserId, t.signalDefinitionId),
    index("signal_observations_owner_idx").on(t.ownerUserId),
  ]
);

export const insertSharingGrantSchema = createInsertSchema(sharingGrantsTable).omit({ id: true, createdAt: true });
export const insertAuditEventSchema = createInsertSchema(auditEventsTable).omit({ id: true, createdAt: true });
export type SharingGrant = typeof sharingGrantsTable.$inferSelect;
export type AuditEvent = typeof auditEventsTable.$inferSelect;
export type InsertSharingGrant = z.infer<typeof insertSharingGrantSchema>;
export type InsertAuditEvent = z.infer<typeof insertAuditEventSchema>;
