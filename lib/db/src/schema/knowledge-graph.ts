import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { householdsTable } from "./households";
import { usersTable } from "./users";

const lifecycleColumns = {
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const knowledgeEntityTypesTable = pgTable("knowledge_entity_types", {
  entityType: text("entity_type").primaryKey(),
  displayName: text("display_name").notNull(),
  domain: text("domain").notNull(),
  defaultPrivacyLevel: text("default_privacy_level").notNull(),
  defaultSensitivity: text("default_sensitivity").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const knowledgeRelationshipTypesTable = pgTable("knowledge_relationship_types", {
  relationshipType: text("relationship_type").primaryKey(),
  displayName: text("display_name").notNull(),
  inverseRelationshipType: text("inverse_relationship_type"),
  isSymmetric: boolean("is_symmetric").notNull().default(false),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const knowledgeSourcesTable = pgTable(
  "knowledge_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: integer("household_id").notNull().references(() => householdsTable.id, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
    ownerUserId: integer("owner_user_id").notNull().references(() => usersTable.id, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
    sourceKind: text("source_kind").notNull(),
    provider: text("provider").notNull(),
    connectorKey: text("connector_key"),
    connectorVersion: text("connector_version"),
    sourceLabel: text("source_label"),
    externalReference: text("external_reference"),
    confidenceScore: numeric("confidence_score", { precision: 5, scale: 4 }).notNull().default("1"),
    verificationState: text("verification_state").notNull().default("unverified"),
    provenance: jsonb("provenance").notNull().default({}),
    privacyLevel: text("privacy_level").notNull().default("personal_private"),
    sensitivity: text("sensitivity").notNull().default("personal"),
    status: text("status").notNull().default("active"),
    retentionPolicy: text("retention_policy").notNull().default("user_controlled"),
    retentionDeleteAfter: timestamp("retention_delete_after", { withTimezone: true }),
    legalHold: boolean("legal_hold").notNull().default(false),
    collectedAt: timestamp("collected_at", { withTimezone: true }),
    importedAt: timestamp("imported_at", { withTimezone: true }),
    ...lifecycleColumns,
  },
  (table) => [
    index("knowledge_sources_household_owner_idx").on(table.householdId, table.ownerUserId, table.status),
    index("knowledge_sources_connector_idx").on(table.connectorKey, table.connectorVersion),
  ],
);

export const knowledgeEntitiesTable = pgTable(
  "knowledge_entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: text("entity_type").notNull().references(() => knowledgeEntityTypesTable.entityType, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
    householdId: integer("household_id").notNull().references(() => householdsTable.id, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
    ownerUserId: integer("owner_user_id").notNull().references(() => usersTable.id, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
    subjectUserId: integer("subject_user_id").references(() => usersTable.id, {
      onUpdate: "restrict",
      onDelete: "set null",
    }),
    primarySourceId: uuid("primary_source_id").notNull().references(() => knowledgeSourcesTable.id, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
    canonicalLabel: text("canonical_label").notNull(),
    status: text("status").notNull().default("active"),
    privacyLevel: text("privacy_level").notNull().default("personal_private"),
    visibility: text("visibility").notNull().default("private"),
    sensitivity: text("sensitivity").notNull().default("personal"),
    confidenceScore: numeric("confidence_score", { precision: 5, scale: 4 }).notNull().default("1"),
    verificationState: text("verification_state").notNull().default("unverified"),
    tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
    searchText: text("search_text").notNull().default(""),
    searchMetadata: jsonb("search_metadata").notNull().default({}),
    structuredMetadata: jsonb("structured_metadata").notNull().default({}),
    customFields: jsonb("custom_fields").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationSeconds: bigint("duration_seconds", { mode: "number" }),
    expectedAt: timestamp("expected_at", { withTimezone: true }),
    actualAt: timestamp("actual_at", { withTimezone: true }),
    recurrenceRule: text("recurrence_rule"),
    temporalState: text("temporal_state").notNull().default("current"),
    retentionPolicy: text("retention_policy").notNull().default("user_controlled"),
    retentionDeleteAfter: timestamp("retention_delete_after", { withTimezone: true }),
    legalHold: boolean("legal_hold").notNull().default(false),
    version: integer("version").notNull().default(1),
    createdById: integer("created_by_id").notNull().references(() => usersTable.id, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
    updatedById: integer("updated_by_id").notNull().references(() => usersTable.id, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
    ...lifecycleColumns,
  },
  (table) => [
    index("knowledge_entities_household_owner_status_idx").on(table.householdId, table.ownerUserId, table.status),
    index("knowledge_entities_type_status_idx").on(table.entityType, table.status),
    index("knowledge_entities_timeline_idx").on(table.householdId, table.occurredAt),
    index("knowledge_entities_tags_idx").using("gin", table.tags),
  ],
);

export const knowledgeEntityGrantsTable = pgTable(
  "knowledge_entity_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: integer("household_id").notNull().references(() => householdsTable.id, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
    entityId: uuid("entity_id").notNull().references(() => knowledgeEntitiesTable.id, {
      onUpdate: "restrict",
      onDelete: "cascade",
    }),
    grantorUserId: integer("grantor_user_id").notNull().references(() => usersTable.id, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
    granteeUserId: integer("grantee_user_id").notNull().references(() => usersTable.id, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
    permission: text("permission").notNull().default("read"),
    purpose: text("purpose").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedById: integer("revoked_by_id").references(() => usersTable.id, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
  },
  (table) => [index("knowledge_entity_grants_grantee_idx").on(table.householdId, table.granteeUserId, table.entityId)],
);

export const knowledgeEntitySourcesTable = pgTable(
  "knowledge_entity_sources",
  {
    entityId: uuid("entity_id").notNull().references(() => knowledgeEntitiesTable.id, {
      onUpdate: "restrict",
      onDelete: "cascade",
    }),
    sourceId: uuid("source_id").notNull().references(() => knowledgeSourcesTable.id, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
    sourceRole: text("source_role").notNull(),
    sourceRecordRef: text("source_record_ref"),
    evidenceNote: text("evidence_note"),
    createdById: integer("created_by_id").notNull().references(() => usersTable.id, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("knowledge_entity_sources_pk").on(table.entityId, table.sourceId, table.sourceRole),
    uniqueIndex("knowledge_entity_sources_record_uq")
      .on(table.sourceId, table.sourceRecordRef)
      .where(sql`${table.sourceRecordRef} is not null`),
    index("knowledge_entity_sources_source_idx").on(table.sourceId, table.entityId),
  ],
);

export const knowledgeEntityVersionsTable = pgTable(
  "knowledge_entity_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id").notNull().references(() => knowledgeEntitiesTable.id, {
      onUpdate: "restrict",
      onDelete: "cascade",
    }),
    householdId: integer("household_id").notNull().references(() => householdsTable.id, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
    ownerUserId: integer("owner_user_id").notNull().references(() => usersTable.id, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
    version: integer("version").notNull(),
    changeKind: text("change_kind").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    changedById: integer("changed_by_id").notNull().references(() => usersTable.id, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("knowledge_entity_versions_entity_version_uq").on(table.entityId, table.version),
    index("knowledge_entity_versions_entity_idx").on(table.entityId, table.version),
  ],
);

export const knowledgeRelationshipsTable = pgTable(
  "knowledge_relationships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: integer("household_id").notNull().references(() => householdsTable.id, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
    ownerUserId: integer("owner_user_id").notNull().references(() => usersTable.id, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
    sourceEntityId: uuid("source_entity_id").notNull().references(() => knowledgeEntitiesTable.id, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
    targetEntityId: uuid("target_entity_id").notNull().references(() => knowledgeEntitiesTable.id, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
    relationshipType: text("relationship_type").notNull().references(() => knowledgeRelationshipTypesTable.relationshipType, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
    direction: text("direction").notNull().default("directed"),
    strength: numeric("strength", { precision: 5, scale: 4 }),
    confidenceScore: numeric("confidence_score", { precision: 5, scale: 4 }).notNull().default("1"),
    verificationState: text("verification_state").notNull().default("unverified"),
    provenance: jsonb("provenance").notNull().default({}),
    primarySourceId: uuid("primary_source_id").notNull().references(() => knowledgeSourcesTable.id, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
    sourceRecordRef: text("source_record_ref"),
    privacyInheritance: text("privacy_inheritance").notNull().default("most_restrictive"),
    privacyLevel: text("privacy_level").notNull().default("personal_private"),
    visibility: text("visibility").notNull().default("private"),
    status: text("status").notNull().default("active"),
    tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
    structuredMetadata: jsonb("structured_metadata").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    expectedAt: timestamp("expected_at", { withTimezone: true }),
    actualAt: timestamp("actual_at", { withTimezone: true }),
    recurrenceRule: text("recurrence_rule"),
    temporalState: text("temporal_state").notNull().default("current"),
    retentionPolicy: text("retention_policy").notNull().default("user_controlled"),
    retentionDeleteAfter: timestamp("retention_delete_after", { withTimezone: true }),
    legalHold: boolean("legal_hold").notNull().default(false),
    version: integer("version").notNull().default(1),
    createdById: integer("created_by_id").notNull().references(() => usersTable.id, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
    updatedById: integer("updated_by_id").notNull().references(() => usersTable.id, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
    ...lifecycleColumns,
  },
  (table) => [
    index("knowledge_relationships_source_idx").on(table.householdId, table.sourceEntityId, table.relationshipType, table.status),
    index("knowledge_relationships_target_idx").on(table.householdId, table.targetEntityId, table.relationshipType, table.status),
    index("knowledge_relationships_owner_idx").on(table.ownerUserId, table.status),
    uniqueIndex("knowledge_relationships_source_record_uq")
      .on(table.primarySourceId, table.sourceRecordRef)
      .where(sql`${table.sourceRecordRef} is not null`),
  ],
);

export const knowledgeRelationshipVersionsTable = pgTable(
  "knowledge_relationship_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    relationshipId: uuid("relationship_id").notNull().references(() => knowledgeRelationshipsTable.id, {
      onUpdate: "restrict",
      onDelete: "cascade",
    }),
    householdId: integer("household_id").notNull().references(() => householdsTable.id, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
    ownerUserId: integer("owner_user_id").notNull().references(() => usersTable.id, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
    version: integer("version").notNull(),
    changeKind: text("change_kind").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    changedById: integer("changed_by_id").notNull().references(() => usersTable.id, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("knowledge_relationship_versions_relationship_version_uq").on(table.relationshipId, table.version)],
);

export const knowledgeAuditEventsTable = pgTable(
  "knowledge_audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: integer("household_id").notNull().references(() => householdsTable.id, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
    ownerUserId: integer("owner_user_id").notNull().references(() => usersTable.id, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
    actorUserId: integer("actor_user_id").notNull().references(() => usersTable.id, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
    entityId: uuid("entity_id").notNull().references(() => knowledgeEntitiesTable.id, {
      onUpdate: "restrict",
      onDelete: "cascade",
    }),
    eventType: text("event_type").notNull(),
    summary: text("summary").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("knowledge_audit_events_entity_idx").on(table.entityId, table.createdAt)],
);

export const knowledgeMemoriesTable = pgTable("knowledge_memories", {
  entityId: uuid("entity_id").primaryKey().references(() => knowledgeEntitiesTable.id, {
    onUpdate: "restrict",
    onDelete: "cascade",
  }),
  title: text("title").notNull(),
  summary: text("summary"),
  emotions: text("emotions").array().notNull().default(sql`ARRAY[]::text[]`),
  importance: smallint("importance"),
  timelinePosition: text("timeline_position"),
  aiSummary: text("ai_summary"),
  followUpSuggestions: jsonb("follow_up_suggestions").notNull().default([]),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const knowledgeObservationsTable = pgTable("knowledge_observations", {
  entityId: uuid("entity_id").primaryKey().references(() => knowledgeEntitiesTable.id, {
    onUpdate: "restrict",
    onDelete: "cascade",
  }),
  observationText: text("observation_text").notNull(),
  observationKind: text("observation_kind").notNull().default("user_observation"),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  assertedByUserId: integer("asserted_by_user_id").notNull().references(() => usersTable.id, {
    onUpdate: "restrict",
    onDelete: "restrict",
  }),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const knowledgeInsightsTable = pgTable("knowledge_insights", {
  entityId: uuid("entity_id").primaryKey().references(() => knowledgeEntitiesTable.id, {
    onUpdate: "restrict",
    onDelete: "cascade",
  }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  reasoning: text("reasoning").notNull(),
  status: text("status").notNull().default("candidate"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  expiredAt: timestamp("expired_at", { withTimezone: true }),
  followUpActions: jsonb("follow_up_actions").notNull().default([]),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const knowledgeRecommendationsTable = pgTable("knowledge_recommendations", {
  entityId: uuid("entity_id").primaryKey().references(() => knowledgeEntitiesTable.id, {
    onUpdate: "restrict",
    onDelete: "cascade",
  }),
  recommendation: text("recommendation").notNull(),
  priority: text("priority").notNull().default("normal"),
  urgency: text("urgency").notNull().default("not_urgent"),
  estimatedBenefit: text("estimated_benefit"),
  estimatedEffort: text("estimated_effort"),
  categories: text("categories").array().notNull().default(sql`ARRAY[]::text[]`),
  requiredPermissions: jsonb("required_permissions").notNull().default([]),
  status: text("status").notNull().default("proposed"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const lighthousePassportsTable = pgTable(
  "lighthouse_passports",
  {
    entityId: uuid("entity_id").primaryKey().references(() => knowledgeEntitiesTable.id, {
      onUpdate: "restrict",
      onDelete: "cascade",
    }),
    householdId: integer("household_id").notNull().references(() => householdsTable.id, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
    ownerUserId: integer("owner_user_id").notNull().references(() => usersTable.id, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
    userId: integer("user_id").notNull().references(() => usersTable.id, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
    lighthousePassportId: text("lighthouse_passport_id").notNull(),
    identity: jsonb("identity").notNull().default({}),
    preferences: jsonb("preferences").notNull().default({}),
    strengths: jsonb("strengths").notNull().default([]),
    growthAreas: jsonb("growth_areas").notNull().default([]),
    communicationStyle: jsonb("communication_style").notNull().default({}),
    career: jsonb("career").notNull().default({}),
    education: jsonb("education").notNull().default({}),
    medical: jsonb("medical").notNull().default({}),
    family: jsonb("family").notNull().default({}),
    relationships: jsonb("relationships").notNull().default({}),
    importantMemories: jsonb("important_memories").notNull().default([]),
    goals: jsonb("goals").notNull().default([]),
    interests: jsonb("interests").notNull().default([]),
    privacyPreferences: jsonb("privacy_preferences").notNull().default({}),
    consentSummary: jsonb("consent_summary").notNull().default({}),
    aiProfile: jsonb("ai_profile").notNull().default({}),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("lighthouse_passports_user_uq").on(table.userId),
    uniqueIndex("lighthouse_passports_passport_id_uq").on(table.lighthousePassportId),
  ],
);

export const knowledgeExtensionVersionsTable = pgTable(
  "knowledge_extension_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id").notNull().references(() => knowledgeEntitiesTable.id, {
      onUpdate: "restrict",
      onDelete: "cascade",
    }),
    householdId: integer("household_id").notNull().references(() => householdsTable.id, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
    ownerUserId: integer("owner_user_id").notNull().references(() => usersTable.id, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
    extensionKind: text("extension_kind").notNull(),
    version: integer("version").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    changedById: integer("changed_by_id").notNull().references(() => usersTable.id, {
      onUpdate: "restrict",
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("knowledge_extension_versions_entity_kind_version_uq").on(
      table.entityId,
      table.extensionKind,
      table.version,
    ),
    index("knowledge_extension_versions_entity_idx").on(table.entityId, table.extensionKind, table.version),
  ],
);

export type KnowledgeEntity = typeof knowledgeEntitiesTable.$inferSelect;
export type KnowledgeRelationship = typeof knowledgeRelationshipsTable.$inferSelect;
export type KnowledgeSource = typeof knowledgeSourcesTable.$inferSelect;
