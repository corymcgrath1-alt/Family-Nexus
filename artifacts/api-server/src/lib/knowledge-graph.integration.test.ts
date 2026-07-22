import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, test } from "node:test";

import { eq, sql } from "drizzle-orm";
import {
  KNOWLEDGE_ENTITY_TYPES,
  KNOWLEDGE_RELATIONSHIP_TYPES,
} from "@workspace/knowledge-model";

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

type DbModule = typeof import("@workspace/db");
type DatabaseInstance = ReturnType<DbModule["createDatabase"]>;
type UserRow = DbModule["usersTable"]["$inferSelect"];
type EntityRow = DbModule["knowledgeEntitiesTable"]["$inferSelect"];
type SourceRow = DbModule["knowledgeSourcesTable"]["$inferSelect"];
type GrantRow = DbModule["knowledgeEntityGrantsTable"]["$inferSelect"];

type Fixtures = {
  adultA: UserRow;
  adultB: UserRow;
  outsider: UserRow;
  sourceA: SourceRow;
  sourceB: SourceRow;
  aPrivate: EntityRow;
  aShared: EntityRow;
  aHousehold: EntityRow;
  aHiddenEndpoint: EntityRow;
  aPassportEntity: EntityRow;
  aVerifiedObservation: EntityRow;
  bPrivate: EntityRow;
  outsiderPrivate: EntityRow;
  activeGrant: GrantRow;
  safeRelationshipId: string;
  hiddenRelationshipId: string;
};

let dbModule: DbModule;
let migrationDatabase: DatabaseInstance;
let fixtures: Fixtures;

before(async () => {
  dbModule = await import("@workspace/db");
  migrationDatabase = dbModule.createDatabase(migrationDatabaseUrl);
  fixtures = await seedFixtures(dbModule, migrationDatabase);
  await dbModule.assertRestrictedRuntimeDatabase();
});

after(async () => {
  await Promise.all([dbModule.pool.end(), migrationDatabase.pool.end()]);
});

test("clean migration installs canonical graph registries, indexes, triggers, and RLS", async () => {
  const tables = [
    "knowledge_entity_types",
    "knowledge_relationship_types",
    "knowledge_sources",
    "knowledge_entities",
    "knowledge_entity_grants",
    "knowledge_entity_sources",
    "knowledge_entity_versions",
    "knowledge_extension_versions",
    "knowledge_relationships",
    "knowledge_relationship_versions",
    "knowledge_audit_events",
    "knowledge_memories",
    "knowledge_observations",
    "knowledge_insights",
    "knowledge_recommendations",
    "lighthouse_passports",
  ];

  const tableRows = await migrationDatabase.pool.query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1)",
    [tables],
  );
  assert.deepEqual(tableRows.rows.map((row) => row.table_name).sort(), [...tables].sort());

  const entityTypes = await migrationDatabase.pool.query<{ entity_type: string }>(
    "select entity_type from knowledge_entity_types order by entity_type",
  );
  assert.deepEqual(entityTypes.rows.map((row) => row.entity_type), [...KNOWLEDGE_ENTITY_TYPES].sort());

  const relationshipTypes = await migrationDatabase.pool.query<{ relationship_type: string }>(
    "select relationship_type from knowledge_relationship_types order by relationship_type",
  );
  assert.deepEqual(
    relationshipTypes.rows.map((row) => row.relationship_type),
    [...KNOWLEDGE_RELATIONSHIP_TYPES].sort(),
  );

  const requiredIndexes = [
    "knowledge_entities_search_idx",
    "knowledge_entities_tags_idx",
    "knowledge_entities_timeline_idx",
      "knowledge_entity_grants_active_uq",
      "knowledge_entity_sources_record_uq",
      "knowledge_relationships_source_idx",
      "knowledge_relationships_source_record_uq",
    "knowledge_relationships_target_idx",
  ];
  const indexRows = await migrationDatabase.pool.query<{ indexname: string }>(
    "select indexname from pg_indexes where schemaname = 'public' and indexname = any($1)",
    [requiredIndexes],
  );
  assert.deepEqual(indexRows.rows.map((row) => row.indexname).sort(), [...requiredIndexes].sort());

  const rlsRows = await migrationDatabase.pool.query<{ table_name: string; rls_enabled: boolean }>(
    `select table_row.relname as table_name, table_row.relrowsecurity as rls_enabled
       from pg_class table_row
       join pg_namespace schema_row on schema_row.oid = table_row.relnamespace
      where schema_row.nspname = 'public' and table_row.relname = any($1)`,
    [tables.filter((table) => !table.endsWith("_types"))],
  );
  assert.equal(rlsRows.rows.length, 14);
  assert(rlsRows.rows.every((row) => row.rls_enabled));

  const triggerRows = await migrationDatabase.pool.query<{ trigger_name: string }>(
    `select trigger_name from information_schema.triggers
      where event_object_schema = 'public' and trigger_name = any($1)`,
    [[
      "knowledge_entities_guard_update",
      "knowledge_entities_capture_change",
      "knowledge_entity_grants_guard_update",
      "knowledge_entity_grants_capture_change",
      "knowledge_relationships_guard_update",
      "knowledge_relationships_capture_change",
      "lighthouse_passports_validate",
    ]],
  );
  assert.equal(new Set(triggerRows.rows.map((row) => row.trigger_name)).size, 7);
});

test("restricted runtime authority and missing actor context fail closed", async () => {
  await dbModule.assertRestrictedRuntimeDatabase();

  const protectedTables = [
    "knowledge_sources",
    "knowledge_entities",
    "knowledge_entity_grants",
    "knowledge_entity_sources",
    "knowledge_entity_versions",
    "knowledge_extension_versions",
    "knowledge_relationships",
    "knowledge_relationship_versions",
    "knowledge_audit_events",
    "knowledge_memories",
    "knowledge_observations",
    "knowledge_insights",
    "knowledge_recommendations",
    "lighthouse_passports",
  ];

  for (const tableName of protectedTables) {
    const result = await dbModule.pool.query<{ count: number }>(`select count(*)::int as count from ${tableName}`);
    assert.equal(result.rows[0].count, 0, `${tableName} must return no rows without actor context`);
  }

  assert.equal((await dbModule.pool.query("select * from knowledge_entity_types")).rowCount, 53);
  assert.equal((await dbModule.pool.query("select * from knowledge_relationship_types")).rowCount, 21);

  await assert.rejects(
    dbModule.pool.query(
      `insert into knowledge_sources
        (household_id, owner_user_id, source_kind, provider)
       values ($1, $2, 'manual_entry', 'Denied source')`,
      [fixtures.adultA.householdId, fixtures.adultA.id],
    ),
    hasPostgresCode("42501"),
  );

  await assert.rejects(
    dbModule.pool.query(
      "insert into knowledge_entity_types (entity_type, display_name, domain, default_privacy_level, default_sensitivity) values ('new_type', 'New', 'test', 'personal_private', 'personal')",
    ),
    hasPostgresCode("42501"),
  );
});

test("actor-scoped graph reads cannot infer another adult private data or hidden endpoints", async () => {
  await dbModule.withDatabaseActor(actor(fixtures.adultA), async () => {
    const entities = await dbModule.db.select().from(dbModule.knowledgeEntitiesTable);
    const ids = new Set(entities.map((entity) => entity.id));
    assert(ids.has(fixtures.aPrivate.id));
    assert(ids.has(fixtures.aShared.id));
    assert(ids.has(fixtures.aHousehold.id));
    assert(ids.has(fixtures.aPassportEntity.id));
    assert(!ids.has(fixtures.bPrivate.id));
    assert(!ids.has(fixtures.outsiderPrivate.id));

    assert.equal((await dbModule.db.select().from(dbModule.knowledgeSourcesTable)).length, 1);
    assert.equal((await dbModule.db.select().from(dbModule.lighthousePassportsTable)).length, 1);
  });

  await dbModule.withDatabaseActor(actor(fixtures.adultB), async () => {
    const entities = await dbModule.db.select().from(dbModule.knowledgeEntitiesTable);
    const ids = new Set(entities.map((entity) => entity.id));
    assert(ids.has(fixtures.bPrivate.id));
    assert(ids.has(fixtures.aShared.id));
    assert(ids.has(fixtures.aHousehold.id));
    assert(!ids.has(fixtures.aPrivate.id));
    assert(!ids.has(fixtures.aHiddenEndpoint.id));
    assert(!ids.has(fixtures.aPassportEntity.id));
    assert(!ids.has(fixtures.outsiderPrivate.id));

    const sources = await dbModule.db.select().from(dbModule.knowledgeSourcesTable);
    assert.deepEqual(sources.map((source) => source.id), [fixtures.sourceB.id]);

    const sourceLinks = await dbModule.db.select().from(dbModule.knowledgeEntitySourcesTable);
    assert(!sourceLinks.some((link) => link.entityId === fixtures.aShared.id));

    const versions = await dbModule.db.select().from(dbModule.knowledgeEntityVersionsTable);
    assert(versions.some((version) => version.entityId === fixtures.bPrivate.id));
    assert(!versions.some((version) => version.entityId === fixtures.aShared.id));

    const extensionVersions = await dbModule.db.select().from(dbModule.knowledgeExtensionVersionsTable);
    assert(extensionVersions.some((version) => version.entityId === fixtures.bPrivate.id));
    assert(!extensionVersions.some((version) => version.entityId === fixtures.aShared.id));

    const audits = await dbModule.db.select().from(dbModule.knowledgeAuditEventsTable);
    assert(audits.some((event) => event.entityId === fixtures.bPrivate.id));
    assert(!audits.some((event) => event.entityId === fixtures.aShared.id));

    const relationships = await dbModule.db.select().from(dbModule.knowledgeRelationshipsTable);
    assert(relationships.some((relationship) => relationship.id === fixtures.safeRelationshipId));
    assert(!relationships.some((relationship) => relationship.id === fixtures.hiddenRelationshipId));

    assert.equal((await dbModule.db.select().from(dbModule.lighthousePassportsTable)).length, 0);

    const searchResult = await dbModule.db.execute(sql`
      select id from knowledge_entities
       where search_vector @@ websearch_to_tsquery('simple', 'PRIVATE_ALPHA_TOKEN')
    `);
    assert.deepEqual((searchResult as unknown as { rows: unknown[] }).rows, []);

    const deniedUpdate = await dbModule.db
      .update(dbModule.knowledgeEntitiesTable)
      .set({ canonicalLabel: "Unauthorized", version: fixtures.aShared.version + 1, updatedById: fixtures.adultB.id })
      .where(eq(dbModule.knowledgeEntitiesTable.id, fixtures.aShared.id))
      .returning({ id: dbModule.knowledgeEntitiesTable.id });
    assert.deepEqual(deniedUpdate, []);
  });

  const auditRows = await migrationDatabase.pool.query<{ metadata: Record<string, unknown> }>(
    "select metadata from knowledge_audit_events",
  );
  for (const { metadata } of auditRows.rows) {
    const serialized = JSON.stringify(metadata);
    assert(!serialized.includes("PRIVATE_ALPHA_TOKEN"));
    assert(!serialized.includes("Private Alpha body"));
    assert(!serialized.includes("source_text"));
  }
});

test("grant scope is immutable, revocation is immediate, and lifecycle writes remain owner-only", async () => {
  await assert.rejects(
    dbModule.withDatabaseActor(actor(fixtures.adultA), () =>
      dbModule.db
        .update(dbModule.knowledgeEntityGrantsTable)
        .set({ entityId: fixtures.aPrivate.id })
        .where(eq(dbModule.knowledgeEntityGrantsTable.id, fixtures.activeGrant.id)),
    ),
    hasPostgresCode("P0001"),
  );

  await assert.rejects(
    dbModule.withDatabaseActor(actor(fixtures.adultA), () =>
      dbModule.db.insert(dbModule.knowledgeEntityGrantsTable).values({
        householdId: fixtures.adultA.householdId,
        entityId: fixtures.aShared.id,
        grantorUserId: fixtures.adultA.id,
        granteeUserId: fixtures.outsider.id,
        permission: "read",
        purpose: "cross_household_denied",
      })),
    hasPostgresCode("42501"),
  );

  await assert.rejects(
    dbModule.withDatabaseActor(actor(fixtures.adultA), () =>
      dbModule.db.insert(dbModule.knowledgeEntitiesTable).values({
        entityType: "observation",
        householdId: fixtures.adultA.householdId,
        ownerUserId: fixtures.adultA.id,
        subjectUserId: fixtures.adultB.id,
        primarySourceId: fixtures.sourceA.id,
        canonicalLabel: "Cross-adult observation denied",
        privacyLevel: "personal_private",
        visibility: "private",
        sensitivity: "sensitive",
        confidenceScore: "0.5000",
        verificationState: "unverified",
        temporalState: "current",
        retentionPolicy: "user_controlled",
        createdById: fixtures.adultA.id,
        updatedById: fixtures.adultA.id,
      })),
    hasPostgresCode("23514"),
  );

  await assert.rejects(
    dbModule.withDatabaseActor(actor(fixtures.adultA), () =>
      dbModule.db.insert(dbModule.knowledgeObservationsTable).values({
        entityId: fixtures.aVerifiedObservation.id,
        observationText: "Cannot present an observation as verified fact",
        observationKind: "user_observation",
        observedAt: new Date("2026-07-21T12:00:00.000Z"),
        assertedByUserId: fixtures.adultA.id,
      })),
    hasPostgresCode("42501"),
  );

  await assert.rejects(
    dbModule.withDatabaseActor(actor(fixtures.adultA), () =>
      dbModule.db
        .update(dbModule.knowledgeEntitiesTable)
        .set({ canonicalLabel: "Bad version", version: fixtures.aPrivate.version + 2, updatedById: fixtures.adultA.id })
        .where(eq(dbModule.knowledgeEntitiesTable.id, fixtures.aPrivate.id))),
    hasPostgresCode("P0001"),
  );

  await dbModule.withDatabaseActor(actor(fixtures.adultA), async () => {
    const [updated] = await dbModule.db
      .update(dbModule.knowledgeEntitiesTable)
      .set({
        canonicalLabel: "Private Alpha corrected",
        searchText: "PRIVATE_ALPHA_TOKEN corrected",
        version: fixtures.aPrivate.version + 1,
        updatedById: fixtures.adultA.id,
      })
      .where(eq(dbModule.knowledgeEntitiesTable.id, fixtures.aPrivate.id))
      .returning();
    assert.equal(updated.version, 2);

    const history = await dbModule.db
      .select()
      .from(dbModule.knowledgeEntityVersionsTable)
      .where(eq(dbModule.knowledgeEntityVersionsTable.entityId, fixtures.aPrivate.id));
    assert.deepEqual(history.map((version) => version.version).sort(), [1, 2]);

    const [memory] = await dbModule.db
      .update(dbModule.knowledgeMemoriesTable)
      .set({ summary: "Private Alpha corrected extension", version: 2 })
      .where(eq(dbModule.knowledgeMemoriesTable.entityId, fixtures.aPrivate.id))
      .returning();
    assert.equal(memory.version, 2);

    const extensionHistory = await dbModule.db
      .select()
      .from(dbModule.knowledgeExtensionVersionsTable)
      .where(eq(dbModule.knowledgeExtensionVersionsTable.entityId, fixtures.aPrivate.id));
    assert.deepEqual(extensionHistory.map((version) => version.version).sort(), [1, 2]);

    await dbModule.db
      .update(dbModule.knowledgeEntityGrantsTable)
      .set({ revokedAt: new Date(), revokedById: fixtures.adultA.id })
      .where(eq(dbModule.knowledgeEntityGrantsTable.id, fixtures.activeGrant.id));
  });

  await dbModule.withDatabaseActor(actor(fixtures.adultB), async () => {
    const entities = await dbModule.db.select().from(dbModule.knowledgeEntitiesTable);
    assert(!entities.some((entity) => entity.id === fixtures.aShared.id));
    assert(entities.some((entity) => entity.id === fixtures.aHousehold.id));

    const relationships = await dbModule.db.select().from(dbModule.knowledgeRelationshipsTable);
    assert(!relationships.some((relationship) => relationship.id === fixtures.safeRelationshipId));
  });

  await assert.rejects(
    dbModule.withDatabaseActor(actor(fixtures.adultA), () =>
      dbModule.db.delete(dbModule.knowledgeEntitiesTable).where(eq(dbModule.knowledgeEntitiesTable.id, fixtures.aPrivate.id))),
    hasPostgresCode("42501"),
  );

  await dbModule.withDatabaseActor(actor(fixtures.adultA), async () => {
    const owned = await dbModule.db
      .select()
      .from(dbModule.knowledgeEntitiesTable)
      .where(eq(dbModule.knowledgeEntitiesTable.id, fixtures.aShared.id));
    assert.equal(owned.length, 1);
  });
});

async function seedFixtures(dbm: DbModule, database: DatabaseInstance): Promise<Fixtures> {
  const [household] = await database.db
    .insert(dbm.householdsTable)
    .values({ name: "Knowledge Graph Test Household" })
    .returning();
  const [otherHousehold] = await database.db
    .insert(dbm.householdsTable)
    .values({ name: "Knowledge Graph Outside Household" })
    .returning();

  const createUser = async (householdId: number, label: string) => {
    const [user] = await database.db.insert(dbm.usersTable).values({
      householdId,
      lighthousePassportId: newPassportId(),
      email: `${label.toLowerCase().replaceAll(" ", ".")}@graph.example.test`,
      displayName: label,
      role: "adult",
      avatarInitials: label.split(" ").map((part) => part[0]).join(""),
    }).returning();
    return user;
  };

  const adultA = await createUser(household.id, "Graph Adult A");
  const adultB = await createUser(household.id, "Graph Adult B");
  const outsider = await createUser(otherHousehold.id, "Graph Outsider");

  const createSource = async (owner: UserRow, provider: string) => {
    const [source] = await database.db.insert(dbm.knowledgeSourcesTable).values({
      householdId: owner.householdId,
      ownerUserId: owner.id,
      sourceKind: "manual_entry",
      provider,
      sourceLabel: "Synthetic graph fixture",
      confidenceScore: "1.0000",
      verificationState: "self_asserted",
      provenance: { fixture: true },
      privacyLevel: "personal_private",
      sensitivity: "personal",
      retentionPolicy: "user_controlled",
    }).returning();
    return source;
  };

  const sourceA = await createSource(adultA, "Adult A manual entry");
  const sourceB = await createSource(adultB, "Adult B manual entry");
  const sourceOutside = await createSource(outsider, "Outside manual entry");

  const createEntity = async (
    owner: UserRow,
    source: SourceRow,
    input: {
      entityType: string;
      label: string;
      searchText: string;
      visibility?: string;
      privacyLevel?: string;
      subjectUserId?: number | null;
      verificationState?: string;
    },
  ) => {
    const [entity] = await database.db.insert(dbm.knowledgeEntitiesTable).values({
      entityType: input.entityType,
      householdId: owner.householdId,
      ownerUserId: owner.id,
      subjectUserId: input.subjectUserId === undefined ? owner.id : input.subjectUserId,
      primarySourceId: source.id,
      canonicalLabel: input.label,
      searchText: input.searchText,
      privacyLevel: input.privacyLevel ?? "personal_private",
      visibility: input.visibility ?? "private",
      sensitivity: "personal",
      confidenceScore: "1.0000",
      verificationState: input.verificationState ?? "self_asserted",
      temporalState: "current",
      retentionPolicy: "user_controlled",
      createdById: owner.id,
      updatedById: owner.id,
    }).returning();
    return entity;
  };

  const aPrivate = await createEntity(adultA, sourceA, {
    entityType: "memory",
    label: "Private Alpha memory",
    searchText: "PRIVATE_ALPHA_TOKEN Private Alpha body",
  });
  const aShared = await createEntity(adultA, sourceA, {
    entityType: "memory",
    label: "Shared Alpha memory",
    searchText: "SHARED_ALPHA_TOKEN",
    visibility: "shared",
  });
  const aHousehold = await createEntity(adultA, sourceA, {
    entityType: "home",
    label: "Shared household home",
    searchText: "HOUSEHOLD_HOME_TOKEN",
    visibility: "household",
    privacyLevel: "household",
    subjectUserId: null,
  });
  const aHiddenEndpoint = await createEntity(adultA, sourceA, {
    entityType: "document",
    label: "Hidden endpoint",
    searchText: "HIDDEN_ENDPOINT_TOKEN",
  });
  const aPassportEntity = await createEntity(adultA, sourceA, {
    entityType: "person",
    label: "Adult A private Passport entity",
    searchText: "PASSPORT_A_TOKEN",
  });
  const aVerifiedObservation = await createEntity(adultA, sourceA, {
    entityType: "observation",
    label: "Verified-state observation shell",
    searchText: "OBSERVATION_TOKEN",
    verificationState: "source_verified",
  });
  const bPrivate = await createEntity(adultB, sourceB, {
    entityType: "memory",
    label: "Private Bravo memory",
    searchText: "PRIVATE_BRAVO_TOKEN",
  });
  const outsiderPrivate = await createEntity(outsider, sourceOutside, {
    entityType: "memory",
    label: "Outside household memory",
    searchText: "OUTSIDE_TOKEN",
  });

  await database.db.insert(dbm.knowledgeMemoriesTable).values([
    { entityId: aPrivate.id, title: "Private Alpha memory", summary: "Private Alpha body" },
    { entityId: aShared.id, title: "Shared Alpha memory", summary: "Synthetic shared content" },
    { entityId: bPrivate.id, title: "Private Bravo memory", summary: "Synthetic private content" },
    { entityId: outsiderPrivate.id, title: "Outside memory", summary: "Synthetic outside content" },
  ]);

  await database.db.insert(dbm.knowledgeEntitySourcesTable).values([
    { entityId: aPrivate.id, sourceId: sourceA.id, sourceRole: "primary", evidenceNote: "PRIVATE_ALPHA_TOKEN evidence", createdById: adultA.id },
    { entityId: aShared.id, sourceId: sourceA.id, sourceRole: "primary", evidenceNote: "Owner-only provenance", createdById: adultA.id },
    { entityId: bPrivate.id, sourceId: sourceB.id, sourceRole: "primary", evidenceNote: "Synthetic provenance", createdById: adultB.id },
  ]);

  const [activeGrant] = await database.db.insert(dbm.knowledgeEntityGrantsTable).values({
    householdId: household.id,
    entityId: aShared.id,
    grantorUserId: adultA.id,
    granteeUserId: adultB.id,
    permission: "read",
    purpose: "integration_fixture",
  }).returning();

  const [safeRelationship] = await database.db.insert(dbm.knowledgeRelationshipsTable).values({
    householdId: household.id,
    ownerUserId: adultA.id,
    sourceEntityId: aShared.id,
    targetEntityId: aHousehold.id,
    relationshipType: "related_to",
    direction: "undirected",
    confidenceScore: "1.0000",
    verificationState: "self_asserted",
    primarySourceId: sourceA.id,
    privacyInheritance: "most_restrictive",
    privacyLevel: "personal_private",
    visibility: "shared",
    retentionPolicy: "user_controlled",
    createdById: adultA.id,
    updatedById: adultA.id,
  }).returning();

  const [hiddenRelationship] = await database.db.insert(dbm.knowledgeRelationshipsTable).values({
    householdId: household.id,
    ownerUserId: adultA.id,
    sourceEntityId: aShared.id,
    targetEntityId: aHiddenEndpoint.id,
    relationshipType: "supports",
    direction: "directed",
    confidenceScore: "0.8000",
    verificationState: "unverified",
    primarySourceId: sourceA.id,
    privacyInheritance: "most_restrictive",
    privacyLevel: "personal_private",
    visibility: "shared",
    retentionPolicy: "user_controlled",
    createdById: adultA.id,
    updatedById: adultA.id,
  }).returning();

  await database.db.insert(dbm.lighthousePassportsTable).values({
    entityId: aPassportEntity.id,
    householdId: household.id,
    ownerUserId: adultA.id,
    userId: adultA.id,
    lighthousePassportId: adultA.lighthousePassportId!,
    identity: { fixture: true },
    privacyPreferences: { visibility: "private" },
  });

  return {
    adultA,
    adultB,
    outsider,
    sourceA,
    sourceB,
    aPrivate,
    aShared,
    aHousehold,
    aHiddenEndpoint,
    aPassportEntity,
    aVerifiedObservation,
    bPrivate,
    outsiderPrivate,
    activeGrant,
    safeRelationshipId: safeRelationship.id,
    hiddenRelationshipId: hiddenRelationship.id,
  };
}

function actor(user: UserRow) {
  return { userId: user.id, householdId: user.householdId };
}

function newPassportId() {
  return `lhp_${randomBytes(16).toString("hex")}`;
}

function hasPostgresCode(expectedCode: string) {
  return (error: unknown) => {
    const seen = new Set<object>();
    let current = error;
    while (current && typeof current === "object" && !seen.has(current)) {
      seen.add(current);
      if ("code" in current && current.code === expectedCode) return true;
      current = "cause" in current ? current.cause : undefined;
    }
    assert.fail(`Expected PostgreSQL error ${expectedCode}`);
  };
}
