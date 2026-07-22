import {
  auditEventsTable,
  connectorConnectionsTable,
  connectorConsentsTable,
  connectorResourceSelectionsTable,
  connectorSourceMappingsTable,
  connectorSourceObjectsTable,
  connectorSyncCheckpointsTable,
  connectorSyncRunsTable,
  dataSourcesTable,
  db,
  knowledgeEntitiesTable,
  knowledgeEntitySourcesTable,
  libraryItemsTable,
  withDatabaseActor,
  type ConnectorConnection,
  type ConnectorResourceSelection,
} from "@workspace/db";
import {
  ConnectorError,
  type ConnectorProviderResource,
  type ConnectorTokenSet,
} from "@workspace/knowledge-model";
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";

import { GOOGLE_CALENDAR_CONNECTOR_KEY, googleCalendarDefinition } from "./connector-definition";
import {
  ConnectorAccessError,
  assertAdultActor,
  backfillFutureDays,
  backfillPastDays,
  getFreshCredential,
  isConnectorConsentCurrent,
  lockOwnedConnection,
  requireOwnedConnection,
  transitionConnection,
  writeConnectorAudit,
  type ConnectorActor,
} from "./connector-service";
import {
  checksumNormalizedEvent,
  normalizedCalendarEventSchema,
  type NormalizedCalendarEvent,
} from "./google-calendar-provider";
import { getGoogleCalendarProvider } from "./provider-factory";
import { logger } from "../logger";

type SyncTrigger = "initial" | "scheduled" | "manual" | "webhook" | "recovery";
type SyncCounts = {
  fetchedCount: number;
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  tombstonedCount: number;
  skippedCount: number;
  failedCount: number;
  retryCount: number;
  cursorRecoveryCount: number;
};
type SyncPageContext = {
  sources: Map<string, typeof connectorSourceObjectsTable.$inferSelect>;
  mappings: Map<string, typeof connectorSourceMappingsTable.$inferSelect>;
  items: Map<number, typeof libraryItemsTable.$inferSelect>;
  entities: Map<string, typeof knowledgeEntitiesTable.$inferSelect>;
};
type SyncOptions = {
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  preclaimedLeaseId?: string;
  beforePagePersist?: () => Promise<void>;
  afterPagePersist?: () => Promise<void>;
};

const GOOGLE_EVENTS_QUERY_VERSION = "google-calendar-events-query.v1";
const GOOGLE_EVENTS_PAGE_SIZE = 250;

const emptyCounts = (): SyncCounts => ({
  fetchedCount: 0,
  createdCount: 0,
  updatedCount: 0,
  unchangedCount: 0,
  tombstonedCount: 0,
  skippedCount: 0,
  failedCount: 0,
  retryCount: 0,
  cursorRecoveryCount: 0,
});

export async function runConnectorSync(
  actor: ConnectorActor,
  connectionId: string,
  requestedTrigger: "manual" | "scheduled" = "manual",
  options: SyncOptions = {},
) {
  assertAdultActor(actor);
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const random = options.random ?? Math.random;
  const leaseId = options.preclaimedLeaseId ?? randomUUID();
  const leaseExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

  const acquired = await (async () => {
    try {
      return await withDatabaseActor(actor, async () => {
    let connection = await requireOwnedConnection(connectionId);
    if (!["active", "degraded", "syncing"].includes(connection.state)) {
      throw new ConnectorAccessError(409, connection.state === "paused" ? "Synchronization is paused." : "This connection cannot synchronize.");
    }
    if (!connection.activeConsentId) throw new ConnectorAccessError(409, "Active Lighthouse consent is required.");
    const [consent] = await db.select().from(connectorConsentsTable).where(and(
      eq(connectorConsentsTable.id, connection.activeConsentId),
      eq(connectorConsentsTable.status, "active"),
    ));
    if (!consent) throw new ConnectorAccessError(409, "Active Lighthouse consent is required.");
    const selections = await db.select().from(connectorResourceSelectionsTable).where(and(
      eq(connectorResourceSelectionsTable.connectionId, connection.id),
      eq(connectorResourceSelectionsTable.selected, true),
      eq(connectorResourceSelectionsTable.accessStatus, "available"),
    ));
    if (!selections.length) throw new ConnectorAccessError(409, "No selected calendars are available.");
    const consentResources = new Set(consent.selectedResourceIds);
    if (selections.some((selection) => !consentResources.has(selection.providerResourceId)) || consentResources.size !== selections.length) {
      throw new ConnectorAccessError(409, "Calendar selection changed. Renew Lighthouse consent before synchronizing.");
    }
    if (!isConnectorConsentCurrent(connection, consent, selections.map((selection) => selection.providerResourceId))) {
      throw new ConnectorAccessError(409, "The import policy changed. Renew Lighthouse consent before synchronizing.");
    }

    const leaseCondition = options.preclaimedLeaseId
      ? eq(connectorConnectionsTable.syncLeaseId, options.preclaimedLeaseId)
      : or(isNull(connectorConnectionsTable.syncLeaseId), lt(connectorConnectionsTable.syncLeaseExpiresAt, new Date()));
    const [locked] = await db.update(connectorConnectionsTable).set({
      syncLeaseId: leaseId,
      syncLeaseExpiresAt: leaseExpiresAt,
      lastAttemptedSyncAt: new Date(),
      updatedAt: new Date(),
    }).where(and(
      eq(connectorConnectionsTable.id, connection.id),
      leaseCondition,
    )).returning();
    if (!locked) throw new ConnectorAccessError(409, "A synchronization is already running.");
    connection = locked;

    if (connection.state === "syncing") {
      await db.update(connectorSyncRunsTable).set({
        status: "failed",
        finishedAt: new Date(),
        errorCategory: "stale_run_recovered",
        errorSummary: "A stale synchronization lease was recovered.",
      }).where(and(eq(connectorSyncRunsTable.connectionId, connection.id), eq(connectorSyncRunsTable.status, "running")));
    } else {
      connection = await transitionConnection(connection, "syncing", {});
    }

    const checkpoints = await db.select().from(connectorSyncCheckpointsTable).where(eq(connectorSyncCheckpointsTable.connectionId, connection.id));
    const trigger: SyncTrigger = checkpoints.length === selections.length && checkpoints.every((row) => row.backfillState === "complete")
      ? requestedTrigger
      : "initial";
    const [run] = await db.insert(connectorSyncRunsTable).values({
      connectionId: connection.id,
      householdId: actor.householdId,
      ownerUserId: actor.userId,
      triggerType: trigger,
      status: "running",
      resourceScope: { selectedResourceCount: selections.length },
      startedAt: new Date(),
    }).returning();
    await writeConnectorAudit(actor, connection.id, "sync_started", "Google Calendar synchronization started", {
      triggerType: trigger,
      selectedResourceCount: selections.length,
    });
    const tokens = await getFreshCredential(connection.id);
        return { connection, selections, runId: run.id, trigger, tokens };
      });
    } catch (error) {
      if (error instanceof ConnectorError && error.disposition === "reconnect_required") {
        await recordCredentialFailure(actor, connectionId, requestedTrigger, error);
      }
      throw error;
    }
  })();

  const counts = emptyCounts();
  try {
    for (const selection of acquired.selections) {
      await syncResource(actor, acquired.connection, selection, acquired.runId, leaseId, acquired.tokens, counts, {
        sleep,
        random,
        beforePagePersist: options.beforePagePersist,
        afterPagePersist: options.afterPagePersist,
      });
    }
    return await finishSync(actor, acquired.connection.id, acquired.runId, leaseId, counts, null);
  } catch (error) {
    await finishSync(actor, acquired.connection.id, acquired.runId, leaseId, counts, error);
    throw error;
  }
}

async function syncResource(
  actor: ConnectorActor,
  connection: ConnectorConnection,
  selection: ConnectorResourceSelection,
  runId: string,
  leaseId: string,
  tokens: ConnectorTokenSet,
  counts: SyncCounts,
  timing: {
    sleep: (milliseconds: number) => Promise<void>;
    random: () => number;
    beforePagePersist?: () => Promise<void>;
    afterPagePersist?: () => Promise<void>;
  },
): Promise<void> {
  const provider = getGoogleCalendarProvider();
  const resource: ConnectorProviderResource = {
    stableId: selection.providerResourceId,
    resourceType: "calendar",
    displayName: selection.displayName,
    metadata: selection.displayMetadata as Record<string, string | boolean | null>,
  };
  let checkpoint = await withDatabaseActor(actor, async () => {
    await lockOwnedConnection(connection.id);
    await assertSyncStillAuthorized(connection.id, selection.id, leaseId);
    const [existing] = await db.select().from(connectorSyncCheckpointsTable).where(and(
      eq(connectorSyncCheckpointsTable.connectionId, connection.id),
      eq(connectorSyncCheckpointsTable.resourceSelectionId, selection.id),
    ));
    if (existing) return existing;
    const [created] = await db.insert(connectorSyncCheckpointsTable).values({
      connectionId: connection.id,
      resourceSelectionId: selection.id,
      householdId: actor.householdId,
      ownerUserId: actor.userId,
      connectorVersion: connection.connectorVersion,
    }).returning();
    return created;
  });

  let cursor = checkpoint.backfillState === "complete" ? checkpoint.cursor : null;
  let pageToken = checkpoint.nextPageToken;
  let pageNumber = checkpoint.lastSuccessfulPage;
  let recoveryAttempted = false;
  let { backfillStart, backfillEnd } = newBackfillWindow();

  if (pageToken) {
    const persistedStart = checkpoint.backfillTimeMin?.toISOString() ?? null;
    const persistedEnd = checkpoint.backfillTimeMax?.toISOString() ?? null;
    const queryStateValid = checkpoint.backfillQueryVersion === GOOGLE_EVENTS_QUERY_VERSION
      && checkpoint.backfillQueryFingerprint === sourceQueryFingerprint(resource.stableId, cursor, persistedStart, persistedEnd)
      && (cursor ? persistedStart === null && persistedEnd === null : persistedStart !== null && persistedEnd !== null);
    if (queryStateValid) {
      if (persistedStart && persistedEnd) {
        backfillStart = persistedStart;
        backfillEnd = persistedEnd;
      }
    } else {
      recoveryAttempted = true;
      counts.cursorRecoveryCount += 1;
      cursor = null;
      pageToken = null;
      pageNumber = 0;
      ({ backfillStart, backfillEnd } = newBackfillWindow());
      checkpoint = await withDatabaseActor(actor, async () => {
        await lockOwnedConnection(connection.id);
        await assertSyncStillAuthorized(connection.id, selection.id, leaseId);
        const [updated] = await db.update(connectorSyncCheckpointsTable).set({
          cursor: null,
          nextPageToken: null,
          backfillTimeMin: null,
          backfillTimeMax: null,
          backfillQueryVersion: null,
          backfillQueryFingerprint: null,
          backfillState: "recovering",
          cursorInvalidatedAt: new Date(),
          lastSuccessfulPage: 0,
          updatedAt: new Date(),
        }).where(eq(connectorSyncCheckpointsTable.id, checkpoint.id)).returning();
        return updated;
      });
    }
  }

  for (let guard = 0; guard < 10_000; guard += 1) {
    let page;
    try {
      page = await withRetry(
        () => provider.listSourceObjects({ tokens, resource, pageToken, cursor, backfillStart, backfillEnd }),
        counts,
        timing,
      );
    } catch (error) {
      if (error instanceof ConnectorError && error.category === "cursor_invalidated" && cursor && !recoveryAttempted) {
        recoveryAttempted = true;
        counts.cursorRecoveryCount += 1;
        logger.warn({ signal: "connector_cursor_recovery", connectorKey: GOOGLE_CALENDAR_CONNECTOR_KEY }, "Connector cursor recovery started");
        cursor = null;
        pageToken = null;
        pageNumber = 0;
        checkpoint = await withDatabaseActor(actor, async () => {
          await lockOwnedConnection(connection.id);
          await assertSyncStillAuthorized(connection.id, selection.id, leaseId);
          const [updated] = await db.update(connectorSyncCheckpointsTable).set({
            cursor: null,
            nextPageToken: null,
            backfillTimeMin: null,
            backfillTimeMax: null,
            backfillQueryVersion: null,
            backfillQueryFingerprint: null,
            backfillState: "recovering",
            cursorInvalidatedAt: new Date(),
            lastSuccessfulPage: 0,
            updatedAt: new Date(),
          }).where(eq(connectorSyncCheckpointsTable.id, checkpoint.id)).returning();
          await db.update(connectorSyncRunsTable).set({ cursorRecoveryCount: counts.cursorRecoveryCount }).where(eq(connectorSyncRunsTable.id, runId));
          return updated;
        });
        ({ backfillStart, backfillEnd } = newBackfillWindow());
        continue;
      }
      throw error;
    }

    pageNumber += 1;
    const normalized = page.items.map((item) => provider.normalizeSourceObject(item, resource));
    await timing.beforePagePersist?.();
    const pageCounts = await withDatabaseActor(actor, async () => {
      await lockOwnedConnection(connection.id);
      await assertSyncStillAuthorized(connection.id, selection.id, leaseId);
      const delta = emptyCounts();
      delta.fetchedCount = normalized.length;
      const context = await loadSyncPageContext(connection.id, selection.id, normalized);
      for (const event of normalized) {
        const outcome = await reconcileEvent(actor, connection, selection, event, context);
        delta[`${outcome}Count` as "createdCount" | "updatedCount" | "unchangedCount" | "tombstonedCount" | "skippedCount"] += 1;
      }
      const finalPage = !page.nextPageToken;
      if (finalPage && !page.nextCursor) {
        throw new ConnectorError("malformed_provider_response", "permanent_resource", "The provider did not return a durable sync cursor.");
      }
      const persistedQueryFingerprint = page.nextPageToken
        ? sourceQueryFingerprint(resource.stableId, cursor, cursor ? null : backfillStart, cursor ? null : backfillEnd)
        : null;
      [checkpoint] = await db.update(connectorSyncCheckpointsTable).set({
        cursor: finalPage ? page.nextCursor : checkpoint.cursor,
        nextPageToken: page.nextPageToken,
        backfillTimeMin: page.nextPageToken && !cursor ? new Date(backfillStart) : null,
        backfillTimeMax: page.nextPageToken && !cursor ? new Date(backfillEnd) : null,
        backfillQueryVersion: page.nextPageToken ? GOOGLE_EVENTS_QUERY_VERSION : null,
        backfillQueryFingerprint: persistedQueryFingerprint,
        backfillState: finalPage ? "complete" : cursor ? "complete" : (recoveryAttempted ? "recovering" : "in_progress"),
        lastSuccessfulPage: pageNumber,
        lastCompletedSyncAt: finalPage ? new Date() : checkpoint.lastCompletedSyncAt,
        cursorInvalidatedAt: finalPage ? null : checkpoint.cursorInvalidatedAt,
        highWaterMark: new Date(),
        updatedAt: new Date(),
      }).where(eq(connectorSyncCheckpointsTable.id, checkpoint.id)).returning();
      await incrementRunCounts(runId, delta);
      return delta;
    });
    addCounts(counts, pageCounts);
    await timing.afterPagePersist?.();
    pageToken = page.nextPageToken;
    if (!pageToken) return;
  }
  throw new ConnectorError("internal_persistence_failure", "internal_defect", "Synchronization exceeded the safe page limit.");
}

async function reconcileEvent(
  actor: ConnectorActor,
  connection: ConnectorConnection,
  selection: ConnectorResourceSelection,
  rawEvent: NormalizedCalendarEvent,
  context: SyncPageContext,
): Promise<"created" | "updated" | "unchanged" | "tombstoned" | "skipped"> {
  const event = normalizedCalendarEventSchema.parse(rawEvent);
  const checksum = checksumNormalizedEvent(event);
  const existing = context.sources.get(event.externalEventId);
  if (existing?.normalizedChecksum === checksum) return "unchanged";

  const now = new Date();
  let source = existing;
  if (!source) {
    [source] = await db.insert(connectorSourceObjectsTable).values({
      connectionId: connection.id,
      resourceSelectionId: selection.id,
      householdId: actor.householdId,
      ownerUserId: actor.userId,
      provider: "google-calendar",
      externalObjectType: "calendar_event",
      externalObjectId: event.externalEventId,
      externalVersion: event.externalVersion,
      sourceCreatedAt: toDate(event.providerCreatedAt),
      sourceUpdatedAt: toDate(event.providerUpdatedAt),
      normalizedChecksum: checksum,
      normalizedPayload: event,
      sourceDeleted: event.sourceDeleted,
      rawPayloadRetentionPolicy: "not_stored",
      parserVersion: "google-calendar-event.v1",
    }).returning();
  } else {
    const sourceId = source.id;
    [source] = await db.update(connectorSourceObjectsTable).set({
      externalVersion: event.externalVersion,
      sourceUpdatedAt: toDate(event.providerUpdatedAt),
      normalizedChecksum: checksum,
      normalizedPayload: event,
      sourceDeleted: event.sourceDeleted,
      importedAt: now,
      updatedAt: now,
    }).where(eq(connectorSourceObjectsTable.id, sourceId)).returning();
  }
  context.sources.set(event.externalEventId, source);

  const mapping = context.mappings.get(source.id);
  if (!mapping) {
    if (event.sourceDeleted) return "skipped";
    await createImportedEvent(actor, connection, selection, source.id, event);
    return "created";
  }
  return updateImportedEvent(actor, connection, selection, mapping, event, context);
}

async function loadSyncPageContext(
  connectionId: string,
  selectionId: string,
  events: NormalizedCalendarEvent[],
): Promise<SyncPageContext> {
  const externalIds = [...new Set(events.map((event) => event.externalEventId))];
  const sources = externalIds.length
    ? await db.select().from(connectorSourceObjectsTable).where(and(
      eq(connectorSourceObjectsTable.connectionId, connectionId),
      eq(connectorSourceObjectsTable.resourceSelectionId, selectionId),
      eq(connectorSourceObjectsTable.externalObjectType, "calendar_event"),
      inArray(connectorSourceObjectsTable.externalObjectId, externalIds),
    ))
    : [];
  const mappings = sources.length
    ? await db.select().from(connectorSourceMappingsTable).where(inArray(connectorSourceMappingsTable.sourceObjectId, sources.map((source) => source.id)))
    : [];
  const itemIds = mappings.flatMap((mapping) => mapping.targetLibraryItemId === null ? [] : [mapping.targetLibraryItemId]);
  const entityIds = mappings.flatMap((mapping) => mapping.targetEntityId === null ? [] : [mapping.targetEntityId]);
  const items = itemIds.length ? await db.select().from(libraryItemsTable).where(inArray(libraryItemsTable.id, itemIds)) : [];
  const entities = entityIds.length ? await db.select().from(knowledgeEntitiesTable).where(inArray(knowledgeEntitiesTable.id, entityIds)) : [];
  return {
    sources: new Map(sources.map((source) => [source.externalObjectId, source])),
    mappings: new Map(mappings.map((mapping) => [mapping.sourceObjectId, mapping])),
    items: new Map(items.map((item) => [item.id, item])),
    entities: new Map(entities.map((entity) => [entity.id, entity])),
  };
}

async function createImportedEvent(
  actor: ConnectorActor,
  connection: ConnectorConnection,
  selection: ConnectorResourceSelection,
  sourceObjectId: string,
  event: NormalizedCalendarEvent,
): Promise<void> {
  if (!connection.knowledgeSourceId) throw new ConnectorError("internal_persistence_failure", "internal_defect", "Connection source is missing.");
  const startedAt = eventDate(event.start);
  const endedAt = eventDate(event.end);
  const [entity] = await db.insert(knowledgeEntitiesTable).values({
    entityType: "calendar_event",
    householdId: actor.householdId,
    ownerUserId: actor.userId,
    subjectUserId: actor.userId,
    primarySourceId: connection.knowledgeSourceId,
    canonicalLabel: event.title,
    status: "active",
    privacyLevel: "personal_private",
    visibility: "private",
    sensitivity: "sensitive",
    confidenceScore: "1",
    verificationState: "source_verified",
    searchText: [event.description, event.location].filter(Boolean).join(" "),
    searchMetadata: { source: "google_calendar", allDay: event.allDay },
    structuredMetadata: event,
    customFields: {},
    occurredAt: startedAt,
    startedAt,
    endedAt,
    recurrenceRule: event.recurrence[0] ?? null,
    temporalState: temporalState(startedAt),
    retentionPolicy: "user_controlled",
    createdById: actor.userId,
    updatedById: actor.userId,
  }).returning();
  await db.insert(knowledgeEntitySourcesTable).values({
    entityId: entity.id,
    sourceId: connection.knowledgeSourceId,
    sourceRole: "primary",
    sourceRecordRef: `${selection.providerResourceId}:${event.externalEventId}`,
    createdById: actor.userId,
  });

  const providerValues = libraryProviderValues(event, selection.displayName);
  const [item] = await db.insert(libraryItemsTable).values({
    householdId: actor.householdId,
    ownerUserId: actor.userId,
    subjectUserId: actor.userId,
    ownerKind: "person",
    visibility: "private",
    category: "calendar-event",
    title: providerValues.title,
    body: providerValues.body,
    sourceType: "connector",
    sourceLabel: providerValues.sourceLabel,
    provenance: {
      connectorKey: GOOGLE_CALENDAR_CONNECTOR_KEY,
      connectorVersion: connection.connectorVersion,
      mappingVersion: "calendar-event.v1",
      importedAt: new Date().toISOString(),
    },
    effectiveDate: providerValues.effectiveDate,
    sensitivity: "sensitive",
    retentionPolicy: "keep-until-archived",
    allowedPurposes: ["remember", "search", "share"],
    status: "active",
    createdById: actor.userId,
    updatedById: actor.userId,
  }).returning();
  await db.insert(auditEventsTable).values({
    householdId: actor.householdId,
    actorUserId: actor.userId,
    targetType: "library_item",
    targetId: item.id,
    eventType: "imported",
    summary: "Calendar event imported",
    metadata: { connectorKey: GOOGLE_CALENDAR_CONNECTOR_KEY, category: "calendar-event", visibility: "private" },
  });
  await db.insert(connectorSourceMappingsTable).values({
    sourceObjectId,
    householdId: actor.householdId,
    ownerUserId: actor.userId,
    targetEntityId: entity.id,
    targetLibraryItemId: item.id,
    mappingVersion: "calendar-event.v1",
    transformationVersion: "google-calendar-normalizer.v1",
    state: "active",
    userOverrides: {},
    lastProviderValues: providerValues,
  });
}

async function updateImportedEvent(
  actor: ConnectorActor,
  _connection: ConnectorConnection,
  selection: ConnectorResourceSelection,
  mapping: typeof connectorSourceMappingsTable.$inferSelect,
  event: NormalizedCalendarEvent,
  context: SyncPageContext,
): Promise<"updated" | "tombstoned"> {
  const item = mapping.targetLibraryItemId ? context.items.get(mapping.targetLibraryItemId) : undefined;
  const entity = mapping.targetEntityId ? context.entities.get(mapping.targetEntityId) : undefined;
  const previous = mapping.lastProviderValues as Record<string, unknown>;
  const overrides = { ...(mapping.userOverrides as Record<string, boolean>) };
  if (item) {
    for (const key of ["title", "body", "sourceLabel", "effectiveDate"] as const) {
      if (item[key] !== (previous[key] ?? null)) overrides[key] = true;
    }
  }

  if (event.sourceDeleted) {
    if (Object.keys(overrides).length || item?.retentionPolicy === "legal-hold") {
      await db.update(connectorSourceMappingsTable).set({ state: "detached", userOverrides: overrides, lastReconciledAt: new Date() }).where(eq(connectorSourceMappingsTable.id, mapping.id));
      return "tombstoned";
    }
    const now = new Date();
    if (item && item.status !== "deleted") await db.update(libraryItemsTable).set({
      status: "archived",
      archivedAt: now,
      updatedAt: now,
      updatedById: actor.userId,
      version: item.version + 1,
    }).where(eq(libraryItemsTable.id, item.id));
    if (entity && entity.status !== "deleted") await db.update(knowledgeEntitiesTable).set({
      status: "archived",
      archivedAt: now,
      updatedAt: now,
      updatedById: actor.userId,
      version: entity.version + 1,
    }).where(eq(knowledgeEntitiesTable.id, entity.id));
    await db.update(connectorSourceMappingsTable).set({ state: "deleted", lastReconciledAt: now }).where(eq(connectorSourceMappingsTable.id, mapping.id));
    return "tombstoned";
  }

  const providerValues = libraryProviderValues(event, selection.displayName);
  if (item && item.status !== "deleted") {
    await db.update(libraryItemsTable).set({
      title: overrides.title ? item.title : providerValues.title,
      body: overrides.body ? item.body : providerValues.body,
      sourceLabel: overrides.sourceLabel ? item.sourceLabel : providerValues.sourceLabel,
      effectiveDate: overrides.effectiveDate ? item.effectiveDate : providerValues.effectiveDate,
      status: mapping.state === "deleted" ? "active" : item.status,
      archivedAt: mapping.state === "deleted" ? null : item.archivedAt,
      updatedAt: new Date(),
      updatedById: actor.userId,
      version: item.version + 1,
    }).where(eq(libraryItemsTable.id, item.id));
  }
  if (entity && entity.status !== "deleted") {
    const startedAt = eventDate(event.start);
    await db.update(knowledgeEntitiesTable).set({
      canonicalLabel: event.title,
      status: "active",
      archivedAt: null,
      searchText: [event.description, event.location].filter(Boolean).join(" "),
      searchMetadata: { source: "google_calendar", allDay: event.allDay },
      structuredMetadata: event,
      occurredAt: startedAt,
      startedAt,
      endedAt: eventDate(event.end),
      recurrenceRule: event.recurrence[0] ?? null,
      temporalState: temporalState(startedAt),
      updatedAt: new Date(),
      updatedById: actor.userId,
      version: entity.version + 1,
    }).where(eq(knowledgeEntitiesTable.id, entity.id));
  }
  await db.update(connectorSourceMappingsTable).set({
    state: Object.keys(overrides).length ? "detached" : "active",
    userOverrides: overrides,
    lastProviderValues: providerValues,
    lastReconciledAt: new Date(),
  }).where(eq(connectorSourceMappingsTable.id, mapping.id));
  return "updated";
}

async function assertSyncStillAuthorized(connectionId: string, selectionId: string, leaseId: string): Promise<void> {
  const connection = await requireOwnedConnection(connectionId);
  if (connection.state !== "syncing" || !connection.activeConsentId || connection.syncLeaseId !== leaseId) {
    throw new ConnectorError("consent_revoked", "permanent_connection", "Synchronization stopped because authorization changed.");
  }
  const selections = await db.select().from(connectorResourceSelectionsTable).where(and(
    eq(connectorResourceSelectionsTable.connectionId, connectionId),
    eq(connectorResourceSelectionsTable.selected, true),
    eq(connectorResourceSelectionsTable.accessStatus, "available"),
  ));
  if (!selections.some((selection) => selection.id === selectionId)) {
    throw new ConnectorError("resource_removed", "permanent_resource", "The selected calendar is no longer available.");
  }
  const [consent] = await db.select().from(connectorConsentsTable).where(and(
    eq(connectorConsentsTable.id, connection.activeConsentId),
    eq(connectorConsentsTable.status, "active"),
  ));
  if (!isConnectorConsentCurrent(connection, consent, selections.map((selection) => selection.providerResourceId))) {
    throw new ConnectorError("consent_revoked", "permanent_connection", "Synchronization stopped because authorization changed.");
  }
}

async function finishSync(
  actor: ConnectorActor,
  connectionId: string,
  runId: string,
  leaseId: string,
  counts: SyncCounts,
  error: unknown,
) {
  return withDatabaseActor(actor, async () => {
    let connection = await lockOwnedConnection(connectionId);
    if (connection.syncLeaseId !== leaseId && connection.state !== "revoked") {
      throw new ConnectorAccessError(409, "Synchronization lease changed before completion.");
    }
    const now = new Date();
    if (!error) {
      await db.update(connectorSyncRunsTable).set({ ...counts, status: counts.failedCount ? "partially_failed" : "completed", finishedAt: now }).where(eq(connectorSyncRunsTable.id, runId));
      connection = await transitionConnection(connection, counts.failedCount ? "degraded" : "active", {
        lastSuccessfulSyncAt: now,
        syncLeaseId: null,
        syncLeaseExpiresAt: null,
      });
      if (connection.dataSourceId) await db.update(dataSourcesTable).set({ lastSuccessfulSyncAt: now, updatedAt: now }).where(eq(dataSourcesTable.id, connection.dataSourceId));
      await writeConnectorAudit(actor, connection.id, counts.failedCount ? "sync_partially_failed" : "sync_completed", counts.failedCount ? "Google Calendar synchronization partially completed" : "Google Calendar synchronization completed", {
        fetchedCount: counts.fetchedCount,
        changedCount: counts.createdCount + counts.updatedCount + counts.tombstonedCount,
        retryCount: counts.retryCount,
        cursorRecoveryCount: counts.cursorRecoveryCount,
      });
      logger.info({
        signal: "connector_sync_completed",
        connectorKey: GOOGLE_CALENDAR_CONNECTOR_KEY,
        triggerType: runId ? "recorded" : "unknown",
        fetchedCount: counts.fetchedCount,
        changedCount: counts.createdCount + counts.updatedCount + counts.tombstonedCount,
        retryCount: counts.retryCount,
        cursorRecoveryCount: counts.cursorRecoveryCount,
      }, "Connector synchronization completed");
      const [run] = await db.select().from(connectorSyncRunsTable).where(eq(connectorSyncRunsTable.id, runId));
      return run;
    }

    const category = error instanceof ConnectorError ? error.category : "internal_persistence_failure";
    const summary = userSafeErrorSummary(error);
    const cancelled = connection.state === "revoked" || category === "consent_revoked" || category === "connection_paused";
    await db.update(connectorSyncRunsTable).set({
      ...counts,
      failedCount: counts.failedCount + 1,
      status: cancelled ? "cancelled" : "failed",
      finishedAt: now,
      errorCategory: category,
      errorSummary: summary,
    }).where(eq(connectorSyncRunsTable.id, runId));
    if (connection.state === "syncing") {
      const reconnect = error instanceof ConnectorError && error.disposition === "reconnect_required";
      connection = await transitionConnection(connection, reconnect ? "reconnect_required" : "degraded", {
        reconnectRequiredAt: reconnect ? now : connection.reconnectRequiredAt,
        syncLeaseId: null,
        syncLeaseExpiresAt: null,
      });
      if (reconnect) await writeConnectorAudit(actor, connection.id, "reconnect_required", "Google Calendar must be reconnected", { errorCategory: category });
    }
    await writeConnectorAudit(actor, connection.id, "sync_failed", "Google Calendar synchronization failed", { errorCategory: category, retryCount: counts.retryCount });
    logger.warn({ signal: "connector_sync_failed", connectorKey: GOOGLE_CALENDAR_CONNECTOR_KEY, errorCategory: category, retryCount: counts.retryCount }, "Connector synchronization failed");
    const [run] = await db.select().from(connectorSyncRunsTable).where(eq(connectorSyncRunsTable.id, runId));
    return run;
  });
}

function newBackfillWindow(): { backfillStart: string; backfillEnd: string } {
  const now = Date.now();
  return {
    backfillStart: new Date(now - backfillPastDays() * 86_400_000).toISOString(),
    backfillEnd: new Date(now + backfillFutureDays() * 86_400_000).toISOString(),
  };
}

function sourceQueryFingerprint(
  resourceId: string,
  cursor: string | null,
  backfillStart: string | null,
  backfillEnd: string | null,
): string {
  const canonicalQuery = JSON.stringify({
    version: GOOGLE_EVENTS_QUERY_VERSION,
    resourceId,
    mode: cursor ? "incremental" : "backfill",
    cursor,
    timeMin: backfillStart,
    timeMax: backfillEnd,
    maxResults: GOOGLE_EVENTS_PAGE_SIZE,
    showDeleted: true,
    singleEvents: false,
  });
  return createHash("sha256").update(canonicalQuery, "utf8").digest("hex");
}

async function recordCredentialFailure(
  actor: ConnectorActor,
  connectionId: string,
  trigger: "manual" | "scheduled",
  error: ConnectorError,
): Promise<void> {
  await withDatabaseActor(actor, async () => {
    let connection = await requireOwnedConnection(connectionId);
    if (["revoked", "archived"].includes(connection.state)) return;
    const now = new Date();
    await db.insert(connectorSyncRunsTable).values({
      connectionId: connection.id,
      householdId: actor.householdId,
      ownerUserId: actor.userId,
      triggerType: trigger,
      status: "failed",
      startedAt: now,
      finishedAt: now,
      failedCount: 1,
      errorCategory: error.category,
      errorSummary: userSafeErrorSummary(error),
    });
    if (["active", "degraded", "syncing"].includes(connection.state)) {
      connection = await transitionConnection(connection, "reconnect_required", {
        reconnectRequiredAt: now,
        lastAttemptedSyncAt: now,
        syncLeaseId: null,
        syncLeaseExpiresAt: null,
      });
    }
    await writeConnectorAudit(actor, connection.id, "reconnect_required", "Google Calendar must be reconnected", { errorCategory: error.category });
    await writeConnectorAudit(actor, connection.id, "sync_failed", "Google Calendar synchronization failed", { errorCategory: error.category, retryCount: 0 });
  });
}

async function withRetry<T>(
  operation: () => Promise<T>,
  counts: SyncCounts,
  timing: { sleep: (milliseconds: number) => Promise<void>; random: () => number },
): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof ConnectorError) || error.disposition !== "retryable" || attempt === 3) throw error;
      counts.retryCount += 1;
      const delay = error.retryAfterMs ?? Math.min(1000 * 2 ** attempt + Math.floor(timing.random() * 1000), 32_000);
      logger.warn({ signal: "connector_retry", connectorKey: GOOGLE_CALENDAR_CONNECTOR_KEY, errorCategory: error.category, attempt: attempt + 1, retryAfterMs: delay }, "Retrying connector provider request");
      await timing.sleep(delay);
    }
  }
  throw new Error("Unreachable connector retry state.");
}

async function incrementRunCounts(runId: string, delta: SyncCounts): Promise<void> {
  await db.execute(sql`
    update connector_sync_runs set
      fetched_count = fetched_count + ${delta.fetchedCount},
      created_count = created_count + ${delta.createdCount},
      updated_count = updated_count + ${delta.updatedCount},
      unchanged_count = unchanged_count + ${delta.unchangedCount},
      tombstoned_count = tombstoned_count + ${delta.tombstonedCount},
      skipped_count = skipped_count + ${delta.skippedCount},
      failed_count = failed_count + ${delta.failedCount},
      retry_count = retry_count + ${delta.retryCount},
      cursor_recovery_count = cursor_recovery_count + ${delta.cursorRecoveryCount}
    where id = ${runId}::uuid
  `);
}

function addCounts(target: SyncCounts, source: SyncCounts): void {
  for (const key of Object.keys(target) as Array<keyof SyncCounts>) target[key] += source[key];
}

function libraryProviderValues(event: NormalizedCalendarEvent, calendarDisplayName: string) {
  return {
    title: event.title,
    body: event.description,
    sourceLabel: `Google Calendar: ${calendarDisplayName}`.slice(0, 260),
    effectiveDate: event.start?.slice(0, 10) ?? null,
  };
}

function toDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function eventDate(value: string | null): Date | null {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value;
  return toDate(normalized);
}

function temporalState(startedAt: Date | null): "historical" | "current" | "future" {
  if (!startedAt) return "current";
  const delta = startedAt.getTime() - Date.now();
  if (delta > 86_400_000) return "future";
  if (delta < -86_400_000) return "historical";
  return "current";
}

function userSafeErrorSummary(error: unknown): string {
  if (error instanceof ConnectorError || error instanceof ConnectorAccessError) return error.message.slice(0, 300);
  return "Connector synchronization encountered an internal persistence failure.";
}
