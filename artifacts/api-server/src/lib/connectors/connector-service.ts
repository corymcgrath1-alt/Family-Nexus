import {
  connectorAuditEventsTable,
  connectorConnectionsTable,
  connectorConsentsTable,
  connectorOauthStatesTable,
  connectorResourceSelectionsTable,
  connectorSourceMappingsTable,
  connectorSourceObjectsTable,
  connectorSyncCheckpointsTable,
  connectorSyncRunsTable,
  dataSourcesTable,
  db,
  knowledgeEntitiesTable,
  knowledgeSourcesTable,
  libraryItemsTable,
  usersTable,
  withDatabaseActor,
  type ConnectorConnection,
  type DatabaseActor,
} from "@workspace/db";
import {
  assertConnectorStateTransition,
  ConnectorError,
  connectorConnectionStateSchema,
  type ConnectorProviderResource,
  type ConnectorTokenSet,
} from "@workspace/knowledge-model";
import { and, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod/v4";

import {
  connectorRegistry,
  GOOGLE_CALENDAR_CONNECTOR_KEY,
  GOOGLE_CALENDAR_CONSENT_PURPOSE,
  GOOGLE_CALENDAR_CONSENT_TEXT_VERSION,
  GOOGLE_CALENDAR_SCOPES,
  googleCalendarDefinition,
} from "./connector-definition";
import { decryptConnectorJson, decryptConnectorSecret, encryptConnectorJson } from "./credential-cipher";
import { getGoogleCalendarProvider, googleOauthRedirectUri } from "./provider-factory";
import { createOauthRequestMaterial, hashOauthState, validateConnectorRedirectPath } from "./oauth-security";

export type ConnectorActor = DatabaseActor & { role: "adult" | "child" };

const tokenSetSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).nullable(),
  expiresAt: z.string().datetime({ offset: true }),
  scopes: z.array(z.string().min(1)),
  tokenType: z.literal("Bearer"),
}).strict();

type CredentialRow = {
  credential_type: string;
  encrypted_payload: Buffer;
  encryption_nonce: Buffer;
  authentication_tag: Buffer;
  encryption_key_version: string;
  expires_at: Date | null;
  provider_metadata: Record<string, unknown>;
};

function queryRows<T>(result: unknown): T[] {
  return (result as { rows: T[] }).rows;
}

export function assertAdultActor(actor: ConnectorActor): void {
  if (actor.role !== "adult") throw new ConnectorAccessError(403, "Only adult accounts can manage connectors.");
}

export class ConnectorAccessError extends Error {
  constructor(readonly status: 400 | 403 | 404 | 409, message: string) {
    super(message);
  }
}

export async function listConnectorDefinitions() {
  return connectorRegistry.list();
}

export async function listConnections(actor: ConnectorActor) {
  assertAdultActor(actor);
  return withDatabaseActor(actor, async () => {
    const connections = await db.select().from(connectorConnectionsTable).orderBy(connectorConnectionsTable.createdAt);
    const runs = connections.length
      ? await db.select().from(connectorSyncRunsTable).where(inArray(connectorSyncRunsTable.connectionId, connections.map((row) => row.id)))
      : [];
    return connections.map((connection) => formatConnection(connection, runs));
  });
}

export async function getConnection(actor: ConnectorActor, connectionId: string) {
  assertAdultActor(actor);
  return withDatabaseActor(actor, async () => {
    const connection = await requireOwnedConnection(connectionId);
    const runs = await db.select().from(connectorSyncRunsTable).where(eq(connectorSyncRunsTable.connectionId, connection.id));
    return formatConnection(connection, runs);
  });
}

export async function beginGoogleAuthorization(actor: ConnectorActor, input: { redirectPath?: unknown; origin: string }) {
  assertAdultActor(actor);
  const redirectPath = validateConnectorRedirectPath(input.redirectPath);
  const provider = getGoogleCalendarProvider();
  const redirectUri = googleOauthRedirectUri(input.origin);
  const material = createOauthRequestMaterial();

  const passportId = await withDatabaseActor(actor, async () => {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, actor.userId));
    if (!user?.lighthousePassportId || user.role !== "adult") throw new ConnectorAccessError(403, "An adult Lighthouse Passport is required.");
    await db.insert(connectorOauthStatesTable).values({
      stateHash: material.stateHash,
      householdId: actor.householdId,
      ownerUserId: actor.userId,
      ownerPassportId: user.lighthousePassportId,
      connectorKey: GOOGLE_CALENDAR_CONNECTOR_KEY,
      redirectPath,
      encryptedPkceVerifier: material.encryptedVerifier.encryptedPayload,
      encryptionNonce: material.encryptedVerifier.encryptionNonce,
      authenticationTag: material.encryptedVerifier.authenticationTag,
      encryptionKeyVersion: material.encryptedVerifier.encryptionKeyVersion,
      expiresAt: material.expiresAt,
    });
    await writeConnectorAudit(actor, null, "authorization_initiated", "Google Calendar authorization initiated", {
      connectorVersion: googleCalendarDefinition.version,
      scopeCount: GOOGLE_CALENDAR_SCOPES.length,
    });
    return user.lighthousePassportId;
  });

  return {
    authorizationUrl: provider.buildAuthorizationUrl({
      state: material.state,
      redirectUri,
      codeChallenge: material.codeChallenge,
      scopes: GOOGLE_CALENDAR_SCOPES,
    }),
    expiresAt: material.expiresAt.toISOString(),
    passportId,
  };
}

export async function completeGoogleAuthorization(
  actor: ConnectorActor,
  input: { state: string; code?: string; error?: string; origin: string },
) {
  assertAdultActor(actor);
  const consumed = await withDatabaseActor(actor, async () => {
    const [state] = await db
      .update(connectorOauthStatesTable)
      .set({ consumedAt: new Date() })
      .where(and(
        eq(connectorOauthStatesTable.stateHash, hashOauthState(input.state)),
        isNull(connectorOauthStatesTable.consumedAt),
        gt(connectorOauthStatesTable.expiresAt, new Date()),
      ))
      .returning();
    if (!state) throw new ConnectorAccessError(400, "Authorization state is invalid or expired.");
    return state;
  });

  if (input.error || !input.code) {
    await withDatabaseActor(actor, () => writeConnectorAudit(actor, null, "authorization_denied", "Google Calendar authorization was not completed", {
      providerError: input.error ? "authorization_denied" : "missing_code",
    }));
    throw new ConnectorAccessError(400, "Google Calendar authorization was not completed.");
  }

  const verifier = decryptConnectorSecret({
    encryptedPayload: consumed.encryptedPkceVerifier,
    encryptionNonce: consumed.encryptionNonce,
    authenticationTag: consumed.authenticationTag,
    encryptionKeyVersion: consumed.encryptionKeyVersion,
  }, "oauth-pkce-verifier").toString("utf8");
  const provider = getGoogleCalendarProvider();
  const redirectUri = googleOauthRedirectUri(input.origin);

  let tokens: ConnectorTokenSet;
  let account: { stableId: string; displayLabel: string };
  try {
    tokens = await provider.exchangeAuthorizationCode({ code: input.code, redirectUri, codeVerifier: verifier });
    account = await provider.resolveAccount(tokens);
  } catch (error) {
    await withDatabaseActor(actor, () => writeConnectorAudit(actor, null, "authorization_failed", "Google Calendar authorization failed", {
      errorCategory: errorCategory(error),
    }));
    throw error;
  }

  const missingScope = GOOGLE_CALENDAR_SCOPES.find((scope) => !tokens.scopes.includes(scope));
  if (missingScope) {
    await withDatabaseActor(actor, () => writeConnectorAudit(actor, null, "authorization_failed", "Google Calendar authorization failed", {
      errorCategory: "missing_scope",
    }));
    throw new ConnectorAccessError(400, "Required Google Calendar permissions were not granted.");
  }

  return withDatabaseActor(actor, async () => {
    const existing = await db.select().from(connectorConnectionsTable).where(and(
      eq(connectorConnectionsTable.connectorKey, GOOGLE_CALENDAR_CONNECTOR_KEY),
      eq(connectorConnectionsTable.providerAccountId, account.stableId),
      ne(connectorConnectionsTable.state, "revoked"),
      ne(connectorConnectionsTable.state, "archived"),
    ));
    let connection = existing[0];
    if (connection && !["reconnect_required", "failed", "pending_authorization"].includes(connection.state)) {
      throw new ConnectorAccessError(409, "This Google account is already connected.");
    }
    if (connection && connection.state !== "pending_authorization") {
      connection = await transitionConnection(connection, "pending_authorization", {});
    }
    if (!connection) {
      [connection] = await db.insert(connectorConnectionsTable).values({
        connectorKey: GOOGLE_CALENDAR_CONNECTOR_KEY,
        connectorVersion: googleCalendarDefinition.version,
        provider: googleCalendarDefinition.provider,
        householdId: actor.householdId,
        ownerUserId: actor.userId,
        ownerPassportId: consumed.ownerPassportId,
        providerAccountId: account.stableId,
        providerAccountLabel: account.displayLabel,
        grantedScopes: tokens.scopes,
        selectedCapabilities: googleCalendarDefinition.capabilities,
      }).returning();
    } else {
      [connection] = await db.update(connectorConnectionsTable).set({
        providerAccountLabel: account.displayLabel,
        grantedScopes: tokens.scopes,
        reconnectRequiredAt: null,
        updatedAt: new Date(),
      }).where(eq(connectorConnectionsTable.id, connection.id)).returning();
    }
    await storeCredential(connection.id, tokens);
    await writeConnectorAudit(actor, connection.id, "authorization_completed", "Google Calendar authorization completed", {
      grantedScopeCount: tokens.scopes.length,
      providerAccountLinked: true,
    });
    return { connectionId: connection.id, redirectPath: consumed.redirectPath };
  });
}

export async function discoverConnectionResources(actor: ConnectorActor, connectionId: string) {
  assertAdultActor(actor);
  const { connection, tokens } = await withDatabaseActor(actor, async () => {
    const connection = await requireOwnedConnection(connectionId);
    assertConnectionUsableForProvider(connection);
    return { connection, tokens: await getFreshCredential(connection.id) };
  });
  const resources = await getGoogleCalendarProvider().discoverResources(tokens);
  return withDatabaseActor(actor, async () => {
    await requireOwnedConnection(connection.id);
    const now = new Date();
    for (const resource of resources) {
      await db.insert(connectorResourceSelectionsTable).values({
        connectionId: connection.id,
        householdId: actor.householdId,
        ownerUserId: actor.userId,
        providerResourceId: resource.stableId,
        resourceType: resource.resourceType,
        displayName: resource.displayName,
        displayMetadata: resource.metadata,
        lastObservedAt: now,
      }).onConflictDoUpdate({
        target: [connectorResourceSelectionsTable.connectionId, connectorResourceSelectionsTable.resourceType, connectorResourceSelectionsTable.providerResourceId],
        set: { displayName: resource.displayName, displayMetadata: resource.metadata, lastObservedAt: now, accessStatus: "available", updatedAt: now },
      });
    }
    const observed = new Set(resources.map((resource) => resource.stableId));
    const all = await db.select().from(connectorResourceSelectionsTable).where(eq(connectorResourceSelectionsTable.connectionId, connection.id));
    for (const selection of all) {
      if (!observed.has(selection.providerResourceId)) {
        await db.update(connectorResourceSelectionsTable).set({ accessStatus: "removed", selected: false, updatedAt: now }).where(eq(connectorResourceSelectionsTable.id, selection.id));
      }
    }
    return listStoredResources(connection.id);
  });
}

export async function listConnectionResources(actor: ConnectorActor, connectionId: string) {
  assertAdultActor(actor);
  return withDatabaseActor(actor, async () => {
    await requireOwnedConnection(connectionId);
    return listStoredResources(connectionId);
  });
}

export async function selectConnectionResources(actor: ConnectorActor, connectionId: string, resourceIds: string[]) {
  assertAdultActor(actor);
  if (resourceIds.length === 0) throw new ConnectorAccessError(400, "Select at least one calendar.");
  return withDatabaseActor(actor, async () => {
    let connection = await requireOwnedConnection(connectionId);
    if (["revoked", "archived", "failed", "reconnect_required"].includes(connection.state)) throw new ConnectorAccessError(409, "This connection cannot change resources.");
    const rows = await db.select().from(connectorResourceSelectionsTable).where(eq(connectorResourceSelectionsTable.connectionId, connection.id));
    const requested = new Set(resourceIds);
    if (rows.filter((row) => requested.has(row.providerResourceId) && row.accessStatus === "available").length !== requested.size) {
      throw new ConnectorAccessError(400, "One or more calendars are unavailable.");
    }
    const now = new Date();
    const changed = rows.filter((row) => row.selected !== requested.has(row.providerResourceId));
    for (const row of changed) {
      const selected = requested.has(row.providerResourceId);
      await db.update(connectorResourceSelectionsTable).set({
        selected,
        selectedAt: selected ? now : row.selectedAt,
        updatedAt: now,
      }).where(eq(connectorResourceSelectionsTable.id, row.id));
      await writeConnectorAudit(actor, connection.id, selected ? "resource_selected" : "resource_deselected", selected ? "Google calendar selected" : "Google calendar deselected", {
        resourceType: row.resourceType,
      });
    }
    if (changed.length > 0 && connection.activeConsentId) {
      await db.update(connectorConsentsTable).set({ status: "superseded" }).where(eq(connectorConsentsTable.id, connection.activeConsentId));
      if (connection.state === "active" || connection.state === "degraded") connection = await transitionConnection(connection, "paused", { scheduleEnabled: false });
      await db.update(connectorConnectionsTable).set({ activeConsentId: null, updatedAt: now }).where(eq(connectorConnectionsTable.id, connection.id));
      await writeConnectorAudit(actor, connection.id, "consent_changed", "Calendar selection changed and requires renewed Lighthouse consent", {
        selectedResourceCount: resourceIds.length,
      });
    }
    return listStoredResources(connection.id);
  });
}

export async function confirmConnectorConsent(actor: ConnectorActor, connectionId: string, input: { confirmed: boolean; purpose: string; consentTextVersion: string }) {
  assertAdultActor(actor);
  if (!input.confirmed) throw new ConnectorAccessError(400, "Explicit Lighthouse import consent is required.");
  if (input.purpose !== GOOGLE_CALENDAR_CONSENT_PURPOSE || input.consentTextVersion !== GOOGLE_CALENDAR_CONSENT_TEXT_VERSION) {
    throw new ConnectorAccessError(400, "The current Lighthouse consent text must be confirmed exactly.");
  }
  return withDatabaseActor(actor, async () => {
    let connection = await requireOwnedConnection(connectionId);
    if (!connection.providerAccountId || !["pending_authorization", "paused"].includes(connection.state)) {
      throw new ConnectorAccessError(409, "This connection is not ready for consent.");
    }
    const selected = await db.select().from(connectorResourceSelectionsTable).where(and(
      eq(connectorResourceSelectionsTable.connectionId, connection.id),
      eq(connectorResourceSelectionsTable.selected, true),
      eq(connectorResourceSelectionsTable.accessStatus, "available"),
    ));
    if (!selected.length) throw new ConnectorAccessError(400, "Select at least one calendar before confirming consent.");
    await db.update(connectorConsentsTable).set({ status: "superseded" }).where(and(
      eq(connectorConsentsTable.connectionId, connection.id),
      eq(connectorConsentsTable.status, "active"),
    ));
    const [consent] = await db.insert(connectorConsentsTable).values({
      connectionId: connection.id,
      householdId: actor.householdId,
      ownerUserId: actor.userId,
      ownerPassportId: connection.ownerPassportId,
      connectorKey: connection.connectorKey,
      providerAccountId: connection.providerAccountId,
      requestedScopes: [...GOOGLE_CALENDAR_SCOPES],
      grantedScopes: connection.grantedScopes,
      selectedCapabilities: connection.selectedCapabilities,
      selectedResourceIds: selected.map((row) => row.providerResourceId),
      purpose: input.purpose,
      consentTextVersion: input.consentTextVersion,
      materialVersion: `${connection.connectorVersion}:${selected.map((row) => row.providerResourceId).sort().join(",")}`,
    }).returning();

    let knowledgeSourceId = connection.knowledgeSourceId;
    let dataSourceId = connection.dataSourceId;
    if (!knowledgeSourceId) {
      const [source] = await db.insert(knowledgeSourcesTable).values({
        householdId: actor.householdId,
        ownerUserId: actor.userId,
        sourceKind: "external_api",
        provider: "Google Calendar",
        connectorKey: connection.connectorKey,
        connectorVersion: connection.connectorVersion,
        sourceLabel: "Google Calendar",
        externalReference: connection.providerAccountId,
        confidenceScore: "1",
        verificationState: "source_verified",
        provenance: { authorization: "user_oauth", consentId: consent.id },
        privacyLevel: "personal_private",
        sensitivity: "sensitive",
        retentionPolicy: "user_controlled",
      }).returning();
      knowledgeSourceId = source.id;
    }
    if (!dataSourceId) {
      const [source] = await db.insert(dataSourcesTable).values({
        householdId: actor.householdId,
        ownerUserId: actor.userId,
        provider: "google-calendar",
        connectorMode: "live-oauth-api",
        dataCategories: ["calendar_event"],
        requiredScopes: [...GOOGLE_CALENDAR_SCOPES],
        collectionMode: "live-oauth-api",
        refreshLimits: { backfillPastDays: backfillPastDays(), backfillFutureDays: backfillFutureDays(), pageSize: 250 },
        retentionPolicy: "user-controlled",
        allowedPurposes: ["personal_calendar_organization"],
        sensitivity: "sensitive",
        termsReviewStatus: "provider-reviewed",
      }).returning();
      dataSourceId = source.id;
    }

    connection = await transitionConnection(connection, "active", {
      activeConsentId: consent.id,
      scheduleEnabled: true,
      knowledgeSourceId,
      dataSourceId,
    });
    await writeConnectorAudit(actor, connection.id, "consent_granted", "Lighthouse calendar import consent granted", {
      consentTextVersion: input.consentTextVersion,
      selectedResourceCount: selected.length,
      privateByDefault: true,
    });
    return formatConnection(connection, []);
  });
}

export async function pauseConnection(actor: ConnectorActor, connectionId: string) {
  return changeConnectionState(actor, connectionId, "paused", "connection_paused", "Google Calendar synchronization paused", false);
}

export async function resumeConnection(actor: ConnectorActor, connectionId: string) {
  return changeConnectionState(actor, connectionId, "active", "connection_resumed", "Google Calendar synchronization resumed", true);
}

async function changeConnectionState(actor: ConnectorActor, connectionId: string, state: "paused" | "active", eventType: "connection_paused" | "connection_resumed", summary: string, scheduleEnabled: boolean) {
  assertAdultActor(actor);
  return withDatabaseActor(actor, async () => {
    const connection = await requireOwnedConnection(connectionId);
    if (state === "active" && !connection.activeConsentId) throw new ConnectorAccessError(409, "Renew Lighthouse consent before resuming.");
    const updated = await transitionConnection(connection, state, { scheduleEnabled });
    await writeConnectorAudit(actor, connection.id, eventType, summary, { scheduleEnabled });
    return formatConnection(updated, []);
  });
}

export async function revokeConnection(actor: ConnectorActor, connectionId: string, disposition: "retain" | "archive" | "delete") {
  assertAdultActor(actor);
  const tokens = await withDatabaseActor(actor, async () => {
    const connection = await requireOwnedConnection(connectionId);
    if (connection.state === "revoked" || connection.state === "archived") throw new ConnectorAccessError(409, "This connection is already revoked.");
    return getCredential(connection.id);
  });

  const revokedConnection = await withDatabaseActor(actor, async () => {
    let connection = await requireOwnedConnection(connectionId);
    const now = new Date();
    await db.update(connectorConsentsTable).set({ status: "revoked", revokedAt: now }).where(and(
      eq(connectorConsentsTable.connectionId, connection.id),
      eq(connectorConsentsTable.status, "active"),
    ));
    await disposeImportedData(actor, connection, disposition, now);
    await deleteCredential(connection.id);
    if (connection.dataSourceId) {
      await db.update(dataSourcesTable).set({ revokedAt: now, updatedAt: now }).where(eq(dataSourcesTable.id, connection.dataSourceId));
    }
    if (connection.knowledgeSourceId) {
      await db.update(knowledgeSourcesTable).set({
        status: "archived",
        archivedAt: now,
        updatedAt: now,
      }).where(eq(knowledgeSourcesTable.id, connection.knowledgeSourceId));
    }
    connection = await transitionConnection(connection, "revoked", {
      activeConsentId: null,
      scheduleEnabled: false,
      revokedAt: now,
      syncLeaseId: null,
      syncLeaseExpiresAt: null,
    });
    await writeConnectorAudit(actor, connection.id, "connection_revoked", "Google Calendar connection revoked", {
      importedDataDisposition: disposition,
      providerRevocationRequested: true,
    });
    const retentionEvent = disposition === "retain" ? "imported_records_retained" : disposition === "archive" ? "imported_records_archived" : "imported_records_deleted";
    await writeConnectorAudit(actor, connection.id, retentionEvent, disposition === "retain" ? "Imported calendar records retained" : disposition === "archive" ? "Eligible imported calendar records archived" : "Eligible imported calendar records deleted", {
      correctedRecordsPreserved: true,
    });
    return formatConnection(connection, []);
  });

  let providerRevocationConfirmed = true;
  try {
    await getGoogleCalendarProvider().revoke(tokens);
  } catch {
    providerRevocationConfirmed = false;
  }
  return { ...revokedConnection, providerRevocationConfirmed };
}

export async function listSyncRuns(actor: ConnectorActor, connectionId: string) {
  assertAdultActor(actor);
  return withDatabaseActor(actor, async () => {
    await requireOwnedConnection(connectionId);
    const runs = await db.select().from(connectorSyncRunsTable).where(eq(connectorSyncRunsTable.connectionId, connectionId)).orderBy(connectorSyncRunsTable.createdAt);
    return runs.map(formatSyncRun);
  });
}

export async function requireOwnedConnection(connectionId: string): Promise<ConnectorConnection> {
  const [connection] = await db.select().from(connectorConnectionsTable).where(eq(connectorConnectionsTable.id, connectionId));
  if (!connection) throw new ConnectorAccessError(404, "Not found");
  return connection;
}

export async function transitionConnection(
  connection: ConnectorConnection,
  targetState: z.infer<typeof connectorConnectionStateSchema>,
  patch: Partial<typeof connectorConnectionsTable.$inferInsert>,
): Promise<ConnectorConnection> {
  const source = connectorConnectionStateSchema.parse(connection.state);
  assertConnectorStateTransition(source, targetState);
  const [updated] = await db.update(connectorConnectionsTable).set({ ...patch, state: targetState, updatedAt: new Date() }).where(eq(connectorConnectionsTable.id, connection.id)).returning();
  if (!updated) throw new ConnectorAccessError(404, "Not found");
  return updated;
}

export async function getFreshCredential(connectionId: string): Promise<ConnectorTokenSet> {
  const tokens = await getCredential(connectionId);
  if (new Date(tokens.expiresAt).getTime() - Date.now() > 60_000) return tokens;
  const refreshed = await getGoogleCalendarProvider().refreshCredentials(tokens);
  if (!refreshed.refreshToken && tokens.refreshToken) refreshed.refreshToken = tokens.refreshToken;
  await storeCredential(connectionId, refreshed);
  return refreshed;
}

export async function expireConnectorCredentialForTest(actor: ConnectorActor, connectionId: string): Promise<void> {
  if (process.env.NODE_ENV === "production" || process.env.CONNECTOR_PROVIDER_MODE !== "fake") {
    throw new ConnectorAccessError(404, "Not found");
  }
  await withDatabaseActor(actor, async () => {
    await requireOwnedConnection(connectionId);
    const tokens = await getCredential(connectionId);
    await storeCredential(connectionId, { ...tokens, expiresAt: new Date(Date.now() - 60_000).toISOString() });
  });
}

export async function storeCredential(connectionId: string, tokens: ConnectorTokenSet): Promise<void> {
  const encrypted = encryptConnectorJson(tokens, `oauth-token-set:${connectionId}`);
  await db.execute(sql`
    select lighthouse_put_connector_credential(
      ${connectionId}::uuid,
      'oauth_token_set',
      ${encrypted.encryptedPayload},
      ${encrypted.encryptionNonce},
      ${encrypted.authenticationTag},
      ${encrypted.encryptionKeyVersion},
      ${new Date(tokens.expiresAt)},
      ${JSON.stringify({ scopeCount: tokens.scopes.length })}::jsonb
    )
  `);
}

export async function getCredential(connectionId: string): Promise<ConnectorTokenSet> {
  const result = await db.execute(sql`select * from lighthouse_get_connector_credential(${connectionId}::uuid)`);
  const row = queryRows<CredentialRow>(result)[0];
  if (!row) throw new ConnectorError("invalid_credentials", "reconnect_required", "Connector credentials are unavailable. Reconnect the account.");
  return decryptConnectorJson({
    encryptedPayload: row.encrypted_payload,
    encryptionNonce: row.encryption_nonce,
    authenticationTag: row.authentication_tag,
    encryptionKeyVersion: row.encryption_key_version,
  }, `oauth-token-set:${connectionId}`, tokenSetSchema);
}

export async function deleteCredential(connectionId: string): Promise<void> {
  await db.execute(sql`select lighthouse_delete_connector_credential(${connectionId}::uuid)`);
}

export async function writeConnectorAudit(
  actor: ConnectorActor,
  connectionId: string | null,
  eventType: typeof connectorAuditEventsTable.$inferInsert.eventType,
  summary: string,
  metadata: Record<string, string | number | boolean | null>,
): Promise<void> {
  const forbidden = ["token", "code", "title", "description", "email", "payload", "cursor", "secret", "verifier"];
  if (Object.keys(metadata).some((key) => {
    const normalized = key.replace(/[^a-z]/gi, "").toLowerCase();
    return !normalized.endsWith("count") && forbidden.some((term) => normalized.includes(term));
  })) {
    throw new Error("Connector audit metadata contains a prohibited key.");
  }
  await db.insert(connectorAuditEventsTable).values({
    householdId: actor.householdId,
    ownerUserId: actor.userId,
    actorUserId: actor.userId,
    connectionId,
    connectorKey: GOOGLE_CALENDAR_CONNECTOR_KEY,
    eventType,
    summary,
    metadata,
  });
}

export function backfillPastDays(): number {
  return boundedDays(process.env.CONNECTOR_BACKFILL_PAST_DAYS, 365);
}

export function backfillFutureDays(): number {
  return boundedDays(process.env.CONNECTOR_BACKFILL_FUTURE_DAYS, 365);
}

function boundedDays(raw: string | undefined, fallback: number): number {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 3650) throw new Error("Connector backfill windows must be between 1 and 3650 days.");
  return value;
}

function assertConnectionUsableForProvider(connection: ConnectorConnection): void {
  if (["revoked", "archived", "failed"].includes(connection.state)) throw new ConnectorAccessError(409, "This connection is unavailable.");
}

async function listStoredResources(connectionId: string) {
  const rows = await db.select().from(connectorResourceSelectionsTable).where(eq(connectorResourceSelectionsTable.connectionId, connectionId)).orderBy(connectorResourceSelectionsTable.displayName);
  return rows.map((row) => ({
    id: row.id,
    providerResourceId: row.providerResourceId,
    resourceType: row.resourceType,
    displayName: row.displayName,
    displayMetadata: row.displayMetadata as Record<string, string | boolean | null>,
    selected: row.selected,
    accessStatus: row.accessStatus,
    lastObservedAt: row.lastObservedAt.toISOString(),
  }));
}

function formatConnection(connection: ConnectorConnection, runs: Array<typeof connectorSyncRunsTable.$inferSelect>) {
  const latestRun = [...runs].filter((run) => run.connectionId === connection.id).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  return {
    id: connection.id,
    connectorKey: connection.connectorKey,
    connectorVersion: connection.connectorVersion,
    displayName: googleCalendarDefinition.displayName,
    provider: connection.provider,
    providerAccountLabel: connection.providerAccountLabel,
    state: connection.state,
    grantedScopes: connection.grantedScopes,
    selectedCapabilities: connection.selectedCapabilities,
    scheduleEnabled: connection.scheduleEnabled,
    hasActiveConsent: Boolean(connection.activeConsentId),
    lastSuccessfulSyncAt: connection.lastSuccessfulSyncAt?.toISOString() ?? null,
    lastAttemptedSyncAt: connection.lastAttemptedSyncAt?.toISOString() ?? null,
    reconnectRequiredAt: connection.reconnectRequiredAt?.toISOString() ?? null,
    revokedAt: connection.revokedAt?.toISOString() ?? null,
    latestSyncRun: latestRun ? formatSyncRun(latestRun) : null,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
  };
}

function formatSyncRun(run: typeof connectorSyncRunsTable.$inferSelect) {
  return {
    id: run.id,
    triggerType: run.triggerType,
    status: run.status,
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    fetchedCount: run.fetchedCount,
    createdCount: run.createdCount,
    updatedCount: run.updatedCount,
    unchangedCount: run.unchangedCount,
    tombstonedCount: run.tombstonedCount,
    skippedCount: run.skippedCount,
    failedCount: run.failedCount,
    retryCount: run.retryCount,
    cursorRecoveryCount: run.cursorRecoveryCount,
    errorCategory: run.errorCategory,
    errorSummary: run.errorSummary,
    createdAt: run.createdAt.toISOString(),
  };
}

async function disposeImportedData(actor: ConnectorActor, connection: ConnectorConnection, disposition: "retain" | "archive" | "delete", now: Date): Promise<void> {
  const sourceObjects = await db.select().from(connectorSourceObjectsTable).where(eq(connectorSourceObjectsTable.connectionId, connection.id));
  const mappings = sourceObjects.length
    ? await db.select().from(connectorSourceMappingsTable).where(inArray(connectorSourceMappingsTable.sourceObjectId, sourceObjects.map((row) => row.id)))
    : [];
  if (disposition === "retain") {
    if (mappings.length) await db.update(connectorSourceMappingsTable).set({ state: "detached", lastReconciledAt: now }).where(inArray(connectorSourceMappingsTable.id, mappings.map((row) => row.id)));
    return;
  }

  const preservedSourceIds = new Set<string>();
  for (const mapping of mappings) {
    const [item] = mapping.targetLibraryItemId
      ? await db.select().from(libraryItemsTable).where(eq(libraryItemsTable.id, mapping.targetLibraryItemId))
      : [];
    const [entity] = mapping.targetEntityId
      ? await db.select().from(knowledgeEntitiesTable).where(eq(knowledgeEntitiesTable.id, mapping.targetEntityId))
      : [];
    const overrides = { ...((mapping.userOverrides as Record<string, boolean>) ?? {}) };
    const previous = (mapping.lastProviderValues as Record<string, unknown>) ?? {};
    if (item) {
      for (const key of ["title", "body", "sourceLabel", "effectiveDate"] as const) {
        if (item[key] !== (previous[key] ?? null)) overrides[key] = true;
      }
    }
    const preserve = Object.keys(overrides).length > 0 || item?.retentionPolicy === "legal-hold" || entity?.legalHold;
    if (preserve) {
      preservedSourceIds.add(mapping.sourceObjectId);
      await db.update(connectorSourceMappingsTable).set({ state: "detached", userOverrides: overrides, lastReconciledAt: now }).where(eq(connectorSourceMappingsTable.id, mapping.id));
      continue;
    }
    if (item) {
      await db.update(libraryItemsTable).set({
        status: disposition === "archive" ? "archived" : "deleted",
        archivedAt: disposition === "archive" ? now : item.archivedAt,
        deletedAt: disposition === "delete" ? now : item.deletedAt,
        updatedAt: now,
        updatedById: actor.userId,
        version: item.version + 1,
      }).where(eq(libraryItemsTable.id, item.id));
    }
    if (entity) {
      await db.update(knowledgeEntitiesTable).set({
        status: disposition === "archive" ? "archived" : "deleted",
        archivedAt: disposition === "archive" ? now : entity.archivedAt,
        deletedAt: disposition === "delete" ? now : entity.deletedAt,
        updatedAt: now,
        updatedById: actor.userId,
        version: entity.version + 1,
      }).where(eq(knowledgeEntitiesTable.id, entity.id));
    }
    await db.update(connectorSourceMappingsTable).set({ state: disposition === "delete" ? "deleted" : "detached", lastReconciledAt: now }).where(eq(connectorSourceMappingsTable.id, mapping.id));
  }

  if (disposition === "delete") {
    const deletable = sourceObjects.filter((source) => !preservedSourceIds.has(source.id));
    if (deletable.length) await db.delete(connectorSourceObjectsTable).where(inArray(connectorSourceObjectsTable.id, deletable.map((row) => row.id)));
    await db.delete(connectorSyncCheckpointsTable).where(eq(connectorSyncCheckpointsTable.connectionId, connection.id));
    await db.execute(sql`
      delete from connector_resource_selections selection
      where selection.connection_id = ${connection.id}
        and not exists (
          select 1 from connector_source_objects source
          where source.resource_selection_id = selection.id
        )
    `);
  }
}

function errorCategory(error: unknown): string {
  return error && typeof error === "object" && "category" in error && typeof error.category === "string" ? error.category : "internal_error";
}
