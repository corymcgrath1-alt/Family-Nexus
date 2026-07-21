import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import { eq } from "drizzle-orm";

const runtimeDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://lighthouse_test_app:lighthouse_test_app_password@127.0.0.1:55432/lighthouse_test";
const migrationDatabaseUrl =
  process.env.TEST_DATABASE_MIGRATION_URL ??
  process.env.DATABASE_MIGRATION_URL ??
  "postgres://lighthouse_test:lighthouse_test_password@127.0.0.1:55432/lighthouse_test";
process.env.DATABASE_URL = runtimeDatabaseUrl;
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET ??= "integration-test-session-secret";
process.env.LOG_LEVEL ??= "silent";

const password = "CorrectHorseBattery1!";

type DbModule = typeof import("@workspace/db");
type BcryptModule = typeof import("bcryptjs");
type DatabaseInstance = ReturnType<DbModule["createDatabase"]>;
type DatabaseClient = DatabaseInstance["db"];
type LibraryItemRow = DbModule["libraryItemsTable"]["$inferSelect"];
type UserRow = DbModule["usersTable"]["$inferSelect"];

type FixtureState = {
  adultA: UserRow;
  adultB: UserRow;
  adultC: UserRow;
  outsider: UserRow;
  aPrivate: LibraryItemRow;
  bPrivate: LibraryItemRow;
  aSharedFixture: LibraryItemRow;
  householdItem: LibraryItemRow;
  expiredGrantItem: LibraryItemRow;
  revokedGrantItem: LibraryItemRow;
  malformedGrantItem: LibraryItemRow;
  cGrantItem: LibraryItemRow;
  archivableItem: LibraryItemRow;
  deletableItem: LibraryItemRow;
};

type TestClient = {
  request: (
    path: string,
    init?: RequestInit,
  ) => Promise<{ status: number; body: unknown; text: string }>;
};

type InsightResponseFixture = {
  coverage: {
    rowLimitApplied: boolean;
    exactForDatabaseSnapshot: boolean;
  };
  metrics: {
    visibleItems: { value: number };
    ownedItems: { value: number };
    sharedWithMe: { value: number };
    householdItems: { value: number };
    archivedItems: { value: number };
    byCategory: { values: Record<string, number> };
    bySensitivity: { values: Record<string, number> };
  };
};

let server: Server;
let baseUrl = "";
let dbModule: DbModule;
let migrationDatabase: DatabaseInstance;
let fixtures: FixtureState;

before(async () => {
  dbModule = await import("@workspace/db");
  migrationDatabase = dbModule.createDatabase(migrationDatabaseUrl);
  await assertSchema(dbModule, migrationDatabase);
  fixtures = await seedFixtures(
    dbModule,
    migrationDatabase.db,
    await import("bcryptjs"),
  );
  await dbModule.assertRestrictedRuntimeDatabase();

  const { default: app } = await import("../app");
  server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert(address && typeof address === "object");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await Promise.all([dbModule.pool.end(), migrationDatabase.pool.end()]);
});

test("migration creates the schema constraints required by the privacy slice", async () => {
  await assertSchema(dbModule, migrationDatabase);
});

test("migration 0003 backfills a non-empty legacy definition registry", async () => {
  const migrationSql = await readFile(
    new URL(
      "../../../../lib/db/migrations/0003_library_insights.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const client = await migrationDatabase.pool.connect();
  try {
    await client.query("begin");
    await client.query("create schema insight_migration_legacy");
    await client.query("set local search_path to insight_migration_legacy");
    await client.query(`
      create table signal_definitions (
        id serial primary key,
        name text not null,
        domain text not null,
        unit text not null,
        time_window text not null,
        formula_version text not null,
        definition text not null,
        input_requirements jsonb not null default '{}'::jsonb,
        allowed_uses jsonb not null default '[]'::jsonb,
        prohibited_uses jsonb not null default '[]'::jsonb,
        sensitivity text not null default 'personal',
        created_at timestamp with time zone not null default now(),
        updated_at timestamp with time zone not null default now()
      )
    `);
    await client.query(`
      insert into signal_definitions (
        name, domain, unit, time_window, formula_version, definition
      ) values (
        'Legacy definition', 'legacy', 'items', 'unknown', 'v0',
        'Definition present before governed metadata existed.'
      )
    `);
    await client.query(migrationSql);

    const rows = await client.query<{
      definition_key: string;
      status: string;
      disabled_at: Date | null;
    }>(
      "select definition_key, status, disabled_at from signal_definitions order by definition_key",
    );
    assert.equal(rows.rows.length, 8);
    const legacy = rows.rows.find((row) =>
      row.definition_key.startsWith("legacy."),
    );
    assert(legacy);
    assert.match(legacy.definition_key, /^legacy\.[a-f0-9]{32}$/);
    assert.equal(legacy.status, "disabled");
    assert(legacy.disabled_at instanceof Date);
    assert.equal(rows.rows.filter((row) => row.status === "active").length, 7);
    await client.query("rollback");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
});

test("restricted runtime RLS fails closed and isolates person-owned rows", async () => {
  await dbModule.assertRestrictedRuntimeDatabase();

  const authority = await dbModule.pool.query<{
    role_name: string;
    is_superuser: boolean;
    bypasses_rls: boolean;
    is_runtime_member: boolean;
  }>(
    `select
       current_user as role_name,
       role_row.rolsuper as is_superuser,
       role_row.rolbypassrls as bypasses_rls,
       pg_has_role(current_user, 'lighthouse_runtime', 'member') as is_runtime_member
     from pg_roles role_row
     where role_row.rolname = current_user`,
  );
  assert.equal(authority.rows.length, 1);
  assert.equal(authority.rows[0].is_superuser, false);
  assert.equal(authority.rows[0].bypasses_rls, false);
  assert.equal(authority.rows[0].is_runtime_member, true);

  const protectedTables = [
    "audit_events",
    "consent_grants",
    "data_records",
    "data_sources",
    "library_items",
    "personal_vaults",
    "shared_spaces",
    "sharing_grants",
    "signal_observations",
  ];
  for (const tableName of protectedTables) {
    const rows = await dbModule.pool.query<{ count: number }>(
      `select count(*)::int as count from ${tableName}`,
    );
    assert.equal(
      rows.rows[0].count,
      0,
      `${tableName} must return no rows without actor context`,
    );
  }

  await assert.rejects(
    dbModule.pool.query(
      "insert into personal_vaults (household_id, owner_user_id) values ($1, $2)",
      [fixtures.adultA.householdId, fixtures.adultA.id],
    ),
    isRowSecurityError,
  );

  await assert.rejects(
    dbModule.pool.query(
      `insert into library_items (
         household_id, owner_user_id, subject_user_id, owner_kind, visibility, category,
         title, source_type, sensitivity, retention_policy, created_by_id, updated_by_id
       ) values ($1, $2, $2, 'person', 'private', 'note', 'missing context', 'import',
         'personal', 'keep-until-archived', $2, $2)`,
      [fixtures.adultA.householdId, fixtures.adultA.id],
    ),
    isRowSecurityError,
  );

  await dbModule.withDatabaseActor(
    { userId: fixtures.adultA.id, householdId: fixtures.adultA.householdId },
    async () => {
      const items = await dbModule.db.select().from(dbModule.libraryItemsTable);
      assert(items.some((item) => item.id === fixtures.aPrivate.id));
      assert(items.some((item) => item.id === fixtures.householdItem.id));
      assert(!items.some((item) => item.id === fixtures.bPrivate.id));

      assert.equal(
        (await dbModule.db.select().from(dbModule.personalVaultsTable)).length,
        1,
      );
      assert.equal(
        (await dbModule.db.select().from(dbModule.dataSourcesTable)).length,
        1,
      );
      assert.equal(
        (await dbModule.db.select().from(dbModule.dataRecordsTable)).length,
        1,
      );
      assert.equal(
        (await dbModule.db.select().from(dbModule.consentGrantsTable)).length,
        1,
      );
      assert.equal(
        (await dbModule.db.select().from(dbModule.signalObservationsTable))
          .length,
        0,
      );
    },
  );

  await dbModule.withDatabaseActor(
    { userId: fixtures.adultB.id, householdId: fixtures.adultB.householdId },
    async () => {
      const items = await dbModule.db.select().from(dbModule.libraryItemsTable);
      const itemIds = items.map((item) => item.id);
      assert(itemIds.includes(fixtures.bPrivate.id));
      assert(itemIds.includes(fixtures.aSharedFixture.id));
      assert(itemIds.includes(fixtures.householdItem.id));
      assert(!itemIds.includes(fixtures.aPrivate.id));
      assert(!itemIds.includes(fixtures.expiredGrantItem.id));
      assert(!itemIds.includes(fixtures.revokedGrantItem.id));
      assert(!itemIds.includes(fixtures.malformedGrantItem.id));
      assert(!itemIds.includes(fixtures.cGrantItem.id));

      assert.equal(
        (await dbModule.db.select().from(dbModule.personalVaultsTable)).length,
        0,
      );
      assert.equal(
        (await dbModule.db.select().from(dbModule.dataSourcesTable)).length,
        0,
      );
      assert.equal(
        (await dbModule.db.select().from(dbModule.dataRecordsTable)).length,
        0,
      );
      assert.equal(
        (await dbModule.db.select().from(dbModule.consentGrantsTable)).length,
        0,
      );
      assert.equal(
        (await dbModule.db.select().from(dbModule.signalObservationsTable))
          .length,
        0,
      );

      const spaces = await dbModule.db
        .select()
        .from(dbModule.sharedSpacesTable);
      assert.deepEqual(
        spaces.map((space) => space.householdId),
        [fixtures.adultB.householdId],
      );
      const deniedSpaceUpdate = await dbModule.db
        .update(dbModule.sharedSpacesTable)
        .set({ name: "unauthorized" })
        .returning({ id: dbModule.sharedSpacesTable.id });
      assert.deepEqual(deniedSpaceUpdate, []);

      const grants = await dbModule.db
        .select()
        .from(dbModule.sharingGrantsTable);
      assert.deepEqual(
        grants.map((grant) => grant.resourceId),
        [fixtures.aSharedFixture.id],
      );

      const auditEvents = await dbModule.db
        .select()
        .from(dbModule.auditEventsTable);
      assert(
        !auditEvents.some((event) => event.targetId === fixtures.aPrivate.id),
      );
      assert(
        !auditEvents.some(
          (event) => event.targetId === fixtures.aSharedFixture.id,
        ),
      );
      assert(
        auditEvents.some(
          (event) => event.targetId === fixtures.householdItem.id,
        ),
      );

      const deniedUpdate = await dbModule.db
        .update(dbModule.libraryItemsTable)
        .set({ body: "RLS_BYPASS_ATTEMPT" })
        .where(eq(dbModule.libraryItemsTable.id, fixtures.aPrivate.id))
        .returning({ id: dbModule.libraryItemsTable.id });
      assert.deepEqual(deniedUpdate, []);
    },
  );

  await assert.rejects(
    dbModule.withDatabaseActor(
      { userId: fixtures.adultB.id, householdId: fixtures.adultB.householdId },
      () =>
        dbModule.db.insert(dbModule.dataSourcesTable).values({
          householdId: fixtures.adultA.householdId,
          ownerUserId: fixtures.adultA.id,
          provider: "unauthorized",
          connectorMode: "manual",
        }),
    ),
    isRowSecurityError,
  );

  await assert.rejects(
    dbModule.withDatabaseActor(
      { userId: fixtures.adultB.id, householdId: fixtures.adultB.householdId },
      () =>
        dbModule.db.insert(dbModule.sharingGrantsTable).values({
          householdId: fixtures.adultB.householdId,
          resourceType: "library_item",
          resourceId: fixtures.aPrivate.id,
          grantorUserId: fixtures.adultB.id,
          granteeUserId: fixtures.adultC.id,
          permission: "read",
          purpose: "unauthorized_escalation",
        }),
    ),
    isRowSecurityError,
  );

  const referenceRows = await dbModule.db
    .select()
    .from(dbModule.signalDefinitionsTable);
  assert.equal(referenceRows.length, 7);
  await assert.rejects(
    dbModule.db.insert(dbModule.signalDefinitionsTable).values({
      definitionKey: "unauthorized.definition",
      name: "Unauthorized definition",
      domain: "test",
      unit: "count",
      timeWindow: "point-in-time",
      formulaVersion: "v1",
      definition: "Runtime roles cannot mutate global definitions.",
      inputRequirements: {},
      evidenceKind: "deterministic_derived_metric",
      outputShape: { kind: "scalar_count" },
      missingDataSemantics: {},
      baselineSemantics: {},
      evidenceThreshold: {},
      uncertaintySemantics: {},
      allowedUses: [],
      prohibitedUses: [],
      ownerScope: "requesting_user",
      defaultVisibility: "private",
      explanation: "Unauthorized definition",
      status: "active",
    }),
    isRowSecurityError,
  );
  await assert.rejects(
    dbModule.db
      .update(dbModule.signalDefinitionsTable)
      .set({ name: "Unauthorized update" })
      .where(eq(dbModule.signalDefinitionsTable.id, referenceRows[0].id)),
    isRowSecurityError,
  );
  await assert.rejects(
    dbModule.db
      .delete(dbModule.signalDefinitionsTable)
      .where(eq(dbModule.signalDefinitionsTable.id, referenceRows[0].id)),
    isRowSecurityError,
  );
});

test("connector catalog is authenticated, deterministic, and non-activating", async () => {
  const anonymous = createClient();
  assert.equal(
    (await anonymous.request("/api/connectors/catalog")).status,
    401,
  );
  assert.equal(
    (await anonymous.request("/api/connectors/catalog/manual-family-library"))
      .status,
    401,
  );

  const adultA = await login(fixtures.adultA.email);
  const list = await adultA.request("/api/connectors/catalog");
  assert.equal(list.status, 200);
  const payload = list.body as {
    catalogVersion: string;
    connectors: Array<Record<string, unknown> & { id: string; status: string }>;
  };
  assert.equal(payload.catalogVersion, "connector-catalog.v1");
  assert.deepEqual(
    payload.connectors.map((connector) => connector.id),
    [
      "accessibility-scraping",
      "adult-device-mdm",
      "android-usage-stats",
      "apple-healthkit",
      "apple-screen-time",
      "google-data-portability",
      "manual-family-library",
      "social-media-portability",
    ],
  );
  assert.deepEqual(
    payload.connectors
      .filter((connector) => connector.status === "available")
      .map((connector) => connector.id),
    ["manual-family-library"],
  );
  for (const connector of payload.connectors) {
    assert.equal("activationUrl" in connector, false);
    assert.equal("enabled" in connector, false);
    assert.equal("credentials" in connector, false);
  }

  const detail = await adultA.request(
    "/api/connectors/catalog/manual-family-library",
  );
  assert.equal(detail.status, 200);
  assert.equal(
    (detail.body as { connector: { id: string } }).connector.id,
    "manual-family-library",
  );
  const missing = await adultA.request(
    "/api/connectors/catalog/not-registered",
  );
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.body, { error: "Not found" });
});

test("governed insight definitions are authenticated, ordered, strict, and write-free", async () => {
  const anonymous = createClient();
  assert.equal(
    (await anonymous.request("/api/insights/definitions")).status,
    401,
  );
  assert.equal((await anonymous.request("/api/insights/library")).status, 401);

  const before = await protectedRowCounts(migrationDatabase);
  const adultA = await login(fixtures.adultA.email);
  const response = await adultA.request("/api/insights/definitions");
  assert.equal(response.status, 200);

  const { ListLibraryInsightDefinitionsResponse } =
    await import("@workspace/api-zod");
  assert.equal(
    ListLibraryInsightDefinitionsResponse.safeParse(response.body).success,
    true,
  );
  const payload = response.body as {
    catalogVersion: string;
    definitions: Array<{
      definitionKey: string;
      formulaVersion: string;
      evidenceKind: string;
      ownerScope: string;
      defaultVisibility: string;
      allowedUses: string[];
      prohibitedUses: string[];
      uncertaintySemantics: {
        calculation: string;
        sourceCompleteness: string;
      };
    }>;
  };
  assert.equal(payload.catalogVersion, "library-insights.v1");
  assert.deepEqual(
    payload.definitions.map((definition) => definition.definitionKey),
    [
      "library.archived_items.count",
      "library.household_items.count",
      "library.items_by_category.count",
      "library.items_by_sensitivity.count",
      "library.owned_items.count",
      "library.shared_with_me.count",
      "library.visible_items.count",
    ],
  );
  for (const definition of payload.definitions) {
    assert.equal(definition.formulaVersion, "v1");
    assert.equal(definition.evidenceKind, "deterministic_derived_metric");
    assert.equal(definition.ownerScope, "requesting_user");
    assert.equal(definition.defaultVisibility, "private");
    assert(definition.allowedUses.length > 0);
    assert(
      definition.prohibitedUses.some((use) => /comparing adults/i.test(use)),
    );
    assert(definition.prohibitedUses.some((use) => /eligibility/i.test(use)));
    assert.equal(definition.uncertaintySemantics.calculation, "none");
    assert.equal(
      definition.uncertaintySemantics.sourceCompleteness,
      "unknown_user_controlled",
    );
  }
  assert.deepEqual(await protectedRowCounts(migrationDatabase), before);

  const key = "library.visible_items.count";
  await migrationDatabase.db
    .update(dbModule.signalDefinitionsTable)
    .set({ ownerScope: "malformed_household_scope" })
    .where(eq(dbModule.signalDefinitionsTable.definitionKey, key));
  try {
    const malformed = await adultA.request("/api/insights/definitions");
    assert.equal(malformed.status, 500);
    assert.deepEqual(malformed.body, { error: "Insights are unavailable" });
  } finally {
    await migrationDatabase.db
      .update(dbModule.signalDefinitionsTable)
      .set({ ownerScope: "requesting_user" })
      .where(eq(dbModule.signalDefinitionsTable.definitionKey, key));
  }
});

test("manual JSON import creates one actor-owned private copy without restoring authority", async () => {
  const adultA = await login(fixtures.adultA.email);
  const adultB = await login(fixtures.adultB.email);
  const importTitle = "IMPORTED_PRIVATE_TITLE_ECHO";
  const importBody = "IMPORTED_PRIVATE_BODY_ECHO";
  const sourceLabel = "IMPORTED_PRIVATE_SOURCE_ECHO";
  const provenanceNote = "  safe provenance\u0000 note  ";
  const document = {
    connectorId: "manual-family-library",
    formatVersion: "library-item.v1",
    exportedAt: "2026-01-02T03:04:05.000Z",
    item: {
      id: fixtures.aPrivate.id,
      householdId: fixtures.adultB.householdId + 999,
      ownerUserId: fixtures.adultB.id,
      subjectUserId: fixtures.adultB.id,
      ownerKind: "household",
      visibility: "shared",
      category: "instruction",
      title: importTitle,
      body: importBody,
      sourceType: "web",
      sourceLabel,
      provenance: {
        note: provenanceNote,
        recordedByUserId: fixtures.adultB.id,
        correctedByUserId: fixtures.adultB.id,
        correctedAt: "2026-01-02T03:04:05.000Z",
      },
      effectiveDate: "2026-01-02",
      sensitivity: "sensitive",
      retentionPolicy: "delete-after-date",
      retentionDeleteAfter: "2027-01-02",
      allowedPurposes: ["share", "profile"],
      status: "deleted",
      version: 99,
      createdById: fixtures.adultB.id,
      updatedById: fixtures.adultB.id,
      archivedAt: "2026-01-02T03:04:05.000Z",
      deletedAt: "2026-01-03T03:04:05.000Z",
      createdAt: "2026-01-01T03:04:05.000Z",
      updatedAt: "2026-01-03T03:04:05.000Z",
      grants: [
        {
          id: 987654,
          granteeUserId: fixtures.adultB.id,
          permission: "owner",
          purpose: "import_escalation",
          createdAt: "2026-01-02T03:04:05.000Z",
          revokedAt: null,
          expiresAt: null,
        },
      ],
    },
  };

  const anonymous = createClient();
  const unauthenticatedPreview = await anonymous.request(
    "/api/library/import/preview",
    {
      method: "POST",
      body: JSON.stringify(document),
    },
  );
  assert.equal(unauthenticatedPreview.status, 401);

  const before = await migrationDatabase.pool.query<{
    item_count: number;
    grant_count: number;
    audit_count: number;
  }>(`select
      (select count(*)::int from library_items) as item_count,
      (select count(*)::int from sharing_grants) as grant_count,
      (select count(*)::int from audit_events) as audit_count`);

  const preview = await adultA.request("/api/library/import/preview", {
    method: "POST",
    body: JSON.stringify(document),
  });
  assert.equal(preview.status, 200);
  const previewBody = preview.body as {
    candidate: Record<string, unknown>;
    warnings: Array<{ code: string; fields: string[] }>;
  };
  assert.equal(previewBody.candidate.title, importTitle);
  assert.equal(previewBody.candidate.visibility, "private");
  assert.equal(previewBody.candidate.status, "active");
  assert.equal(previewBody.candidate.sourceType, "import");
  assert.equal(previewBody.candidate.provenanceNote, "safe provenance note");
  assert.equal("id" in previewBody.candidate, false);
  assert(
    previewBody.warnings.some(
      (warning) => warning.code === "sharing-not-restored",
    ),
  );
  assert(
    previewBody.warnings.some(
      (warning) => warning.code === "identifiers-not-preserved",
    ),
  );

  const afterPreview = await migrationDatabase.pool.query<{
    item_count: number;
    grant_count: number;
    audit_count: number;
  }>(`select
      (select count(*)::int from library_items) as item_count,
      (select count(*)::int from sharing_grants) as grant_count,
      (select count(*)::int from audit_events) as audit_count`);
  assert.deepEqual(afterPreview.rows[0], before.rows[0]);

  const unsupported = await adultA.request("/api/library/import/preview", {
    method: "POST",
    body: JSON.stringify({ ...document, formatVersion: "library-item.v999" }),
  });
  assert.equal(unsupported.status, 400);
  assert.match(
    (unsupported.body as { error: string }).error,
    /library-item\.v1/,
  );

  const unknownField = await adultA.request("/api/library/import/preview", {
    method: "POST",
    body: JSON.stringify({ ...document, unexpectedAuthority: true }),
  });
  assert.equal(unknownField.status, 400);

  const malformed = await adultA.request("/api/library/import/preview", {
    method: "POST",
    body: "{",
  });
  assert.equal(malformed.status, 400);
  assert.match((malformed.body as { error: string }).error, /valid JSON/);

  const oversized = await adultA.request("/api/library/import/preview", {
    method: "POST",
    body: JSON.stringify({
      formatVersion: "library-item.v1",
      item: { title: "x", body: "x".repeat(40_000) },
    }),
  });
  assert.equal(oversized.status, 413);

  for (const connectorId of ["apple-screen-time", "adult-device-mdm"]) {
    const deniedConnector = await adultA.request(
      "/api/library/import/preview",
      {
        method: "POST",
        body: JSON.stringify({ ...document, connectorId }),
      },
    );
    assert.equal(deniedConnector.status, 400);

    const deniedCommit = await adultA.request("/api/library/import", {
      method: "POST",
      body: JSON.stringify({
        confirmPrivateCopy: true,
        document: { ...document, connectorId },
      }),
    });
    assert.equal(deniedCommit.status, 400);
  }

  const unconfirmed = await adultA.request("/api/library/import", {
    method: "POST",
    body: JSON.stringify({ confirmPrivateCopy: false, document }),
  });
  assert.equal(unconfirmed.status, 400);

  const committed = await adultA.request("/api/library/import", {
    method: "POST",
    body: JSON.stringify({ confirmPrivateCopy: true, document }),
  });
  assert.equal(committed.status, 201);
  const created = committed.body as LibraryItemRow & {
    grants: unknown[];
    provenance: Record<string, unknown>;
  };
  assert.notEqual(created.id, fixtures.aPrivate.id);
  assert.equal(created.householdId, fixtures.adultA.householdId);
  assert.equal(created.ownerUserId, fixtures.adultA.id);
  assert.equal(created.subjectUserId, fixtures.adultA.id);
  assert.equal(created.createdById, fixtures.adultA.id);
  assert.equal(created.updatedById, fixtures.adultA.id);
  assert.equal(created.visibility, "private");
  assert.equal(created.status, "active");
  assert.equal(created.sourceType, "import");
  assert.equal(created.version, 1);
  assert.equal(created.archivedAt, null);
  assert.equal(created.deletedAt, null);
  assert.deepEqual(created.grants, []);
  assert.equal(created.provenance.connectorId, "manual-family-library");
  assert.equal(created.provenance.originalFormatVersion, "library-item.v1");
  assert.equal(created.provenance.originalSourceLabel, sourceLabel);
  assert.equal(created.provenance.note, "safe provenance note");

  const rows = await migrationDatabase.pool.query<{
    item_count: number;
    total_item_count: number;
    grant_count: number;
    event_type: string;
    summary: string;
    metadata: Record<string, unknown>;
  }>(
    `select
      (select count(*)::int from library_items where title = $1) as item_count,
      (select count(*)::int from library_items) as total_item_count,
      (select count(*)::int from sharing_grants where resource_type = 'library_item' and resource_id = $2) as grant_count,
      event_type,
      summary,
      metadata
    from audit_events
    where target_type = 'library_item' and target_id = $2 and event_type = 'imported'`,
    [importTitle, created.id],
  );
  assert.equal(rows.rows.length, 1);
  assert.equal(rows.rows[0].item_count, 1);
  assert.equal(rows.rows[0].total_item_count, before.rows[0].item_count + 1);
  assert.equal(rows.rows[0].grant_count, 0);
  assert.equal(rows.rows[0].event_type, "imported");
  assert.equal(rows.rows[0].summary, "Library item imported");
  assertNoTokens(rows.rows[0].metadata, [
    importTitle,
    importBody,
    sourceLabel,
    provenanceNote,
  ]);
  assert.deepEqual(Object.keys(rows.rows[0].metadata).sort(), [
    "connectorId",
    "formatVersion",
    "sensitivity",
    "visibility",
  ]);

  const ownerSearch = await adultA.request(
    `/api/library/items?q=${encodeURIComponent(importTitle)}`,
  );
  assert.equal(ownerSearch.status, 200);
  assertIncludesToken(ownerSearch.body, importTitle);
  await assertNoLeakFromListSearchOrStats(adultB, importTitle, importBody);
  await assertDenied(adultB, `/api/library/items/${created.id}`);
});

test("exact Library insights preserve RLS parity, revocation, dimensions, and write-free reads", async () => {
  const bcryptModule = await import("bcryptjs");
  const bcrypt = bcryptModule.default ?? bcryptModule;
  const passwordHash = await bcrypt.hash(password, 4);
  const [household] = await migrationDatabase.db
    .insert(dbModule.householdsTable)
    .values({ name: "Insight Test Household" })
    .returning();
  const [otherHousehold] = await migrationDatabase.db
    .insert(dbModule.householdsTable)
    .values({ name: "Insight Outside Household" })
    .returning();

  async function createInsightUser(
    householdId: number,
    displayName: string,
    email: string,
  ) {
    const [user] = await migrationDatabase.db
      .insert(dbModule.usersTable)
      .values({
        householdId,
        lighthousePassportId: newPassportId(),
        email,
        passwordHash,
        displayName,
        role: "adult",
        avatarInitials: displayName
          .split(/\s+/)
          .map((part) => part[0])
          .join("")
          .toUpperCase(),
        color: "#35605A",
      })
      .returning();
    return user;
  }

  const adultA = await createInsightUser(
    household.id,
    "Insight Adult A",
    "insight.adult.a@example.test",
  );
  const adultB = await createInsightUser(
    household.id,
    "Insight Adult B",
    "insight.adult.b@example.test",
  );
  const outsider = await createInsightUser(
    otherHousehold.id,
    "Insight Outsider",
    "insight.outsider@example.test",
  );

  const aPrivate = await createItem(dbModule, migrationDatabase.db, adultA, {
    title: "INSIGHT_A_PRIVATE_MEDICAL_TITLE",
    body: "INSIGHT_A_PRIVATE_MEDICAL_BODY",
    category: "medical-reference",
    sensitivity: "restricted",
  });
  const aShared = await createItem(dbModule, migrationDatabase.db, adultA, {
    title: "INSIGHT_A_SHARED_INSTRUCTION_TITLE",
    body: "INSIGHT_A_SHARED_INSTRUCTION_BODY",
    visibility: "shared",
    category: "instruction",
    sensitivity: "sensitive",
  });
  await createItem(dbModule, migrationDatabase.db, adultA, {
    title: "INSIGHT_HOUSEHOLD_DECISION_TITLE",
    body: "INSIGHT_HOUSEHOLD_DECISION_BODY",
    visibility: "household",
    category: "decision",
    sensitivity: "standard",
  });
  await createItem(dbModule, migrationDatabase.db, adultA, {
    title: "INSIGHT_A_ARCHIVED_MEMORY_TITLE",
    body: "INSIGHT_A_ARCHIVED_MEMORY_BODY",
    category: "memory",
    sensitivity: "personal",
    status: "archived",
  });
  await createItem(dbModule, migrationDatabase.db, adultA, {
    title: "INSIGHT_A_DELETED_VEHICLE_TITLE",
    body: "INSIGHT_A_DELETED_VEHICLE_BODY",
    category: "vehicle-record",
    sensitivity: "restricted",
    status: "deleted",
  });
  await createItem(dbModule, migrationDatabase.db, adultB, {
    title: "INSIGHT_B_PRIVATE_NOTE_TITLE",
    body: "INSIGHT_B_PRIVATE_NOTE_BODY",
    category: "note",
    sensitivity: "personal",
  });
  await createItem(dbModule, migrationDatabase.db, adultB, {
    title: "INSIGHT_B_ARCHIVED_DOCUMENT_TITLE",
    body: "INSIGHT_B_ARCHIVED_DOCUMENT_BODY",
    category: "document-reference",
    sensitivity: "personal",
    status: "archived",
  });
  await createItem(dbModule, migrationDatabase.db, outsider, {
    title: "INSIGHT_OUTSIDER_CAREER_TITLE",
    body: "INSIGHT_OUTSIDER_CAREER_BODY",
    category: "career-record",
    sensitivity: "restricted",
  });

  const clientA = await login(adultA.email);
  const clientB = await login(adultB.email);
  const { GetLibraryInsightsResponse, GetLibraryStatsResponse } =
    await import("@workspace/api-zod");

  const beforeRead = await protectedRowCounts(migrationDatabase);
  const aResponse = await clientA.request("/api/insights/library");
  assert.equal(aResponse.status, 200);
  assert.equal(
    GetLibraryInsightsResponse.safeParse(aResponse.body).success,
    true,
  );
  const aInsights = aResponse.body as InsightResponseFixture;
  assertInsightScalars(aInsights, {
    visibleItems: 4,
    ownedItems: 4,
    sharedWithMe: 0,
    householdItems: 1,
    archivedItems: 1,
  });
  assert.equal(aInsights.metrics.byCategory.values["medical-reference"], 1);
  assert.equal(aInsights.metrics.byCategory.values.memory, 1);
  assert.equal(aInsights.metrics.byCategory.values["vehicle-record"], 0);
  assert.equal(aInsights.metrics.bySensitivity.values.restricted, 1);

  const bBeforeShareResponse = await clientB.request("/api/insights/library");
  assert.equal(bBeforeShareResponse.status, 200);
  const bBeforeShare = bBeforeShareResponse.body as InsightResponseFixture;
  assertInsightScalars(bBeforeShare, {
    visibleItems: 3,
    ownedItems: 2,
    sharedWithMe: 0,
    householdItems: 1,
    archivedItems: 1,
  });
  assert.equal(bBeforeShare.metrics.byCategory.values["medical-reference"], 0);
  assert.equal(bBeforeShare.metrics.byCategory.values.instruction, 0);
  assert.equal(bBeforeShare.metrics.bySensitivity.values.restricted, 0);
  assert.equal(bBeforeShare.metrics.bySensitivity.values.sensitive, 0);
  assert.deepEqual(await protectedRowCounts(migrationDatabase), beforeRead);

  const forbiddenTokens = [
    aPrivate.title,
    aPrivate.body!,
    aShared.title,
    aShared.body!,
    "Synthetic privacy fixture",
  ];
  assertNoTokens(bBeforeShare, forbiddenTokens);
  assertNoInsightContentFields(bBeforeShare);
  assert.deepEqual(Object.keys(bBeforeShare.metrics.byCategory.values), [
    "note",
    "document-reference",
    "instruction",
    "decision",
    "memory",
    "medical-reference",
    "household-record",
    "vehicle-record",
    "career-record",
    "other",
  ]);
  assert.deepEqual(Object.keys(bBeforeShare.metrics.bySensitivity.values), [
    "standard",
    "personal",
    "sensitive",
    "restricted",
  ]);

  const malformedResponse = structuredClone(
    bBeforeShare,
  ) as InsightResponseFixture;
  malformedResponse.metrics.visibleItems.value = -1;
  assert.equal(
    GetLibraryInsightsResponse.safeParse(malformedResponse).success,
    false,
  );

  const { calculateLibraryInsights } =
    await import("./library-insights-service");
  await assert.rejects(
    calculateLibraryInsights({ id: adultB.id, householdId: household.id }),
    /actor context is missing or mismatched/i,
  );

  const share = await clientA.request(
    `/api/library/items/${aShared.id}/share`,
    {
      method: "POST",
      body: JSON.stringify({
        granteeUserId: adultB.id,
        purpose: "insight_authorization_parity",
      }),
    },
  );
  assert.equal(share.status, 200);
  const grant = (
    share.body as { grants: Array<{ id: number; granteeUserId: number }> }
  ).grants.find((candidate) => candidate.granteeUserId === adultB.id);
  assert(grant);

  const bSharedResponse = await clientB.request("/api/insights/library");
  assert.equal(bSharedResponse.status, 200);
  const bShared = bSharedResponse.body as InsightResponseFixture;
  assertInsightScalars(bShared, {
    visibleItems: 4,
    ownedItems: 2,
    sharedWithMe: 1,
    householdItems: 1,
    archivedItems: 1,
  });
  assert.equal(bShared.metrics.byCategory.values.instruction, 1);
  assert.equal(bShared.metrics.bySensitivity.values.sensitive, 1);
  assertNoTokens(bShared, forbiddenTokens);

  const revoke = await clientA.request(
    `/api/library/items/${aShared.id}/revoke`,
    {
      method: "POST",
      body: JSON.stringify({ grantId: grant.id }),
    },
  );
  assert.equal(revoke.status, 200);
  const bRevokedResponse = await clientB.request("/api/insights/library");
  assert.equal(bRevokedResponse.status, 200);
  const bRevoked = bRevokedResponse.body as InsightResponseFixture;
  assertInsightScalars(bRevoked, {
    visibleItems: 3,
    ownedItems: 2,
    sharedWithMe: 0,
    householdItems: 1,
    archivedItems: 1,
  });
  assert.equal(bRevoked.metrics.byCategory.values.instruction, 0);
  assert.equal(bRevoked.metrics.bySensitivity.values.sensitive, 0);
  assertNoTokens(bRevoked, forbiddenTokens);

  const bulkRows = Array.from({ length: 505 }, (_, index) => ({
    householdId: household.id,
    ownerUserId: adultB.id,
    subjectUserId: adultB.id,
    ownerKind: "person",
    visibility: "private",
    category: "note",
    title: `INSIGHT_BULK_${index}`,
    body: null,
    sourceType: "manual",
    sourceLabel: null,
    provenance: { fixture: true },
    sensitivity: "personal",
    status: "active",
    createdById: adultB.id,
    updatedById: adultB.id,
  }));
  await migrationDatabase.db
    .insert(dbModule.libraryItemsTable)
    .values(bulkRows);

  const beforeLargeRead = await protectedRowCounts(migrationDatabase);
  const largeInsightsResponse = await clientB.request("/api/insights/library");
  assert.equal(largeInsightsResponse.status, 200);
  const largeInsights = largeInsightsResponse.body as InsightResponseFixture;
  assertInsightScalars(largeInsights, {
    visibleItems: 508,
    ownedItems: 507,
    sharedWithMe: 0,
    householdItems: 1,
    archivedItems: 1,
  });
  assert.equal(largeInsights.metrics.byCategory.values.note, 506);
  assert.equal(largeInsights.metrics.bySensitivity.values.personal, 507);
  assert.equal(largeInsights.coverage.rowLimitApplied, false);
  assert.equal(largeInsights.coverage.exactForDatabaseSnapshot, true);

  const legacyStats = await clientB.request("/api/library/stats");
  assert.equal(legacyStats.status, 200);
  assert.equal(
    GetLibraryStatsResponse.safeParse(legacyStats.body).success,
    true,
  );
  assert.deepEqual(legacyStats.body, {
    visibleItems: 508,
    ownedItems: 507,
    sharedWithMe: 0,
    householdItems: 1,
    byCategory: largeInsights.metrics.byCategory.values,
    bySensitivity: largeInsights.metrics.bySensitivity.values,
  });
  assert.deepEqual(
    await protectedRowCounts(migrationDatabase),
    beforeLargeRead,
  );
  assert.equal(beforeLargeRead.signal_observations, 0);
});

test("Adult B cannot infer Adult A private library records without an active read grant", async () => {
  const adultA = await login(fixtures.adultA.email);
  const adultB = await login(fixtures.adultB.email);
  const adultC = await login(fixtures.adultC.email);
  const outsider = await login(fixtures.outsider.email);

  await assertCanRead(adultA, fixtures.aPrivate, "A_PRIVATE_CONTENT_ALPHA");
  await assertCanRead(adultB, fixtures.bPrivate, "B_PRIVATE_CONTENT_BRAVO");

  const deniedKnown = await adultB.request(
    `/api/library/items/${fixtures.aPrivate.id}`,
  );
  const deniedRandom = await adultB.request("/api/library/items/99999999");
  assertEquivalentNotFound(deniedKnown, deniedRandom);

  await assertNoLeakFromListSearchOrStats(
    adultB,
    "A_PRIVATE_TITLE_ALPHA",
    "A_PRIVATE_CONTENT_ALPHA",
  );
  await assertNoLeakFromDirectOperations(
    adultB,
    fixtures.aPrivate.id,
    fixtures.adultC.id,
    ["A_PRIVATE_TITLE_ALPHA", "A_PRIVATE_CONTENT_ALPHA"],
  );

  const passportProbe = await adultB.request(
    `/api/library/items?ownerPassportId=${encodeURIComponent(fixtures.adultA.lighthousePassportId ?? "")}`,
  );
  assert.equal(passportProbe.status, 200);
  assertNoTokens(passportProbe.body, [
    fixtures.adultA.lighthousePassportId ?? "missing-passport",
    "A_PRIVATE_TITLE_ALPHA",
    "A_PRIVATE_CONTENT_ALPHA",
  ]);

  const members = await adultB.request("/api/family-members");
  assert.equal(members.status, 200);
  assertNoTokens(members.body, [
    fixtures.adultA.lighthousePassportId ?? "missing-passport",
  ]);

  await assertCanRead(
    adultB,
    fixtures.aSharedFixture,
    "A_SHARED_FIXTURE_CONTENT",
  );
  const sharedByFixture = await adultB.request(
    `/api/library/items/${fixtures.aSharedFixture.id}`,
  );
  assert.equal(sharedByFixture.status, 200);
  assert.equal(
    Array.isArray((sharedByFixture.body as { grants?: unknown[] }).grants),
    true,
  );
  assert.deepEqual((sharedByFixture.body as { grants: unknown[] }).grants, []);

  await assertDenied(
    adultC,
    `/api/library/items/${fixtures.aSharedFixture.id}`,
  );
  await assertDenied(
    outsider,
    `/api/library/items/${fixtures.aSharedFixture.id}`,
  );

  for (const item of [
    fixtures.expiredGrantItem,
    fixtures.revokedGrantItem,
    fixtures.malformedGrantItem,
    fixtures.cGrantItem,
  ]) {
    await assertDenied(adultB, `/api/library/items/${item.id}`);
  }

  await assertCanRead(
    adultB,
    fixtures.householdItem,
    "HOUSEHOLD_CONTENT_DELTA",
  );
  const householdAudit = await adultB.request(
    `/api/library/items/${fixtures.householdItem.id}/audit`,
  );
  assert.equal(householdAudit.status, 200);

  await assertOwnerMutationBoundaries(adultA, adultB);

  const share = await adultA.request(
    `/api/library/items/${fixtures.aPrivate.id}/share`,
    {
      method: "POST",
      body: JSON.stringify({
        granteeUserId: fixtures.adultB.id,
        purpose: "integration_share",
      }),
    },
  );
  assert.equal(share.status, 200);

  await assertCanRead(adultB, fixtures.aPrivate, "A_PRIVATE_CONTENT_ALPHA");
  const searchWhileShared = await adultB.request(
    "/api/library/items?q=A_PRIVATE_TITLE_ALPHA",
  );
  assert.equal(searchWhileShared.status, 200);
  assert.deepEqual(
    (searchWhileShared.body as Array<{ id: number }>).map((item) => item.id),
    [fixtures.aPrivate.id],
  );

  await assertNoLeakFromDirectOperations(
    adultB,
    fixtures.aPrivate.id,
    fixtures.adultC.id,
    ["A_PRIVATE_CONTENT_ALPHA"],
    { canRead: true },
  );

  const ownerAudit = await adultA.request(
    `/api/library/items/${fixtures.aPrivate.id}/audit`,
  );
  assert.equal(ownerAudit.status, 200);
  assertNoTokens(ownerAudit.body, [
    "A_PRIVATE_TITLE_ALPHA",
    "A_PRIVATE_CONTENT_ALPHA",
  ]);

  const ownerExport = await adultA.request(
    `/api/library/items/${fixtures.aPrivate.id}/export`,
  );
  assert.equal(ownerExport.status, 200);
  assertIncludesToken(ownerExport.body, "A_PRIVATE_CONTENT_ALPHA");

  const revoke = await adultA.request(
    `/api/library/items/${fixtures.aPrivate.id}/revoke`,
    {
      method: "POST",
      body: JSON.stringify({ granteeUserId: fixtures.adultB.id }),
    },
  );
  assert.equal(revoke.status, 200);

  const deniedAfterRevoke = await adultB.request(
    `/api/library/items/${fixtures.aPrivate.id}`,
  );
  const randomAfterRevoke = await adultB.request("/api/library/items/99999998");
  assertEquivalentNotFound(deniedAfterRevoke, randomAfterRevoke);
  await assertNoLeakFromListSearchOrStats(
    adultB,
    "A_PRIVATE_TITLE_ALPHA",
    "A_PRIVATE_CONTENT_ALPHA",
  );
  await assertCanRead(adultA, fixtures.aPrivate, "A_PRIVATE_CONTENT_ALPHA");

  const auditRows = await migrationDatabase.pool.query(
    "select summary, metadata::text as metadata from audit_events order by id",
  );
  for (const row of auditRows.rows as Array<{
    summary: string;
    metadata: string;
  }>) {
    assertNoTokens(row, [
      "A_PRIVATE_TITLE_ALPHA",
      "A_PRIVATE_CONTENT_ALPHA",
      "B_PRIVATE_CONTENT_BRAVO",
      "A_SHARED_FIXTURE_CONTENT",
    ]);
  }
});

async function assertSchema(dbm: DbModule, database: DatabaseInstance) {
  const expectedTables = [
    "session",
    "users",
    "households",
    "personal_vaults",
    "shared_spaces",
    "data_sources",
    "data_records",
    "consent_grants",
    "sharing_grants",
    "audit_events",
    "signal_definitions",
    "signal_observations",
    "library_items",
  ];
  const tableRows = await database.pool.query(
    "select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1)",
    [expectedTables],
  );
  assert.deepEqual(
    tableRows.rows.map((row: { table_name: string }) => row.table_name).sort(),
    [...expectedTables].sort(),
  );

  const indexRows = await database.pool.query(
    "select indexname from pg_indexes where schemaname = 'public' and indexname = any($1)",
    [
      [
        "users_lighthouse_passport_id_uq",
        "library_items_household_status_idx",
        "sharing_grants_resource_idx",
        "sharing_grants_grantee_idx",
        "audit_events_target_idx",
        "signal_definitions_key_version_uq",
      ],
    ],
  );
  assert.equal(indexRows.rows.length, 6);

  const nullability = await database.pool.query(
    `select table_name, column_name, is_nullable
     from information_schema.columns
     where table_schema = 'public'
       and (table_name, column_name) in (
         ('library_items', 'title'),
         ('library_items', 'body'),
         ('sharing_grants', 'grantee_user_id'),
         ('audit_events', 'metadata'),
         ('signal_definitions', 'definition_key'),
         ('signal_definitions', 'evidence_kind'),
         ('signal_definitions', 'output_shape'),
         ('signal_definitions', 'missing_data_semantics'),
         ('signal_definitions', 'baseline_semantics'),
         ('signal_definitions', 'evidence_threshold'),
         ('signal_definitions', 'uncertainty_semantics'),
         ('signal_definitions', 'owner_scope'),
         ('signal_definitions', 'default_visibility'),
         ('signal_definitions', 'explanation'),
         ('signal_definitions', 'status'),
         ('signal_definitions', 'disabled_at'),
         ('session', 'sid')
       )`,
  );
  const nullabilityByColumn = new Map(
    nullability.rows.map(
      (row: {
        table_name: string;
        column_name: string;
        is_nullable: string;
      }) => [`${row.table_name}.${row.column_name}`, row.is_nullable],
    ),
  );
  assert.equal(nullabilityByColumn.get("library_items.title"), "NO");
  assert.equal(nullabilityByColumn.get("library_items.body"), "YES");
  assert.equal(nullabilityByColumn.get("sharing_grants.grantee_user_id"), "NO");
  assert.equal(nullabilityByColumn.get("audit_events.metadata"), "NO");
  for (const column of [
    "definition_key",
    "evidence_kind",
    "output_shape",
    "missing_data_semantics",
    "baseline_semantics",
    "evidence_threshold",
    "uncertainty_semantics",
    "owner_scope",
    "default_visibility",
    "explanation",
    "status",
  ]) {
    assert.equal(nullabilityByColumn.get(`signal_definitions.${column}`), "NO");
  }
  assert.equal(
    nullabilityByColumn.get("signal_definitions.disabled_at"),
    "YES",
  );
  assert.equal(nullabilityByColumn.get("session.sid"), "NO");

  const definitions = await database.pool.query<{
    definition_key: string;
    formula_version: string;
    evidence_kind: string;
    owner_scope: string;
    default_visibility: string;
    status: string;
    disabled_at: Date | null;
  }>(`
    select
      definition_key,
      formula_version,
      evidence_kind,
      owner_scope,
      default_visibility,
      status,
      disabled_at
    from signal_definitions
    order by definition_key
  `);
  assert.deepEqual(
    definitions.rows.map((row) => row.definition_key),
    [
      "library.archived_items.count",
      "library.household_items.count",
      "library.items_by_category.count",
      "library.items_by_sensitivity.count",
      "library.owned_items.count",
      "library.shared_with_me.count",
      "library.visible_items.count",
    ],
  );
  for (const definition of definitions.rows) {
    assert.equal(definition.formula_version, "v1");
    assert.equal(definition.evidence_kind, "deterministic_derived_metric");
    assert.equal(definition.owner_scope, "requesting_user");
    assert.equal(definition.default_visibility, "private");
    assert.equal(definition.status, "active");
    assert.equal(definition.disabled_at, null);
  }

  const foreignKeys = await database.pool.query(
    `select count(*)::int as count
     from information_schema.table_constraints
     where table_schema = 'public'
       and constraint_type = 'FOREIGN KEY'
       and table_name = any($1)`,
    [["library_items", "sharing_grants", "audit_events"]],
  );
  assert.equal(foreignKeys.rows[0].count, 0);

  const protectedTables = [
    "audit_events",
    "consent_grants",
    "data_records",
    "data_sources",
    "library_items",
    "personal_vaults",
    "shared_spaces",
    "sharing_grants",
    "signal_observations",
  ];
  const rlsRows = await database.pool.query(
    `select table_row.relname as table_name, table_row.relrowsecurity as rls_enabled
     from pg_class table_row
     join pg_namespace schema_row on schema_row.oid = table_row.relnamespace
     where schema_row.nspname = 'public'
       and table_row.relname = any($1)`,
    [protectedTables],
  );
  assert.deepEqual(
    rlsRows.rows
      .filter((row: { rls_enabled: boolean }) => row.rls_enabled)
      .map((row: { table_name: string }) => row.table_name)
      .sort(),
    [...protectedTables].sort(),
  );

  const policyRows = await database.pool.query(
    `select distinct tablename
     from pg_policies
     where schemaname = 'public' and tablename = any($1)`,
    [protectedTables],
  );
  assert.deepEqual(
    policyRows.rows.map((row: { tablename: string }) => row.tablename).sort(),
    [...protectedTables].sort(),
  );

  const runtimeRole = await database.pool.query(
    `select rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls
     from pg_roles
     where rolname = 'lighthouse_runtime'`,
  );
  assert.deepEqual(runtimeRole.rows, [
    {
      rolcanlogin: false,
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolbypassrls: false,
    },
  ]);
}

async function seedFixtures(
  dbm: DbModule,
  database: DatabaseClient,
  bcryptModule: BcryptModule,
): Promise<FixtureState> {
  const bcrypt = bcryptModule.default ?? bcryptModule;
  const passwordHash = await bcrypt.hash(password, 4);

  const [household] = await database
    .insert(dbm.householdsTable)
    .values({ name: "Privacy Test Household" })
    .returning();
  const [otherHousehold] = await database
    .insert(dbm.householdsTable)
    .values({ name: "Outsider Household" })
    .returning();

  async function createUser(input: {
    householdId: number;
    displayName: string;
    email: string;
    color: string;
  }) {
    const [user] = await database
      .insert(dbm.usersTable)
      .values({
        householdId: input.householdId,
        lighthousePassportId: newPassportId(),
        email: input.email,
        passwordHash,
        displayName: input.displayName,
        role: "adult",
        avatarInitials: input.displayName
          .split(/\s+/)
          .map((part) => part[0])
          .join("")
          .toUpperCase(),
        color: input.color,
      })
      .returning();
    return user;
  }

  const adultA = await createUser({
    householdId: household.id,
    displayName: "Adult A",
    email: "adult.a.privacy@example.test",
    color: "#4A7C59",
  });
  const adultB = await createUser({
    householdId: household.id,
    displayName: "Adult B",
    email: "adult.b.privacy@example.test",
    color: "#2C6E8A",
  });
  const adultC = await createUser({
    householdId: household.id,
    displayName: "Adult C",
    email: "adult.c.privacy@example.test",
    color: "#7B5EA7",
  });
  const outsider = await createUser({
    householdId: otherHousehold.id,
    displayName: "Outside Adult",
    email: "outside.privacy@example.test",
    color: "#8B5E3C",
  });

  await database.insert(dbm.sharedSpacesTable).values([
    {
      householdId: household.id,
      name: "Privacy Test Household Space",
      createdById: adultA.id,
    },
    {
      householdId: otherHousehold.id,
      name: "Outsider Household Space",
      createdById: outsider.id,
    },
  ]);

  await database.insert(dbm.personalVaultsTable).values({
    householdId: household.id,
    ownerUserId: adultA.id,
    lighthousePassportId: adultA.lighthousePassportId,
  });
  const [source] = await database
    .insert(dbm.dataSourcesTable)
    .values({
      householdId: household.id,
      ownerUserId: adultA.id,
      provider: "manual-fixture",
      connectorMode: "manual",
      dataCategories: ["family_library"],
      requiredScopes: [],
      allowedPurposes: ["remember"],
    })
    .returning();
  await database.insert(dbm.dataRecordsTable).values({
    householdId: household.id,
    ownerUserId: adultA.id,
    subjectUserId: adultA.id,
    sourceId: source.id,
    recordType: "family_library_fixture",
    provenance: { fixture: true },
    allowedPurposes: ["remember"],
  });
  await database.insert(dbm.consentGrantsTable).values({
    householdId: household.id,
    ownerUserId: adultA.id,
    subjectUserId: adultA.id,
    granteeUserId: adultB.id,
    dataCategory: "family_library",
    purpose: "fixture-share",
    allowedUse: "read",
    prohibitedUses: ["reshare", "train_model"],
  });
  const aPrivate = await createItem(dbm, database, adultA, {
    title: "A_PRIVATE_TITLE_ALPHA",
    body: "A_PRIVATE_CONTENT_ALPHA",
  });
  const bPrivate = await createItem(dbm, database, adultB, {
    title: "B_PRIVATE_TITLE_BRAVO",
    body: "B_PRIVATE_CONTENT_BRAVO",
  });
  const aSharedFixture = await createItem(dbm, database, adultA, {
    title: "A_SHARED_FIXTURE_TITLE",
    body: "A_SHARED_FIXTURE_CONTENT",
    visibility: "shared",
  });
  await createGrant(
    dbm,
    database,
    household.id,
    adultA.id,
    adultB.id,
    aSharedFixture.id,
    "read",
  );

  const householdItem = await createItem(dbm, database, adultA, {
    title: "HOUSEHOLD_TITLE_DELTA",
    body: "HOUSEHOLD_CONTENT_DELTA",
    visibility: "household",
    ownerKind: "household",
    subjectUserId: null,
  });

  const expiredGrantItem = await createItem(dbm, database, adultA, {
    title: "A_EXPIRED_GRANT_TITLE",
    body: "A_EXPIRED_GRANT_CONTENT",
    visibility: "shared",
  });
  await createGrant(
    dbm,
    database,
    household.id,
    adultA.id,
    adultB.id,
    expiredGrantItem.id,
    "read",
    {
      expiresAt: new Date(Date.now() - 60_000),
    },
  );

  const revokedGrantItem = await createItem(dbm, database, adultA, {
    title: "A_REVOKED_GRANT_TITLE",
    body: "A_REVOKED_GRANT_CONTENT",
    visibility: "shared",
  });
  await createGrant(
    dbm,
    database,
    household.id,
    adultA.id,
    adultB.id,
    revokedGrantItem.id,
    "read",
    {
      revokedAt: new Date(),
      revokedById: adultA.id,
    },
  );

  const malformedGrantItem = await createItem(dbm, database, adultA, {
    title: "A_MALFORMED_GRANT_TITLE",
    body: "A_MALFORMED_GRANT_CONTENT",
    visibility: "shared",
  });
  await createGrant(
    dbm,
    database,
    household.id,
    adultA.id,
    adultB.id,
    malformedGrantItem.id,
    "comment",
  );

  const cGrantItem = await createItem(dbm, database, adultA, {
    title: "A_C_ONLY_GRANT_TITLE",
    body: "A_C_ONLY_GRANT_CONTENT",
    visibility: "shared",
  });
  await createGrant(
    dbm,
    database,
    household.id,
    adultA.id,
    adultC.id,
    cGrantItem.id,
    "read",
  );

  const archivableItem = await createItem(dbm, database, adultA, {
    title: "A_ARCHIVABLE_TITLE",
    body: "A_ARCHIVABLE_CONTENT",
  });
  const deletableItem = await createItem(dbm, database, adultA, {
    title: "A_DELETABLE_TITLE",
    body: "A_DELETABLE_CONTENT",
  });

  return {
    adultA,
    adultB,
    adultC,
    outsider,
    aPrivate,
    bPrivate,
    aSharedFixture,
    householdItem,
    expiredGrantItem,
    revokedGrantItem,
    malformedGrantItem,
    cGrantItem,
    archivableItem,
    deletableItem,
  };
}

async function createItem(
  dbm: DbModule,
  database: DatabaseClient,
  owner: UserRow,
  input: {
    title: string;
    body: string;
    visibility?: "private" | "shared" | "household";
    ownerKind?: string;
    subjectUserId?: number | null;
    category?: string;
    sensitivity?: string;
    status?: "active" | "archived" | "deleted";
  },
) {
  const visibility = input.visibility ?? "private";
  const status = input.status ?? "active";
  const lifecycleAt = status === "active" ? null : new Date();
  const [item] = await database
    .insert(dbm.libraryItemsTable)
    .values({
      householdId: owner.householdId,
      ownerUserId: owner.id,
      subjectUserId:
        input.subjectUserId === undefined ? owner.id : input.subjectUserId,
      ownerKind:
        input.ownerKind ??
        (visibility === "household" ? "household" : "person"),
      visibility,
      category:
        input.category ??
        (visibility === "household" ? "household-record" : "note"),
      title: input.title,
      body: input.body,
      sourceType: "manual",
      sourceLabel: "Synthetic privacy fixture",
      provenance: { fixture: true, recordedByUserId: owner.id },
      sensitivity: input.sensitivity ?? "sensitive",
      allowedPurposes: ["remember", "search", "share"],
      status,
      archivedAt: status === "archived" ? lifecycleAt : null,
      deletedAt: status === "deleted" ? lifecycleAt : null,
      createdById: owner.id,
      updatedById: owner.id,
    })
    .returning();

  await database.insert(dbm.auditEventsTable).values({
    householdId: owner.householdId,
    actorUserId: owner.id,
    targetType: "library_item",
    targetId: item.id,
    eventType: "created",
    summary: "Library item created",
    metadata: {
      category: item.category,
      visibility: item.visibility,
      sensitivity: item.sensitivity,
    },
  });

  return item;
}

async function createGrant(
  dbm: DbModule,
  database: DatabaseClient,
  householdId: number,
  grantorUserId: number,
  granteeUserId: number,
  itemId: number,
  permission: string,
  overrides: Partial<DbModule["sharingGrantsTable"]["$inferInsert"]> = {},
) {
  const [grant] = await database
    .insert(dbm.sharingGrantsTable)
    .values({
      householdId,
      resourceType: "library_item",
      resourceId: itemId,
      grantorUserId,
      granteeUserId,
      permission,
      purpose: "integration_fixture",
      ...overrides,
    })
    .returning();
  return grant;
}

function newPassportId() {
  return `lhp_${randomBytes(16).toString("hex")}`;
}

async function login(email: string): Promise<TestClient> {
  const client = createClient();
  const response = await client.request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200);
  return client;
}

function createClient(): TestClient {
  let cookie = "";
  return {
    async request(pathname: string, init: RequestInit = {}) {
      const headers = new Headers(init.headers);
      if (init.body !== undefined)
        headers.set("content-type", "application/json");
      if (cookie) headers.set("cookie", cookie);
      const response = await fetch(`${baseUrl}${pathname}`, {
        ...init,
        headers,
      });
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";")[0] ?? cookie;
      const text = await response.text();
      const body = text ? JSON.parse(text) : null;
      return { status: response.status, body, text };
    },
  };
}

async function protectedRowCounts(database: DatabaseInstance) {
  const result = await database.pool.query<{
    signal_definitions: number;
    signal_observations: number;
    audit_events: number;
    library_items: number;
    sharing_grants: number;
    consent_grants: number;
    data_records: number;
    data_sources: number;
  }>(`select
      (select count(*)::int from signal_definitions) as signal_definitions,
      (select count(*)::int from signal_observations) as signal_observations,
      (select count(*)::int from audit_events) as audit_events,
      (select count(*)::int from library_items) as library_items,
      (select count(*)::int from sharing_grants) as sharing_grants,
      (select count(*)::int from consent_grants) as consent_grants,
      (select count(*)::int from data_records) as data_records,
      (select count(*)::int from data_sources) as data_sources`);
  return result.rows[0];
}

function assertInsightScalars(
  insights: InsightResponseFixture,
  expected: {
    visibleItems: number;
    ownedItems: number;
    sharedWithMe: number;
    householdItems: number;
    archivedItems: number;
  },
) {
  for (const [key, value] of Object.entries(expected) as Array<
    [keyof typeof expected, number]
  >) {
    assert.equal(insights.metrics[key].value, value, key);
  }
}

function assertNoInsightContentFields(value: unknown): void {
  const forbidden = new Set([
    "id",
    "itemId",
    "grantId",
    "title",
    "body",
    "sourceLabel",
    "provenance",
    "provenanceNote",
    "auditEventId",
  ]);

  if (Array.isArray(value)) {
    value.forEach(assertNoInsightContentFields);
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    assert.equal(forbidden.has(key), false, `Forbidden insight field: ${key}`);
    assertNoInsightContentFields(child);
  }
}

async function assertCanRead(
  client: TestClient,
  item: LibraryItemRow,
  bodyToken: string,
) {
  const response = await client.request(`/api/library/items/${item.id}`);
  assert.equal(response.status, 200);
  assertIncludesToken(response.body, item.title);
  assertIncludesToken(response.body, bodyToken);
}

async function assertDenied(client: TestClient, pathname: string) {
  const response = await client.request(pathname);
  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: "Not found" });
}

function assertEquivalentNotFound(
  actual: { status: number; body: unknown },
  expected: { status: number; body: unknown },
) {
  assert.equal(actual.status, 404);
  assert.equal(actual.status, expected.status);
  assert.deepEqual(actual.body, expected.body);
  assert.deepEqual(actual.body, { error: "Not found" });
}

async function assertNoLeakFromListSearchOrStats(
  client: TestClient,
  titleToken: string,
  bodyToken: string,
) {
  for (const pathname of [
    "/api/library/items",
    `/api/library/items?q=${encodeURIComponent(titleToken)}`,
    `/api/library/items?q=${encodeURIComponent(bodyToken)}`,
    "/api/library/stats",
  ]) {
    const response = await client.request(pathname);
    assert.equal(response.status, 200);
    assertNoTokens(response.body, [titleToken, bodyToken]);
    if (pathname.includes("/library/items?q=")) {
      assert.deepEqual(response.body, []);
    }
  }
}

async function assertNoLeakFromDirectOperations(
  client: TestClient,
  itemId: number,
  granteeUserId: number,
  tokens: string[],
  options: { canRead?: boolean } = {},
) {
  const operations: Array<[string, string, unknown?]> = [
    ["GET", `/api/library/items/${itemId}/audit`],
    ["GET", `/api/library/items/${itemId}/export`],
    [
      "PATCH",
      `/api/library/items/${itemId}`,
      { body: "unauthorized mutation" },
    ],
    ["POST", `/api/library/items/${itemId}/share`, { granteeUserId }],
    ["POST", `/api/library/items/${itemId}/revoke`, { granteeUserId }],
    ["DELETE", `/api/library/items/${itemId}`],
  ];
  if (!options.canRead)
    operations.unshift(["GET", `/api/library/items/${itemId}`]);

  for (const [method, pathname, body] of operations) {
    const response = await client.request(pathname, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.equal(
      response.status,
      404,
      `${method} ${pathname} should not enumerate the record`,
    );
    assertNoTokens(response.body, tokens);
  }
}

async function assertOwnerMutationBoundaries(
  owner: TestClient,
  nonOwner: TestClient,
) {
  const archive = await owner.request(
    `/api/library/items/${fixtures.archivableItem.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ status: "archived" }),
    },
  );
  assert.equal(archive.status, 200);
  assert.equal((archive.body as { status: string }).status, "archived");
  await assertCanRead(owner, fixtures.archivableItem, "A_ARCHIVABLE_CONTENT");
  await assertDenied(
    nonOwner,
    `/api/library/items/${fixtures.archivableItem.id}`,
  );

  const deniedDelete = await nonOwner.request(
    `/api/library/items/${fixtures.deletableItem.id}`,
    { method: "DELETE" },
  );
  assert.equal(deniedDelete.status, 404);

  const deleted = await owner.request(
    `/api/library/items/${fixtures.deletableItem.id}`,
    { method: "DELETE" },
  );
  assert.equal(deleted.status, 204);
  await assertDenied(owner, `/api/library/items/${fixtures.deletableItem.id}`);

  const correction = await owner.request(
    `/api/library/items/${fixtures.aPrivate.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ body: "A_PRIVATE_CONTENT_ALPHA corrected" }),
    },
  );
  assert.equal(correction.status, 200);
  assertIncludesToken(correction.body, "A_PRIVATE_CONTENT_ALPHA");
}

function assertNoTokens(value: unknown, tokens: string[]) {
  const serialized = JSON.stringify(value);
  for (const token of tokens) {
    assert(!serialized.includes(token), `Unexpected leak of token ${token}`);
  }
}

function assertIncludesToken(value: unknown, token: string) {
  assert(
    JSON.stringify(value).includes(token),
    `Expected response to include token ${token}`,
  );
}

function isRowSecurityError(error: unknown): boolean {
  const seen = new Set<object>();
  let current = error;

  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if ("code" in current && current.code === "42501") {
      return true;
    }
    current = "cause" in current ? current.cause : undefined;
  }

  assert.fail("Expected PostgreSQL row-security error 42501");
  return true;
}
