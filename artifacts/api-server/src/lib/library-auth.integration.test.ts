import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
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
  request: (path: string, init?: RequestInit) => Promise<{ status: number; body: unknown; text: string }>;
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
  fixtures = await seedFixtures(dbModule, migrationDatabase.db, await import("bcryptjs"));
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
    const rows = await dbModule.pool.query<{ count: number }>(`select count(*)::int as count from ${tableName}`);
    assert.equal(rows.rows[0].count, 0, `${tableName} must return no rows without actor context`);
  }

  await assert.rejects(
    dbModule.pool.query(
      "insert into personal_vaults (household_id, owner_user_id) values ($1, $2)",
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

      assert.equal((await dbModule.db.select().from(dbModule.personalVaultsTable)).length, 1);
      assert.equal((await dbModule.db.select().from(dbModule.dataSourcesTable)).length, 1);
      assert.equal((await dbModule.db.select().from(dbModule.dataRecordsTable)).length, 1);
      assert.equal((await dbModule.db.select().from(dbModule.consentGrantsTable)).length, 1);
      assert.equal((await dbModule.db.select().from(dbModule.signalObservationsTable)).length, 1);
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

      assert.equal((await dbModule.db.select().from(dbModule.personalVaultsTable)).length, 0);
      assert.equal((await dbModule.db.select().from(dbModule.dataSourcesTable)).length, 0);
      assert.equal((await dbModule.db.select().from(dbModule.dataRecordsTable)).length, 0);
      assert.equal((await dbModule.db.select().from(dbModule.consentGrantsTable)).length, 0);
      assert.equal((await dbModule.db.select().from(dbModule.signalObservationsTable)).length, 0);

      const spaces = await dbModule.db.select().from(dbModule.sharedSpacesTable);
      assert.deepEqual(spaces.map((space) => space.householdId), [fixtures.adultB.householdId]);
      const deniedSpaceUpdate = await dbModule.db
        .update(dbModule.sharedSpacesTable)
        .set({ name: "unauthorized" })
        .returning({ id: dbModule.sharedSpacesTable.id });
      assert.deepEqual(deniedSpaceUpdate, []);

      const grants = await dbModule.db.select().from(dbModule.sharingGrantsTable);
      assert.deepEqual(grants.map((grant) => grant.resourceId), [fixtures.aSharedFixture.id]);

      const auditEvents = await dbModule.db.select().from(dbModule.auditEventsTable);
      assert(!auditEvents.some((event) => event.targetId === fixtures.aPrivate.id));
      assert(!auditEvents.some((event) => event.targetId === fixtures.aSharedFixture.id));
      assert(auditEvents.some((event) => event.targetId === fixtures.householdItem.id));

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
      () => dbModule.db.insert(dbModule.dataSourcesTable).values({
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
      () => dbModule.db.insert(dbModule.sharingGrantsTable).values({
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

  const referenceRows = await dbModule.db.select().from(dbModule.signalDefinitionsTable);
  assert.equal(referenceRows.length, 1);
  await assert.rejects(
    dbModule.db.insert(dbModule.signalDefinitionsTable).values({
      name: "Unauthorized definition",
      domain: "test",
      unit: "count",
      timeWindow: "point-in-time",
      formulaVersion: "v1",
      definition: "Runtime roles cannot mutate global definitions.",
    }),
    isRowSecurityError,
  );
});

test("Adult B cannot infer Adult A private library records without an active read grant", async () => {
  const adultA = await login(fixtures.adultA.email);
  const adultB = await login(fixtures.adultB.email);
  const adultC = await login(fixtures.adultC.email);
  const outsider = await login(fixtures.outsider.email);

  await assertCanRead(adultA, fixtures.aPrivate, "A_PRIVATE_CONTENT_ALPHA");
  await assertCanRead(adultB, fixtures.bPrivate, "B_PRIVATE_CONTENT_BRAVO");

  const deniedKnown = await adultB.request(`/api/library/items/${fixtures.aPrivate.id}`);
  const deniedRandom = await adultB.request("/api/library/items/99999999");
  assertEquivalentNotFound(deniedKnown, deniedRandom);

  await assertNoLeakFromListSearchOrStats(adultB, "A_PRIVATE_TITLE_ALPHA", "A_PRIVATE_CONTENT_ALPHA");
  await assertNoLeakFromDirectOperations(adultB, fixtures.aPrivate.id, fixtures.adultC.id, [
    "A_PRIVATE_TITLE_ALPHA",
    "A_PRIVATE_CONTENT_ALPHA",
  ]);

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
  assertNoTokens(members.body, [fixtures.adultA.lighthousePassportId ?? "missing-passport"]);

  await assertCanRead(adultB, fixtures.aSharedFixture, "A_SHARED_FIXTURE_CONTENT");
  const sharedByFixture = await adultB.request(`/api/library/items/${fixtures.aSharedFixture.id}`);
  assert.equal(sharedByFixture.status, 200);
  assert.equal(Array.isArray((sharedByFixture.body as { grants?: unknown[] }).grants), true);
  assert.deepEqual((sharedByFixture.body as { grants: unknown[] }).grants, []);

  await assertDenied(adultC, `/api/library/items/${fixtures.aSharedFixture.id}`);
  await assertDenied(outsider, `/api/library/items/${fixtures.aSharedFixture.id}`);

  for (const item of [
    fixtures.expiredGrantItem,
    fixtures.revokedGrantItem,
    fixtures.malformedGrantItem,
    fixtures.cGrantItem,
  ]) {
    await assertDenied(adultB, `/api/library/items/${item.id}`);
  }

  await assertCanRead(adultB, fixtures.householdItem, "HOUSEHOLD_CONTENT_DELTA");
  const householdAudit = await adultB.request(`/api/library/items/${fixtures.householdItem.id}/audit`);
  assert.equal(householdAudit.status, 200);

  await assertOwnerMutationBoundaries(adultA, adultB);

  const share = await adultA.request(`/api/library/items/${fixtures.aPrivate.id}/share`, {
    method: "POST",
    body: JSON.stringify({ granteeUserId: fixtures.adultB.id, purpose: "integration_share" }),
  });
  assert.equal(share.status, 200);

  await assertCanRead(adultB, fixtures.aPrivate, "A_PRIVATE_CONTENT_ALPHA");
  const searchWhileShared = await adultB.request("/api/library/items?q=A_PRIVATE_TITLE_ALPHA");
  assert.equal(searchWhileShared.status, 200);
  assert.deepEqual(
    (searchWhileShared.body as Array<{ id: number }>).map((item) => item.id),
    [fixtures.aPrivate.id],
  );

  await assertNoLeakFromDirectOperations(adultB, fixtures.aPrivate.id, fixtures.adultC.id, [
    "A_PRIVATE_CONTENT_ALPHA",
  ], { canRead: true });

  const ownerAudit = await adultA.request(`/api/library/items/${fixtures.aPrivate.id}/audit`);
  assert.equal(ownerAudit.status, 200);
  assertNoTokens(ownerAudit.body, ["A_PRIVATE_TITLE_ALPHA", "A_PRIVATE_CONTENT_ALPHA"]);

  const ownerExport = await adultA.request(`/api/library/items/${fixtures.aPrivate.id}/export`);
  assert.equal(ownerExport.status, 200);
  assertIncludesToken(ownerExport.body, "A_PRIVATE_CONTENT_ALPHA");

  const revoke = await adultA.request(`/api/library/items/${fixtures.aPrivate.id}/revoke`, {
    method: "POST",
    body: JSON.stringify({ granteeUserId: fixtures.adultB.id }),
  });
  assert.equal(revoke.status, 200);

  const deniedAfterRevoke = await adultB.request(`/api/library/items/${fixtures.aPrivate.id}`);
  const randomAfterRevoke = await adultB.request("/api/library/items/99999998");
  assertEquivalentNotFound(deniedAfterRevoke, randomAfterRevoke);
  await assertNoLeakFromListSearchOrStats(adultB, "A_PRIVATE_TITLE_ALPHA", "A_PRIVATE_CONTENT_ALPHA");
  await assertCanRead(adultA, fixtures.aPrivate, "A_PRIVATE_CONTENT_ALPHA");

  const auditRows = await migrationDatabase.pool.query(
    "select summary, metadata::text as metadata from audit_events order by id",
  );
  for (const row of auditRows.rows as Array<{ summary: string; metadata: string }>) {
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
      ],
    ],
  );
  assert.equal(indexRows.rows.length, 5);

  const nullability = await database.pool.query(
    `select table_name, column_name, is_nullable
     from information_schema.columns
     where table_schema = 'public'
       and (table_name, column_name) in (
         ('library_items', 'title'),
         ('library_items', 'body'),
         ('sharing_grants', 'grantee_user_id'),
         ('audit_events', 'metadata'),
         ('session', 'sid')
       )`,
  );
  const nullabilityByColumn = new Map(
    nullability.rows.map((row: { table_name: string; column_name: string; is_nullable: string }) => [
      `${row.table_name}.${row.column_name}`,
      row.is_nullable,
    ]),
  );
  assert.equal(nullabilityByColumn.get("library_items.title"), "NO");
  assert.equal(nullabilityByColumn.get("library_items.body"), "YES");
  assert.equal(nullabilityByColumn.get("sharing_grants.grantee_user_id"), "NO");
  assert.equal(nullabilityByColumn.get("audit_events.metadata"), "NO");
  assert.equal(nullabilityByColumn.get("session.sid"), "NO");

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
  assert.deepEqual(runtimeRole.rows, [{
    rolcanlogin: false,
    rolsuper: false,
    rolcreatedb: false,
    rolcreaterole: false,
    rolbypassrls: false,
  }]);
}

async function seedFixtures(
  dbm: DbModule,
  database: DatabaseClient,
  bcryptModule: BcryptModule,
): Promise<FixtureState> {
  const bcrypt = bcryptModule.default ?? bcryptModule;
  const passwordHash = await bcrypt.hash(password, 4);

  const [household] = await database.insert(dbm.householdsTable).values({ name: "Privacy Test Household" }).returning();
  const [otherHousehold] = await database.insert(dbm.householdsTable).values({ name: "Outsider Household" }).returning();

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
    { householdId: household.id, name: "Privacy Test Household Space", createdById: adultA.id },
    { householdId: otherHousehold.id, name: "Outsider Household Space", createdById: outsider.id },
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
  const [signal] = await database
    .insert(dbm.signalDefinitionsTable)
    .values({
      name: "Fixture signal",
      domain: "library",
      unit: "count",
      timeWindow: "point-in-time",
      formulaVersion: "v1",
      definition: "Synthetic fixture signal for privacy integration tests.",
    })
    .returning();
  await database.insert(dbm.signalObservationsTable).values({
    householdId: household.id,
    ownerUserId: adultA.id,
    subjectUserId: adultA.id,
    signalDefinitionId: signal.id,
    value: "1",
    evidenceWindow: "2026-07-20",
    provenance: { fixture: true },
    visibility: "private",
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
  await createGrant(dbm, database, household.id, adultA.id, adultB.id, aSharedFixture.id, "read");

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
  await createGrant(dbm, database, household.id, adultA.id, adultB.id, expiredGrantItem.id, "read", {
    expiresAt: new Date(Date.now() - 60_000),
  });

  const revokedGrantItem = await createItem(dbm, database, adultA, {
    title: "A_REVOKED_GRANT_TITLE",
    body: "A_REVOKED_GRANT_CONTENT",
    visibility: "shared",
  });
  await createGrant(dbm, database, household.id, adultA.id, adultB.id, revokedGrantItem.id, "read", {
    revokedAt: new Date(),
    revokedById: adultA.id,
  });

  const malformedGrantItem = await createItem(dbm, database, adultA, {
    title: "A_MALFORMED_GRANT_TITLE",
    body: "A_MALFORMED_GRANT_CONTENT",
    visibility: "shared",
  });
  await createGrant(dbm, database, household.id, adultA.id, adultB.id, malformedGrantItem.id, "comment");

  const cGrantItem = await createItem(dbm, database, adultA, {
    title: "A_C_ONLY_GRANT_TITLE",
    body: "A_C_ONLY_GRANT_CONTENT",
    visibility: "shared",
  });
  await createGrant(dbm, database, household.id, adultA.id, adultC.id, cGrantItem.id, "read");

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
  },
) {
  const visibility = input.visibility ?? "private";
  const [item] = await database
    .insert(dbm.libraryItemsTable)
    .values({
      householdId: owner.householdId,
      ownerUserId: owner.id,
      subjectUserId: input.subjectUserId === undefined ? owner.id : input.subjectUserId,
      ownerKind: input.ownerKind ?? (visibility === "household" ? "household" : "person"),
      visibility,
      category: visibility === "household" ? "household-record" : "note",
      title: input.title,
      body: input.body,
      sourceType: "manual",
      sourceLabel: "Synthetic privacy fixture",
      provenance: { fixture: true, recordedByUserId: owner.id },
      sensitivity: "sensitive",
      allowedPurposes: ["remember", "search", "share"],
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
    metadata: { category: item.category, visibility: item.visibility, sensitivity: item.sensitivity },
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
      if (init.body !== undefined) headers.set("content-type", "application/json");
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

async function assertCanRead(client: TestClient, item: LibraryItemRow, bodyToken: string) {
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

async function assertNoLeakFromListSearchOrStats(client: TestClient, titleToken: string, bodyToken: string) {
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
    ["PATCH", `/api/library/items/${itemId}`, { body: "unauthorized mutation" }],
    ["POST", `/api/library/items/${itemId}/share`, { granteeUserId }],
    ["POST", `/api/library/items/${itemId}/revoke`, { granteeUserId }],
    ["DELETE", `/api/library/items/${itemId}`],
  ];
  if (!options.canRead) operations.unshift(["GET", `/api/library/items/${itemId}`]);

  for (const [method, pathname, body] of operations) {
    const response = await client.request(pathname, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.equal(response.status, 404, `${method} ${pathname} should not enumerate the record`);
    assertNoTokens(response.body, tokens);
  }
}

async function assertOwnerMutationBoundaries(owner: TestClient, nonOwner: TestClient) {
  const archive = await owner.request(`/api/library/items/${fixtures.archivableItem.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "archived" }),
  });
  assert.equal(archive.status, 200);
  assert.equal((archive.body as { status: string }).status, "archived");
  await assertCanRead(owner, fixtures.archivableItem, "A_ARCHIVABLE_CONTENT");
  await assertDenied(nonOwner, `/api/library/items/${fixtures.archivableItem.id}`);

  const deniedDelete = await nonOwner.request(`/api/library/items/${fixtures.deletableItem.id}`, { method: "DELETE" });
  assert.equal(deniedDelete.status, 404);

  const deleted = await owner.request(`/api/library/items/${fixtures.deletableItem.id}`, { method: "DELETE" });
  assert.equal(deleted.status, 204);
  await assertDenied(owner, `/api/library/items/${fixtures.deletableItem.id}`);

  const correction = await owner.request(`/api/library/items/${fixtures.aPrivate.id}`, {
    method: "PATCH",
    body: JSON.stringify({ body: "A_PRIVATE_CONTENT_ALPHA corrected" }),
  });
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
  assert(JSON.stringify(value).includes(token), `Expected response to include token ${token}`);
}

function isRowSecurityError(error: unknown): boolean {
  assert(error && typeof error === "object" && "code" in error);
  assert.equal((error as { code: string }).code, "42501");
  return true;
}
