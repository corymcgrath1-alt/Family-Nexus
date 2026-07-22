import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { libraryItemsTable } from "./family-library";
import { dataSourcesTable } from "./lighthouse-core";
import { householdsTable } from "./households";
import { knowledgeEntitiesTable, knowledgeSourcesTable } from "./knowledge-graph";
import { usersTable } from "./users";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const connectorConnectionsTable = pgTable(
  "connector_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectorKey: text("connector_key").notNull(),
    connectorVersion: text("connector_version").notNull(),
    provider: text("provider").notNull(),
    householdId: integer("household_id").notNull().references(() => householdsTable.id, { onDelete: "restrict" }),
    ownerUserId: integer("owner_user_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
    ownerPassportId: text("owner_passport_id").notNull().references(() => usersTable.lighthousePassportId, { onDelete: "restrict" }),
    providerAccountId: text("provider_account_id"),
    providerAccountLabel: text("provider_account_label"),
    state: text("state").notNull().default("pending_authorization"),
    grantedScopes: text("granted_scopes").array().notNull().default(sql`ARRAY[]::text[]`),
    selectedCapabilities: text("selected_capabilities").array().notNull().default(sql`ARRAY[]::text[]`),
    scheduleEnabled: boolean("schedule_enabled").notNull().default(true),
    activeConsentId: uuid("active_consent_id"),
    knowledgeSourceId: uuid("knowledge_source_id").references(() => knowledgeSourcesTable.id, { onDelete: "restrict" }),
    dataSourceId: integer("data_source_id").references(() => dataSourcesTable.id, { onDelete: "restrict" }),
    lastSuccessfulSyncAt: timestamp("last_successful_sync_at", { withTimezone: true }),
    lastAttemptedSyncAt: timestamp("last_attempted_sync_at", { withTimezone: true }),
    reconnectRequiredAt: timestamp("reconnect_required_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    syncLeaseId: uuid("sync_lease_id"),
    syncLeaseExpiresAt: timestamp("sync_lease_expires_at", { withTimezone: true }),
    stateVersion: integer("state_version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("connector_connections_active_account_uq")
      .on(table.ownerUserId, table.connectorKey, table.providerAccountId)
      .where(sql`${table.providerAccountId} is not null and ${table.state} not in ('revoked', 'archived')`),
    index("connector_connections_owner_state_idx").on(table.ownerUserId, table.state, table.updatedAt),
    index("connector_connections_sync_due_idx").on(table.state, table.scheduleEnabled, table.lastSuccessfulSyncAt),
    index("connector_connections_lease_idx").on(table.syncLeaseExpiresAt),
  ],
);

export const connectorConsentsTable = pgTable(
  "connector_consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id").notNull().references(() => connectorConnectionsTable.id, { onDelete: "cascade" }),
    householdId: integer("household_id").notNull().references(() => householdsTable.id, { onDelete: "restrict" }),
    ownerUserId: integer("owner_user_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
    ownerPassportId: text("owner_passport_id").notNull().references(() => usersTable.lighthousePassportId, { onDelete: "restrict" }),
    connectorKey: text("connector_key").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    requestedScopes: text("requested_scopes").array().notNull(),
    grantedScopes: text("granted_scopes").array().notNull(),
    selectedCapabilities: text("selected_capabilities").array().notNull(),
    selectedResourceIds: text("selected_resource_ids").array().notNull(),
    purpose: text("purpose").notNull(),
    consentTextVersion: text("consent_text_version").notNull(),
    materialVersion: text("material_version").notNull(),
    status: text("status").notNull().default("active"),
    consentedAt: timestamp("consented_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("connector_consents_active_connection_uq").on(table.connectionId).where(sql`${table.status} = 'active'`),
    index("connector_consents_owner_idx").on(table.ownerUserId, table.connectionId, table.consentedAt),
  ],
);

export const connectorResourceSelectionsTable = pgTable(
  "connector_resource_selections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id").notNull().references(() => connectorConnectionsTable.id, { onDelete: "cascade" }),
    householdId: integer("household_id").notNull().references(() => householdsTable.id, { onDelete: "restrict" }),
    ownerUserId: integer("owner_user_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
    providerResourceId: text("provider_resource_id").notNull(),
    resourceType: text("resource_type").notNull(),
    displayName: text("display_name").notNull(),
    displayMetadata: jsonb("display_metadata").notNull().default({}),
    selected: boolean("selected").notNull().default(false),
    selectedAt: timestamp("selected_at", { withTimezone: true }),
    lastObservedAt: timestamp("last_observed_at", { withTimezone: true }).notNull().defaultNow(),
    accessStatus: text("access_status").notNull().default("available"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("connector_resource_selections_connection_resource_uq").on(table.connectionId, table.resourceType, table.providerResourceId),
    index("connector_resource_selections_selected_idx").on(table.connectionId, table.selected, table.accessStatus),
  ],
);

export const connectorSyncCheckpointsTable = pgTable(
  "connector_sync_checkpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id").notNull().references(() => connectorConnectionsTable.id, { onDelete: "cascade" }),
    resourceSelectionId: uuid("resource_selection_id").notNull().references(() => connectorResourceSelectionsTable.id, { onDelete: "cascade" }),
    householdId: integer("household_id").notNull().references(() => householdsTable.id, { onDelete: "restrict" }),
    ownerUserId: integer("owner_user_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
    cursor: text("cursor"),
    nextPageToken: text("next_page_token"),
    highWaterMark: timestamp("high_water_mark", { withTimezone: true }),
    backfillState: text("backfill_state").notNull().default("pending"),
    lastSuccessfulPage: integer("last_successful_page").notNull().default(0),
    lastCompletedSyncAt: timestamp("last_completed_sync_at", { withTimezone: true }),
    cursorInvalidatedAt: timestamp("cursor_invalidated_at", { withTimezone: true }),
    connectorVersion: text("connector_version").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("connector_sync_checkpoints_connection_resource_uq").on(table.connectionId, table.resourceSelectionId),
    index("connector_sync_checkpoints_connection_idx").on(table.connectionId, table.backfillState),
  ],
);

export const connectorSyncRunsTable = pgTable(
  "connector_sync_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id").notNull().references(() => connectorConnectionsTable.id, { onDelete: "cascade" }),
    householdId: integer("household_id").notNull().references(() => householdsTable.id, { onDelete: "restrict" }),
    ownerUserId: integer("owner_user_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
    triggerType: text("trigger_type").notNull(),
    status: text("status").notNull().default("queued"),
    resourceScope: jsonb("resource_scope").notNull().default({}),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    fetchedCount: integer("fetched_count").notNull().default(0),
    createdCount: integer("created_count").notNull().default(0),
    updatedCount: integer("updated_count").notNull().default(0),
    unchangedCount: integer("unchanged_count").notNull().default(0),
    tombstonedCount: integer("tombstoned_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    retryCount: integer("retry_count").notNull().default(0),
    cursorRecoveryCount: integer("cursor_recovery_count").notNull().default(0),
    errorCategory: text("error_category"),
    errorSummary: text("error_summary"),
    correlationId: uuid("correlation_id").notNull().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("connector_sync_runs_connection_created_idx").on(table.connectionId, table.createdAt),
    index("connector_sync_runs_stale_idx").on(table.startedAt),
  ],
);

export const connectorSourceObjectsTable = pgTable(
  "connector_source_objects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id").notNull().references(() => connectorConnectionsTable.id, { onDelete: "cascade" }),
    resourceSelectionId: uuid("resource_selection_id").notNull().references(() => connectorResourceSelectionsTable.id, { onDelete: "restrict" }),
    householdId: integer("household_id").notNull().references(() => householdsTable.id, { onDelete: "restrict" }),
    ownerUserId: integer("owner_user_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    externalObjectType: text("external_object_type").notNull(),
    externalObjectId: text("external_object_id").notNull(),
    externalVersion: text("external_version"),
    sourceCreatedAt: timestamp("source_created_at", { withTimezone: true }),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    normalizedChecksum: text("normalized_checksum").notNull(),
    normalizedPayload: jsonb("normalized_payload").notNull(),
    sourceDeleted: boolean("source_deleted").notNull().default(false),
    rawPayloadRetentionPolicy: text("raw_payload_retention_policy").notNull().default("not_stored"),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
    parserVersion: text("parser_version").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("connector_source_objects_external_uq").on(table.connectionId, table.resourceSelectionId, table.externalObjectType, table.externalObjectId),
    index("connector_source_objects_lookup_idx").on(table.connectionId, table.resourceSelectionId, table.externalObjectId),
    index("connector_source_objects_owner_state_idx").on(table.ownerUserId, table.sourceDeleted, table.updatedAt),
  ],
);

export const connectorSourceMappingsTable = pgTable(
  "connector_source_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceObjectId: uuid("source_object_id").notNull().unique().references(() => connectorSourceObjectsTable.id, { onDelete: "cascade" }),
    householdId: integer("household_id").notNull().references(() => householdsTable.id, { onDelete: "restrict" }),
    ownerUserId: integer("owner_user_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
    targetEntityId: uuid("target_entity_id").references(() => knowledgeEntitiesTable.id, { onDelete: "restrict" }),
    targetLibraryItemId: integer("target_library_item_id").references(() => libraryItemsTable.id, { onDelete: "restrict" }),
    mappingVersion: text("mapping_version").notNull(),
    transformationVersion: text("transformation_version").notNull(),
    state: text("state").notNull().default("active"),
    userOverrides: jsonb("user_overrides").notNull().default({}),
    lastProviderValues: jsonb("last_provider_values").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastReconciledAt: timestamp("last_reconciled_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("connector_source_mappings_entity_idx").on(table.targetEntityId),
    index("connector_source_mappings_library_idx").on(table.targetLibraryItemId),
  ],
);

export const connectorOauthStatesTable = pgTable(
  "connector_oauth_states",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stateHash: text("state_hash").notNull().unique(),
    householdId: integer("household_id").notNull().references(() => householdsTable.id, { onDelete: "restrict" }),
    ownerUserId: integer("owner_user_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
    ownerPassportId: text("owner_passport_id").notNull().references(() => usersTable.lighthousePassportId, { onDelete: "restrict" }),
    connectorKey: text("connector_key").notNull(),
    redirectPath: text("redirect_path").notNull(),
    encryptedPkceVerifier: bytea("encrypted_pkce_verifier").notNull(),
    encryptionNonce: bytea("encryption_nonce").notNull(),
    authenticationTag: bytea("authentication_tag").notNull(),
    encryptionKeyVersion: text("encryption_key_version").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("connector_oauth_states_expiry_idx").on(table.expiresAt)],
);

export const connectorCredentialsTable = pgTable("connector_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  connectionId: uuid("connection_id").notNull().unique().references(() => connectorConnectionsTable.id, { onDelete: "cascade" }),
  credentialType: text("credential_type").notNull(),
  encryptedPayload: bytea("encrypted_payload").notNull(),
  encryptionNonce: bytea("encryption_nonce").notNull(),
  authenticationTag: bytea("authentication_tag").notNull(),
  encryptionKeyVersion: text("encryption_key_version").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  rotatedAt: timestamp("rotated_at", { withTimezone: true }),
  providerMetadata: jsonb("provider_metadata").notNull().default({}),
  ...timestamps,
});

export const connectorAuditEventsTable = pgTable(
  "connector_audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: integer("household_id").notNull().references(() => householdsTable.id, { onDelete: "restrict" }),
    ownerUserId: integer("owner_user_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
    actorUserId: integer("actor_user_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
    connectionId: uuid("connection_id").references(() => connectorConnectionsTable.id, { onDelete: "restrict" }),
    connectorKey: text("connector_key").notNull(),
    eventType: text("event_type").notNull(),
    summary: text("summary").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("connector_audit_events_connection_idx").on(table.connectionId, table.createdAt),
    index("connector_audit_events_owner_idx").on(table.ownerUserId, table.createdAt),
  ],
);

export type ConnectorConnection = typeof connectorConnectionsTable.$inferSelect;
export type ConnectorConsent = typeof connectorConsentsTable.$inferSelect;
export type ConnectorResourceSelection = typeof connectorResourceSelectionsTable.$inferSelect;
export type ConnectorSyncCheckpoint = typeof connectorSyncCheckpointsTable.$inferSelect;
export type ConnectorSyncRun = typeof connectorSyncRunsTable.$inferSelect;
export type ConnectorSourceObject = typeof connectorSourceObjectsTable.$inferSelect;
export type ConnectorSourceMapping = typeof connectorSourceMappingsTable.$inferSelect;
