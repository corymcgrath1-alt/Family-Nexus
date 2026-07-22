import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { after, before, describe, test } from "node:test";
import { and, eq, inArray, sql } from "drizzle-orm";

const runtimeDatabaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://lighthouse_test_app:lighthouse_test_app_password@127.0.0.1:55432/lighthouse_test";
const migrationDatabaseUrl = process.env.TEST_DATABASE_MIGRATION_URL ?? "postgres://lighthouse_test:lighthouse_test_password@127.0.0.1:55432/lighthouse_test";
const workerDatabaseUrl = process.env.TEST_CONNECTOR_WORKER_DATABASE_URL ?? "postgres://lighthouse_test_worker:lighthouse_test_worker_password@127.0.0.1:55432/lighthouse_test";
process.env.DATABASE_URL = runtimeDatabaseUrl;
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET ??= "connector-integration-session-secret";
process.env.LOG_LEVEL ??= "silent";
process.env.CONNECTOR_PROVIDER_MODE = "fake";
process.env.CONNECTOR_ACTIVE_KEY_VERSION = "test-v1";
process.env.CONNECTOR_CREDENTIAL_KEYS_JSON = JSON.stringify({ "test-v1": Buffer.alloc(32, 7).toString("base64") });
process.env.CONNECTOR_APP_ORIGIN = "http://127.0.0.1:5173";

type DbModule = typeof import("@workspace/db");
type DatabaseInstance = ReturnType<DbModule["createDatabase"]>;
type UserRow = DbModule["usersTable"]["$inferSelect"];
type TestClient = { request: (path: string, init?: RequestInit) => Promise<TestResponse> };
type TestResponse = { status: number; body: unknown; text: string; headers: Headers };

let dbm: DbModule;
let admin: DatabaseInstance;
let worker: DatabaseInstance;
let server: Server;
let baseUrl: string;
let adultA: UserRow;
let adultB: UserRow;

describe("connector platform integration", { concurrency: false }, () => {
before(async () => {
  dbm = await import("@workspace/db");
  admin = dbm.createDatabase(migrationDatabaseUrl);
  worker = dbm.createDatabase(workerDatabaseUrl);
  const bcrypt = (await import("bcryptjs")).default;
  const passwordHash = await bcrypt.hash("CorrectHorseBattery1!", 4);
  const [household] = await admin.db.insert(dbm.householdsTable).values({ name: "Connector Integration Household" }).returning();
  [adultA] = await admin.db.insert(dbm.usersTable).values({
    householdId: household.id,
    lighthousePassportId: newPassportId(),
    email: "connector.a@example.test",
    passwordHash,
    displayName: "Connector Adult A",
    role: "adult",
    avatarInitials: "CA",
    color: "#4A7C59",
  }).returning();
  [adultB] = await admin.db.insert(dbm.usersTable).values({
    householdId: household.id,
    lighthousePassportId: newPassportId(),
    email: "connector.b@example.test",
    passwordHash,
    displayName: "Connector Adult B",
    role: "adult",
    avatarInitials: "CB",
    color: "#2C6E8A",
  }).returning();
  const { fakeGoogleCalendarProvider } = await import("./fake-google-calendar-provider");
  fakeGoogleCalendarProvider.reset();
  const { default: app } = await import("../../app");
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await Promise.all([dbm.pool.end(), admin.pool.end(), worker.pool.end()]);
});

test("connector migration creates constrained RLS tables and isolated credential authority", async () => {
  const expectedTables = [
    "connector_connections", "connector_consents", "connector_credentials", "connector_resource_selections",
    "connector_sync_checkpoints", "connector_sync_runs", "connector_source_objects", "connector_source_mappings",
    "connector_oauth_states", "connector_audit_events",
  ];
  const tables = await admin.pool.query<{ table_name: string; relrowsecurity: boolean }>(`
    select information_schema.tables.table_name, pg_class.relrowsecurity
    from information_schema.tables
    join pg_class on pg_class.relname = information_schema.tables.table_name
    where information_schema.tables.table_schema = 'public'
      and information_schema.tables.table_name = any($1)
  `, [expectedTables]);
  assert.deepEqual(new Set(tables.rows.map((row) => row.table_name)), new Set(expectedTables));
  assert(tables.rows.every((row) => row.relrowsecurity));

  const indexes = await admin.pool.query<{ indexname: string }>("select indexname from pg_indexes where schemaname = 'public'");
  const indexNames = new Set(indexes.rows.map((row) => row.indexname));
  for (const name of [
    "connector_connections_active_account_uq", "connector_resource_selections_connection_resource_uq",
    "connector_sync_checkpoints_connection_resource_uq", "connector_source_objects_external_uq",
  ]) assert(indexNames.has(name), `Missing connector index ${name}`);

  const role = await admin.pool.query("select rolcanlogin, rolsuper, rolbypassrls from pg_roles where rolname = 'lighthouse_connector_worker'");
  assert.deepEqual(role.rows, [{ rolcanlogin: false, rolsuper: false, rolbypassrls: false }]);
  await assert.rejects(dbm.pool.query("select * from connector_credentials"), isPermissionDenied);
  await assert.rejects(dbm.pool.query("select * from lighthouse_claim_due_connector()"), isPermissionDenied);
  await assert.rejects(dbm.pool.query("select * from lighthouse_purge_connector_operational_data(now())"), isPermissionDenied);
  assert.deepEqual((await worker.pool.query("select * from lighthouse_purge_connector_operational_data(now())")).rows, [{ oauth_states_deleted: 0, sync_runs_deleted: 0 }]);

  for (const table of expectedTables.filter((name) => name !== "connector_credentials")) {
    const result = await dbm.pool.query<{ count: number }>(`select count(*)::int as count from ${table}`);
    assert.equal(result.rows[0]?.count, 0, `${table} must fail closed without actor context`);
  }
});

test("Google OAuth, consent, selection, sync, correction, worker, and revocation stay actor scoped", async () => {
  const unauthenticated = createClient();
  assert.equal((await unauthenticated.request("/api/connectors/definitions")).status, 401);
  const clientA = await login(adultA.email);
  const clientB = await login(adultB.email);

  const deniedState = await beginAuthorization(clientA);
  const denied = await clientA.request(`/api/connectors/google-calendar/oauth/callback?state=${encodeURIComponent(deniedState)}&error=access_denied`, { redirect: "manual" });
  assert.equal(denied.status, 303);
  assert(denied.headers.get("location")?.includes("oauth=error"));
  const missingScopeState = await beginAuthorization(clientA);
  const missingScope = await clientA.request(`/api/connectors/google-calendar/oauth/callback?state=${encodeURIComponent(missingScopeState)}&code=fake-missing-scope-code`, { redirect: "manual" });
  assert.equal(missingScope.status, 303);
  assert(missingScope.headers.get("location")?.includes("oauth=error"));

  const definitions = await clientA.request("/api/connectors/definitions");
  assert.equal(definitions.status, 200);
  assert.equal((definitions.body as unknown[]).length, 1);
  assert.equal((definitions.body as Array<{ connectorKey: string }>)[0]?.connectorKey, "google.calendar");

  const connectionId = await authorizeSelectConsentAndSync(clientA);
  const connection = await clientA.request(`/api/connectors/connections/${connectionId}`);
  assert.equal(connection.status, 200);
  assert.equal((connection.body as { state: string }).state, "active");
  assert.equal((connection.body as { providerAccountLabel: string }).providerAccountLabel, "owner@fake.google.test");
  assert(!JSON.stringify(connection.body).includes("fake-access-token"));
  assert(!JSON.stringify(connection.body).includes("fake-refresh-token"));

  const credential = await admin.pool.query<{ encrypted_payload: Buffer }>("select encrypted_payload from connector_credentials where connection_id = $1", [connectionId]);
  assert.equal(credential.rows.length, 1);
  assert(!credential.rows[0]!.encrypted_payload.toString("utf8").includes("fake-refresh-token"));

  const sourceObjects = await admin.pool.query<{ external_object_id: string; normalized_payload: Record<string, unknown> }>("select external_object_id, normalized_payload from connector_source_objects where connection_id = $1 order by external_object_id", [connectionId]);
  assert.deepEqual(sourceObjects.rows.map((row) => row.external_object_id), ["fake-event-correctable", "fake-event-delete-me"]);
  assert(!JSON.stringify(sourceObjects.rows).includes("UNSELECTED_CALENDAR_PRIVATE_EVENT"));
  const imported = await admin.pool.query<{ id: number; visibility: string; owner_user_id: number; title: string; body: string | null }>(`
    select item.id, item.visibility, item.owner_user_id, item.title, item.body
    from library_items item
    join connector_source_mappings mapping on mapping.target_library_item_id = item.id
    join connector_source_objects source on source.id = mapping.source_object_id
    where source.connection_id = $1
    order by item.id
  `, [connectionId]);
  assert.equal(imported.rows.length, 2);
  assert(imported.rows.every((row) => row.visibility === "private" && row.owner_user_id === adultA.id));

  assert.deepEqual((await clientB.request("/api/connectors/connections")).body, []);
  for (const path of [
    `/api/connectors/connections/${connectionId}`,
    `/api/connectors/connections/${connectionId}/resources`,
    `/api/connectors/connections/${connectionId}/sync-runs`,
  ]) assert.equal((await clientB.request(path)).status, 404);
  assert.equal((await clientB.request(`/api/connectors/connections/${connectionId}/sync`, { method: "POST" })).status, 404);
  assert.equal((await clientB.request(`/api/connectors/connections/${connectionId}/revoke`, { method: "POST", body: JSON.stringify({ disposition: "delete" }) })).status, 404);
  const bLibrary = await clientB.request("/api/library/items?q=Provider");
  assert.equal(bLibrary.status, 200);
  assert.deepEqual(bLibrary.body, []);
  assert(!JSON.stringify(bLibrary.body).includes("owner@fake.google.test"));

  const secondSync = await clientA.request(`/api/connectors/connections/${connectionId}/sync`, { method: "POST" });
  assert.equal(secondSync.status, 202);
  assert.equal((secondSync.body as { createdCount: number; fetchedCount: number }).createdCount, 0);
  assert.equal((secondSync.body as { fetchedCount: number }).fetchedCount, 0);
  assert.equal((await admin.pool.query("select count(*)::int as count from connector_source_objects where connection_id = $1", [connectionId])).rows[0].count, 2);

  assert.equal((await clientA.request(`/api/connectors/connections/${connectionId}/fake-scenario`, { method: "POST", body: JSON.stringify({ scenario: "token_expiry" }) })).status, 204);
  const expiredCredential = await admin.pool.query<{ expires_at: Date }>("select expires_at from connector_credentials where connection_id = $1", [connectionId]);
  assert(expiredCredential.rows[0]!.expires_at.getTime() < Date.now());
  assert.equal((await clientA.request(`/api/connectors/connections/${connectionId}/sync`, { method: "POST" })).status, 202);
  const refreshedCredential = await admin.pool.query<{ expires_at: Date }>("select expires_at from connector_credentials where connection_id = $1", [connectionId]);
  assert(refreshedCredential.rows[0]!.expires_at.getTime() > Date.now());

  await clientA.request(`/api/connectors/connections/${connectionId}/fake-scenario`, { method: "POST", body: JSON.stringify({ scenario: "incremental_change" }) });
  const changed = await clientA.request(`/api/connectors/connections/${connectionId}/sync`, { method: "POST" });
  assert.equal(changed.status, 202);
  assert.equal((changed.body as { createdCount: number }).createdCount, 1);
  assert.equal((changed.body as { updatedCount: number }).updatedCount, 1);
  assert.equal((changed.body as { tombstonedCount: number }).tombstonedCount, 1);

  const correctable = await admin.pool.query<{ id: number }>(`
    select mapping.target_library_item_id as id
    from connector_source_mappings mapping
    join connector_source_objects source on source.id = mapping.source_object_id
    where source.connection_id = $1 and source.external_object_id = 'fake-event-correctable'
  `, [connectionId]);
  const correctedTitle = "User preserved calendar title";
  const correctedBody = "User preserved calendar details";
  const correction = await clientA.request(`/api/library/items/${correctable.rows[0]!.id}`, {
    method: "PATCH",
    body: JSON.stringify({ title: correctedTitle, body: correctedBody }),
  });
  assert.equal(correction.status, 200);
  await clientA.request(`/api/connectors/connections/${connectionId}/fake-scenario`, { method: "POST", body: JSON.stringify({ scenario: "provider_update" }) });
  assert.equal((await clientA.request(`/api/connectors/connections/${connectionId}/sync`, { method: "POST" })).status, 202);
  const correctedAfter = await clientA.request(`/api/library/items/${correctable.rows[0]!.id}`);
  assert.equal((correctedAfter.body as { title: string }).title, correctedTitle);
  assert.equal((correctedAfter.body as { body: string }).body, correctedBody);
  const mapping = await admin.pool.query<{ state: string; user_overrides: Record<string, boolean> }>(`
    select mapping.state, mapping.user_overrides
    from connector_source_mappings mapping
    join connector_source_objects source on source.id = mapping.source_object_id
    where source.connection_id = $1 and source.external_object_id = 'fake-event-correctable'
  `, [connectionId]);
  assert.equal(mapping.rows[0]?.state, "detached");
  assert.equal(mapping.rows[0]?.user_overrides.title, true);
  assert.equal(mapping.rows[0]?.user_overrides.body, true);

  assert.equal((await clientA.request(`/api/connectors/connections/${connectionId}/pause`, { method: "POST" })).status, 200);
  assert.equal((await clientA.request(`/api/connectors/connections/${connectionId}/sync`, { method: "POST" })).status, 409);
  assert.equal((await clientA.request(`/api/connectors/connections/${connectionId}/resume`, { method: "POST" })).status, 200);

  await admin.pool.query("update connector_connections set last_successful_sync_at = now() - interval '1 hour' where id = $1", [connectionId]);
  const claim = await worker.pool.query<{ connection_id: string; owner_user_id: number; household_id: number; lease_id: string }>("select * from lighthouse_claim_due_connector()");
  assert.equal(claim.rows[0]?.connection_id, connectionId);
  const { runConnectorSync } = await import("./connector-sync-service");
  const workerRun = await runConnectorSync(
    { userId: claim.rows[0]!.owner_user_id, householdId: claim.rows[0]!.household_id, role: "adult" },
    connectionId,
    "scheduled",
    { preclaimedLeaseId: claim.rows[0]!.lease_id, sleep: async () => {}, random: () => 0 },
  );
  assert.equal(workerRun.triggerType, "scheduled");
  assert.equal(workerRun.status, "completed");

  await clientA.request(`/api/connectors/connections/${connectionId}/fake-scenario`, { method: "POST", body: JSON.stringify({ scenario: "rate_limit" }) });
  let releaseSleep!: () => void;
  let enteredSleep!: () => void;
  const sleeping = new Promise<void>((resolve) => { enteredSleep = resolve; });
  const release = new Promise<void>((resolve) => { releaseSleep = resolve; });
  const interrupted = runConnectorSync(
    { userId: adultA.id, householdId: adultA.householdId, role: "adult" },
    connectionId,
    "manual",
    { sleep: async () => { enteredSleep(); await release; }, random: () => 0 },
  );
  await sleeping;
  const revoked = await clientA.request(`/api/connectors/connections/${connectionId}/revoke`, { method: "POST", body: JSON.stringify({ disposition: "retain" }) });
  assert.equal(revoked.status, 200);
  releaseSleep();
  await assert.rejects(interrupted);
  assert.equal((await clientA.request(`/api/connectors/connections/${connectionId}/sync`, { method: "POST" })).status, 409);
  const cancelled = await admin.pool.query<{ status: string }>("select status from connector_sync_runs where connection_id = $1 order by created_at desc limit 1", [connectionId]);
  assert.equal(cancelled.rows[0]?.status, "cancelled");
  const preserved = await clientA.request(`/api/library/items/${correctable.rows[0]!.id}`);
  assert.equal(preserved.status, 200);
  assert.equal((preserved.body as { body: string }).body, correctedBody);

  const audit = await admin.pool.query<{ metadata: Record<string, unknown> }>("select metadata from connector_audit_events where connection_id = $1", [connectionId]);
  const serializedAudit = JSON.stringify(audit.rows);
  for (const token of ["fake-access-token", "fake-refresh-token", correctedTitle, correctedBody, "owner@fake.google.test", "fake-cursor"]) {
    assert(!serializedAudit.includes(token), `Connector audit must not contain ${token}`);
  }
});

test("permanent revocation removes connector state and eligible imported records without cross-user leakage", async () => {
  const { fakeGoogleCalendarProvider } = await import("./fake-google-calendar-provider");
  fakeGoogleCalendarProvider.reset();
  const clientA = await login(adultA.email);
  const clientB = await login(adultB.email);
  const connectionId = await authorizeSelectConsentAndSync(clientA);
  const targets = await admin.pool.query<{ target_library_item_id: number; target_entity_id: string }>(`
    select mapping.target_library_item_id, mapping.target_entity_id
    from connector_source_mappings mapping
    join connector_source_objects source on source.id = mapping.source_object_id
    where source.connection_id = $1
  `, [connectionId]);
  assert.equal(targets.rows.length, 2);
  assert.equal((await clientA.request(`/api/connectors/connections/${connectionId}/fake-scenario`, { method: "POST", body: JSON.stringify({ scenario: "token_expiry" }) })).status, 204);
  assert.equal((await clientA.request(`/api/connectors/connections/${connectionId}/fake-scenario`, { method: "POST", body: JSON.stringify({ scenario: "refresh_failure" }) })).status, 204);
  const failedRefresh = await clientA.request(`/api/connectors/connections/${connectionId}/sync`, { method: "POST" });
  assert.equal(failedRefresh.status, 409);
  const reconnectRequired = await clientA.request(`/api/connectors/connections/${connectionId}`);
  assert.equal((reconnectRequired.body as { state: string }).state, "reconnect_required");
  const revoke = await clientA.request(`/api/connectors/connections/${connectionId}/revoke`, { method: "POST", body: JSON.stringify({ disposition: "delete" }) });
  assert.equal(revoke.status, 200);
  for (const table of ["connector_credentials", "connector_sync_checkpoints", "connector_source_objects", "connector_resource_selections"]) {
    const result = await admin.pool.query<{ count: number }>(`select count(*)::int as count from ${table} where connection_id = $1`, [connectionId]);
    assert.equal(result.rows[0]?.count, 0, `${table} should be removed`);
  }
  const remainingMappings = await admin.pool.query<{ count: number }>(
    "select count(*)::int as count from connector_source_mappings where target_library_item_id = any($1::integer[])",
    [targets.rows.map((row) => row.target_library_item_id)],
  );
  assert.equal(remainingMappings.rows[0]?.count, 0, "connector_source_mappings should be removed");
  const itemRows = await admin.db.select().from(dbm.libraryItemsTable).where(inArray(dbm.libraryItemsTable.id, targets.rows.map((row) => row.target_library_item_id)));
  assert(itemRows.every((row) => row.status === "deleted" && row.deletedAt));
  const entityRows = await admin.db.select().from(dbm.knowledgeEntitiesTable).where(inArray(dbm.knowledgeEntitiesTable.id, targets.rows.map((row) => row.target_entity_id)));
  assert(entityRows.every((row) => row.status === "deleted" && row.deletedAt));
  assert.equal((await clientB.request(`/api/connectors/connections/${connectionId}`)).status, 404);
  for (const target of targets.rows) assert.equal((await clientB.request(`/api/library/items/${target.target_library_item_id}`)).status, 404);
});

test("delete revocation preserves a correction made before the next reconciliation", async () => {
  const { fakeGoogleCalendarProvider } = await import("./fake-google-calendar-provider");
  fakeGoogleCalendarProvider.reset();
  const clientA = await login(adultA.email);
  const clientB = await login(adultB.email);
  const connectionId = await authorizeSelectConsentAndSync(clientA);
  const targets = await admin.pool.query<{ external_object_id: string; source_object_id: string; target_library_item_id: number }>(`
    select source.external_object_id, source.id as source_object_id, mapping.target_library_item_id
    from connector_source_objects source
    join connector_source_mappings mapping on mapping.source_object_id = source.id
    where source.connection_id = $1
    order by source.external_object_id
  `, [connectionId]);
  const corrected = targets.rows.find((row) => row.external_object_id === "fake-event-correctable")!;
  const eligible = targets.rows.find((row) => row.external_object_id === "fake-event-delete-me")!;
  assert.equal((await clientA.request(`/api/library/items/${corrected.target_library_item_id}`, {
    method: "PATCH",
    body: JSON.stringify({ title: "Immediate owner correction" }),
  })).status, 200);

  assert.equal((await clientA.request(`/api/connectors/connections/${connectionId}/revoke`, {
    method: "POST",
    body: JSON.stringify({ disposition: "delete" }),
  })).status, 200);
  const preserved = await admin.pool.query<{ title: string; status: string }>("select title, status from library_items where id = $1", [corrected.target_library_item_id]);
  assert.deepEqual(preserved.rows, [{ title: "Immediate owner correction", status: "active" }]);
  const detached = await admin.pool.query<{ state: string; user_overrides: Record<string, boolean> }>("select state, user_overrides from connector_source_mappings where source_object_id = $1", [corrected.source_object_id]);
  assert.equal(detached.rows[0]?.state, "detached");
  assert.equal(detached.rows[0]?.user_overrides.title, true);
  assert.equal((await admin.pool.query("select count(*)::int as count from connector_source_objects where id = $1", [corrected.source_object_id])).rows[0].count, 1);
  assert.equal((await admin.pool.query("select status from library_items where id = $1", [eligible.target_library_item_id])).rows[0].status, "deleted");
  assert.equal((await clientB.request(`/api/library/items/${corrected.target_library_item_id}`)).status, 404);
});
});

async function authorizeSelectConsentAndSync(client: TestClient): Promise<string> {
  const state = await beginAuthorization(client);
  const callback = await client.request(`/api/connectors/google-calendar/oauth/callback?state=${encodeURIComponent(state)}&code=fake-approved-code`, { redirect: "manual" });
  assert.equal(callback.status, 303);
  assert(callback.headers.get("location")?.includes("oauth=authorized"));
  const replay = await client.request(`/api/connectors/google-calendar/oauth/callback?state=${encodeURIComponent(state)}&code=fake-approved-code`, { redirect: "manual" });
  assert.equal(replay.status, 303);
  assert(replay.headers.get("location")?.includes("oauth=error"));
  const connections = await client.request("/api/connectors/connections");
  const connection = (connections.body as Array<{ id: string; state: string }>).find((row) => row.state === "pending_authorization");
  assert(connection);
  const discovered = await client.request(`/api/connectors/connections/${connection.id}/discover`, { method: "POST" });
  assert.equal(discovered.status, 200);
  const calendars = discovered.body as Array<{ providerResourceId: string; displayName: string; selected: boolean }>;
  assert.equal(calendars.length, 2);
  assert(calendars.every((calendar) => !calendar.selected));
  const personal = calendars.find((calendar) => calendar.displayName === "Personal")!;
  const selected = await client.request(`/api/connectors/connections/${connection.id}/resources`, {
    method: "PUT",
    body: JSON.stringify({ resourceIds: [personal.providerResourceId] }),
  });
  assert.equal(selected.status, 200);
  assert.deepEqual((selected.body as Array<{ displayName: string; selected: boolean }>).filter((row) => row.selected).map((row) => row.displayName), ["Personal"]);
  const consent = await client.request(`/api/connectors/connections/${connection.id}/consent`, {
    method: "POST",
    body: JSON.stringify({
      confirmed: true,
      purpose: "Import selected calendar events into my private Lighthouse records.",
      consentTextVersion: "google-calendar-consent.v1",
    }),
  });
  assert.equal(consent.status, 201);
  const sync = await client.request(`/api/connectors/connections/${connection.id}/sync`, { method: "POST" });
  assert.equal(sync.status, 202, sync.text);
  assert.equal((sync.body as { createdCount: number }).createdCount, 2);
  return connection.id;
}

async function beginAuthorization(client: TestClient): Promise<string> {
  const begin = await client.request("/api/connectors/google-calendar/authorize", { method: "POST", body: JSON.stringify({ redirectPath: "/connectors" }) });
  assert.equal(begin.status, 201);
  const state = new URL((begin.body as { authorizationUrl: string }).authorizationUrl).searchParams.get("state");
  assert(state);
  return state;
}

async function login(email: string): Promise<TestClient> {
  const client = createClient();
  const response = await client.request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password: "CorrectHorseBattery1!" }) });
  assert.equal(response.status, 200);
  return client;
}

function createClient(): TestClient {
  let cookie = "";
  return {
    async request(path, init = {}) {
      const headers = new Headers(init.headers);
      if (init.body !== undefined) headers.set("content-type", "application/json");
      if (cookie) headers.set("cookie", cookie);
      const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";")[0] ?? cookie;
      const text = await response.text();
      let body: unknown = text;
      if (text && response.headers.get("content-type")?.includes("json")) body = JSON.parse(text);
      if (!text) body = null;
      return { status: response.status, body, text, headers: response.headers };
    },
  };
}

function newPassportId(): string {
  return `lhp_${randomBytes(16).toString("hex")}`;
}

function isPermissionDenied(error: unknown): boolean {
  let current = error;
  const seen = new Set<object>();
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if ("code" in current && current.code === "42501") return true;
    current = "cause" in current ? current.cause : null;
  }
  assert.fail("Expected PostgreSQL permission error 42501");
}
