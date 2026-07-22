import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const containerName =
  process.env.TEST_POSTGRES_CONTAINER ?? "lighthouse-postgres-test";
const image = process.env.TEST_POSTGRES_IMAGE ?? "postgres:16-alpine";
const testUser = process.env.TEST_POSTGRES_USER ?? "lighthouse_test";
const testPassword =
  process.env.TEST_POSTGRES_PASSWORD ?? "lighthouse_test_password";
const runtimeUser =
  process.env.TEST_POSTGRES_RUNTIME_USER ?? "lighthouse_test_app";
const runtimePassword =
  process.env.TEST_POSTGRES_RUNTIME_PASSWORD ?? "lighthouse_test_app_password";
const workerUser =
  process.env.TEST_POSTGRES_WORKER_USER ?? "lighthouse_test_worker";
const workerPassword =
  process.env.TEST_POSTGRES_WORKER_PASSWORD ?? "lighthouse_test_worker_password";
const testDatabase = process.env.TEST_POSTGRES_DB ?? "lighthouse_test";
const testHost = process.env.TEST_POSTGRES_HOST ?? "127.0.0.1";
const testPort = process.env.TEST_POSTGRES_PORT ?? "55432";
const defaultMigrationUrl = `postgres://${testUser}:${testPassword}@${testHost}:${testPort}/${testDatabase}`;
const defaultRuntimeUrl = `postgres://${runtimeUser}:${runtimePassword}@${testHost}:${testPort}/${testDatabase}`;
const defaultWorkerUrl = `postgres://${workerUser}:${workerPassword}@${testHost}:${testPort}/${testDatabase}`;
const migrationLedgerSchema = "lighthouse_admin";
const migrationLedgerTable = `${migrationLedgerSchema}.schema_migrations`;

const legacyMigrationChecks = new Map([
  ["0000_initial_app.sql", {
    relations: ["session", "households", "users", "household_invites", "messages", "notifications", "user_experiences", "experience_states", "experience_profiles", "invitations", "calendar_events", "planning_tasks", "memories", "reflections"],
    indexes: ["IDX_session_expire", "messages_household_created_idx"],
  }],
  ["0001_lighthouse_core.sql", {
    relations: ["personal_vaults", "shared_spaces", "data_sources", "data_records", "consent_grants", "sharing_grants", "audit_events", "signal_definitions", "signal_observations", "library_items"],
    indexes: ["users_lighthouse_passport_id_uq", "library_items_owner_idx", "sharing_grants_resource_idx"],
    columns: [["users", "lighthouse_passport_id"]],
  }],
  ["0002_lighthouse_runtime_rls.sql", {
    roles: ["lighthouse_runtime"],
    functions: ["lighthouse_actor_user_id", "lighthouse_actor_household_id"],
    rlsRelations: ["personal_vaults", "shared_spaces", "data_sources", "data_records", "consent_grants", "sharing_grants", "audit_events", "signal_observations", "library_items"],
    policies: [["library_items", "library_items_read"], ["sharing_grants", "sharing_grants_read"]],
  }],
  ["0003_family_knowledge_graph.sql", {
    relations: ["knowledge_entity_types", "knowledge_relationship_types", "knowledge_sources", "knowledge_entities", "knowledge_entity_grants", "knowledge_entity_sources", "knowledge_entity_versions", "knowledge_relationships", "knowledge_relationship_versions", "knowledge_audit_events", "knowledge_memories", "knowledge_observations", "knowledge_insights", "knowledge_recommendations", "lighthouse_passports", "knowledge_extension_versions"],
    indexes: ["knowledge_entities_household_owner_status_idx", "knowledge_relationships_source_idx"],
    functions: ["lighthouse_guard_knowledge_entity_update", "lighthouse_validate_passport"],
    rlsRelations: ["knowledge_sources", "knowledge_entities", "knowledge_entity_grants", "knowledge_relationships", "lighthouse_passports"],
  }],
  ["0004_connector_platform.sql", {
    relations: ["connector_connections", "connector_consents", "connector_resource_selections", "connector_sync_checkpoints", "connector_sync_runs", "connector_source_objects", "connector_source_mappings", "connector_oauth_states", "connector_credentials", "connector_audit_events"],
    indexes: ["connector_connections_active_account_uq", "connector_source_objects_external_uq"],
    roles: ["lighthouse_connector_worker"],
    functions: ["lighthouse_put_connector_credential", "lighthouse_get_connector_credential", "lighthouse_claim_due_connector"],
    rlsRelations: ["connector_connections", "connector_consents", "connector_resource_selections", "connector_sync_checkpoints", "connector_sync_runs", "connector_source_objects", "connector_source_mappings", "connector_oauth_states", "connector_credentials", "connector_audit_events"],
    policies: [["connector_source_mappings", "connector_source_mappings_owner"]],
  }],
  ["0005_connector_phase2_review_fixes.sql", {
    columns: [
      ["connector_sync_checkpoints", "backfill_time_min"],
      ["connector_sync_checkpoints", "backfill_query_fingerprint"],
    ],
    functions: ["lighthouse_claim_due_connector"],
    policies: [["connector_source_mappings", "connector_source_mappings_owner"]],
  }],
]);

function migrationDatabaseUrl() {
  return (
    process.env.TEST_DATABASE_MIGRATION_URL ??
    process.env.DATABASE_MIGRATION_URL ??
    defaultMigrationUrl
  );
}

function runtimeDatabaseUrl() {
  return (
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    defaultRuntimeUrl
  );
}

function workerDatabaseUrl() {
  return process.env.TEST_CONNECTOR_WORKER_DATABASE_URL ?? process.env.CONNECTOR_WORKER_DATABASE_URL ?? defaultWorkerUrl;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: { ...process.env, ...options.env },
      stdio:
        options.input === undefined
          ? "inherit"
          : ["pipe", "inherit", "inherit"],
      shell: false,
    });

    if (options.input !== undefined) {
      child.stdin.end(options.input);
    }

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

function runCapture(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: { ...process.env, ...options.env },
      stdio: ["pipe", "pipe", "inherit"],
      shell: false,
    });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stdin.end(options.input ?? "");
    child.on("error", reject);
    child.on("exit", (code) => code === 0
      ? resolve(output.trim())
      : reject(new Error(`${command} ${args.join(" ")} exited with ${code}`)));
  });
}

async function runQuiet(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: "ignore",
      shell: false,
    });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

function assertTestDatabaseUrl(rawUrl, variableName) {
  if (process.env.ALLOW_NON_TEST_DATABASE === "true") return;

  const parsed = new URL(rawUrl);
  const databaseName = parsed.pathname.replace(/^\//, "");
  const localHost =
    parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";

  if (!localHost || !/test/i.test(databaseName)) {
    throw new Error(
      [
        "Refusing to reset or migrate a non-test database.",
        `${variableName} resolved to ${parsed.hostname}/${databaseName}.`,
        "Use a local database whose name contains 'test', or set ALLOW_NON_TEST_DATABASE=true intentionally.",
      ].join(" "),
    );
  }
}

function usesDefaultDockerDatabase(rawUrl) {
  const parsed = new URL(rawUrl);
  return (
    (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") &&
    (parsed.port || "5432") === testPort &&
    parsed.username === testUser &&
    parsed.pathname.replace(/^\//, "") === testDatabase
  );
}

async function waitForPostgres() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (
      await runQuiet("docker", [
        "exec",
        containerName,
        "pg_isready",
        "-U",
        testUser,
        "-d",
        testDatabase,
      ])
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("Timed out waiting for test PostgreSQL to become ready.");
}

async function up() {
  const running = await runQuiet("docker", [
    "inspect",
    "-f",
    "{{.State.Running}}",
    containerName,
  ]);
  if (running) {
    await waitForPostgres();
    console.log(
      `Test PostgreSQL is already running on ${testHost}:${testPort}/${testDatabase}.`,
    );
    return;
  }

  const exists = await runQuiet("docker", ["inspect", containerName]);
  if (exists) {
    await run("docker", ["start", containerName]);
  } else {
    await run("docker", [
      "run",
      "--name",
      containerName,
      "-e",
      `POSTGRES_USER=${testUser}`,
      "-e",
      `POSTGRES_PASSWORD=${testPassword}`,
      "-e",
      `POSTGRES_DB=${testDatabase}`,
      "-p",
      `${testHost}:${testPort}:5432`,
      "-d",
      image,
    ]);
  }

  await waitForPostgres();
  console.log(
    `Test PostgreSQL is ready on ${testHost}:${testPort}/${testDatabase}.`,
  );
}

async function down() {
  await runQuiet("docker", ["rm", "-f", containerName]);
  console.log(`Removed ${containerName}.`);
}

async function psql(rawUrl, sql, variables = {}) {
  const variableArgs = Object.entries(variables).flatMap(([name, value]) => [
    "-v",
    `${name}=${value}`,
  ]);
  if (usesDefaultDockerDatabase(rawUrl)) {
    await run(
      "docker",
      [
        "exec",
        "-i",
        containerName,
        "psql",
        "-X",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        testUser,
        "-d",
        testDatabase,
        ...variableArgs,
      ],
      { input: sql },
    );
    return;
  }

  await run("psql", [rawUrl, "-X", "-v", "ON_ERROR_STOP=1", ...variableArgs], {
    input: sql,
  });
}

async function psqlCapture(rawUrl, sql, variables = {}) {
  const variableArgs = Object.entries(variables).flatMap(([name, value]) => ["-v", `${name}=${value}`]);
  if (usesDefaultDockerDatabase(rawUrl)) {
    return runCapture("docker", [
      "exec", "-i", containerName, "psql", "-X", "-A", "-t", "-q",
      "-v", "ON_ERROR_STOP=1", "-U", testUser, "-d", testDatabase, ...variableArgs,
    ], { input: sql });
  }
  return runCapture("psql", [rawUrl, "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", ...variableArgs], { input: sql });
}

function migrationChecksum(sql) {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

async function migrationFiles(maximumFile) {
  const migrationsDir = path.join(repoRoot, "lib", "db", "migrations");
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .filter((file) => !maximumFile || file.localeCompare(maximumFile) <= 0)
    .sort();
  return Promise.all(files.map(async (file) => {
    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    return { file, sql, checksum: migrationChecksum(sql) };
  }));
}

async function ensureMigrationLedger(rawUrl) {
  await psql(rawUrl, `
CREATE SCHEMA IF NOT EXISTS ${migrationLedgerSchema};
REVOKE ALL ON SCHEMA ${migrationLedgerSchema} FROM PUBLIC;
CREATE TABLE IF NOT EXISTS ${migrationLedgerTable} (
  migration_id text PRIMARY KEY,
  checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
  applied_at timestamp with time zone NOT NULL DEFAULT now()
);
REVOKE ALL ON ${migrationLedgerTable} FROM PUBLIC;
`);
}

async function appliedMigrations(rawUrl) {
  const output = await psqlCapture(rawUrl, `SELECT migration_id || E'\\t' || checksum FROM ${migrationLedgerTable} ORDER BY migration_id;`);
  return new Map(output ? output.split(/\r?\n/).map((line) => {
    const [migrationId, checksum] = line.split("\t");
    return [migrationId, checksum];
  }) : []);
}

function bootstrapCheckSql(check) {
  const clauses = [];
  for (const relation of check.relations ?? []) clauses.push(`EXISTS (SELECT 1 FROM pg_class row JOIN pg_namespace ns ON ns.oid = row.relnamespace WHERE ns.nspname = 'public' AND row.relname = '${relation}' AND row.relkind IN ('r', 'p'))`);
  for (const index of check.indexes ?? []) clauses.push(`EXISTS (SELECT 1 FROM pg_class row JOIN pg_namespace ns ON ns.oid = row.relnamespace WHERE ns.nspname = 'public' AND row.relname = '${index}' AND row.relkind = 'i')`);
  for (const role of check.roles ?? []) clauses.push(`EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}')`);
  for (const fn of check.functions ?? []) clauses.push(`EXISTS (SELECT 1 FROM pg_proc fn JOIN pg_namespace ns ON ns.oid = fn.pronamespace WHERE ns.nspname = 'public' AND fn.proname = '${fn}')`);
  for (const [table, column] of check.columns ?? []) clauses.push(`EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${table}' AND column_name = '${column}')`);
  for (const relation of check.rlsRelations ?? []) clauses.push(`EXISTS (SELECT 1 FROM pg_class row JOIN pg_namespace ns ON ns.oid = row.relnamespace WHERE ns.nspname = 'public' AND row.relname = '${relation}' AND row.relrowsecurity)`);
  for (const [table, policy] of check.policies ?? []) clauses.push(`EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = '${table}' AND policyname = '${policy}')`);
  return `SELECT (${clauses.join(" AND ")});`;
}

async function bootstrapLegacyMigrations(rawUrl, migrations, applied) {
  if (applied.size > 0) return;
  const knownRelations = await psqlCapture(rawUrl, `
SELECT count(*)
FROM pg_class row
JOIN pg_namespace ns ON ns.oid = row.relnamespace
WHERE ns.nspname = 'public'
  AND row.relkind IN ('r', 'p')
`);
  if (Number(knownRelations) === 0) return;

  let firstMissing = -1;
  const verifiedPrefix = [];
  for (let index = 0; index < migrations.length; index += 1) {
    const migration = migrations[index];
    const check = legacyMigrationChecks.get(migration.file);
    if (!check) {
      firstMissing = index;
      break;
    }
    const verified = await psqlCapture(rawUrl, bootstrapCheckSql(check)) === "t";
    if (!verified) {
      firstMissing = index;
      break;
    }
    verifiedPrefix.push(migration);
  }

  if (firstMissing === 0) {
    throw new Error("Existing database schema does not match migration 0000; refusing to bootstrap migration history.");
  }
  if (firstMissing > 0) {
    for (const migration of migrations.slice(firstMissing + 1)) {
      const check = legacyMigrationChecks.get(migration.file);
      if (check && await psqlCapture(rawUrl, bootstrapCheckSql(check)) === "t") {
        throw new Error(`Existing database has ${migration.file} markers after an unverified migration; refusing non-contiguous bootstrap.`);
      }
    }
  }

  if (verifiedPrefix.length > 0) {
    const values = verifiedPrefix
      .map((migration) => `('${migration.file}', '${migration.checksum}')`)
      .join(",\n  ");
    await psql(rawUrl, `
BEGIN;
INSERT INTO ${migrationLedgerTable} (migration_id, checksum)
VALUES
  ${values};
COMMIT;
`);
    for (const migration of verifiedPrefix) {
      applied.set(migration.file, migration.checksum);
      console.log(`Recorded verified legacy migration ${migration.file}.`);
    }
  }
}

async function applyOneMigration(rawUrl, migration, applied) {
  const recordedChecksum = applied.get(migration.file);
  if (recordedChecksum) {
    if (recordedChecksum !== migration.checksum) {
      throw new Error(`Applied migration checksum mismatch for ${migration.file}. Historical migration files must not be edited.`);
    }
    console.log(`Already applied ${migration.file}.`);
    return;
  }

  console.log(`Applying ${migration.file}`);
  await psql(rawUrl, `
BEGIN;
${migration.sql}
INSERT INTO ${migrationLedgerTable} (migration_id, checksum)
VALUES (:'migration_id', :'checksum');
COMMIT;
`, { migration_id: migration.file, checksum: migration.checksum });
  applied.set(migration.file, migration.checksum);
}

async function applySqlMigrations(rawUrl, maximumFile) {
  const migrations = await migrationFiles(maximumFile);
  await ensureMigrationLedger(rawUrl);
  const applied = await appliedMigrations(rawUrl);
  const currentFiles = new Set(migrations.map((migration) => migration.file));
  for (const migrationId of applied.keys()) {
    if (!currentFiles.has(migrationId)) throw new Error(`Migration history contains unknown migration ${migrationId}.`);
  }
  await bootstrapLegacyMigrations(rawUrl, migrations, applied);

  let encounteredGap = false;
  for (const migration of migrations) {
    if (!applied.has(migration.file)) encounteredGap = true;
    else if (encounteredGap) throw new Error(`Migration history is non-contiguous at ${migration.file}.`);
    await applyOneMigration(rawUrl, migration, applied);
  }
  await ensureMigrationLedger(rawUrl);
}

async function ensureRuntimeLogin(migrationUrl, runtimeUrl) {
  const migration = new URL(migrationUrl);
  const runtime = new URL(runtimeUrl);
  const migrationDatabase = migration.pathname.replace(/^\//, "");
  const runtimeDatabase = runtime.pathname.replace(/^\//, "");
  const normalizeHost = (hostname) =>
    hostname === "localhost" || hostname === "127.0.0.1"
      ? "localhost"
      : hostname;

  assertTestDatabaseUrl(runtimeUrl, "TEST_DATABASE_URL/DATABASE_URL");
  if (
    normalizeHost(migration.hostname) !== normalizeHost(runtime.hostname) ||
    (migration.port || "5432") !== (runtime.port || "5432") ||
    migrationDatabase !== runtimeDatabase
  ) {
    throw new Error(
      "Migration and runtime URLs must target the same isolated test database.",
    );
  }
  if (migration.username === runtime.username) {
    throw new Error(
      "The test runtime database role must differ from the migration role.",
    );
  }
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(runtime.username)) {
    throw new Error(
      "The test runtime database role must be a valid PostgreSQL identifier.",
    );
  }
  if (!runtime.password) {
    throw new Error("The test runtime database URL must include a password.");
  }

  const sql = String.raw`
SELECT format(
  'CREATE ROLE %I LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'runtime_role',
  :'runtime_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'runtime_role')
\gexec

SELECT format(
  'ALTER ROLE %I WITH LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'runtime_role',
  :'runtime_password'
)
\gexec

SELECT format('GRANT lighthouse_runtime TO %I', :'runtime_role')
\gexec
`;

  await psql(migrationUrl, sql, {
    runtime_role: runtime.username,
    runtime_password: runtime.password,
  });
}

async function ensureWorkerLogin(migrationUrl, runtimeUrl, workerUrl) {
  const migration = new URL(migrationUrl);
  const runtime = new URL(runtimeUrl);
  const worker = new URL(workerUrl);
  assertTestDatabaseUrl(workerUrl, "TEST_CONNECTOR_WORKER_DATABASE_URL/CONNECTOR_WORKER_DATABASE_URL");
  if (
    (migration.hostname === "localhost" ? "127.0.0.1" : migration.hostname) !== (worker.hostname === "localhost" ? "127.0.0.1" : worker.hostname) ||
    (migration.port || "5432") !== (worker.port || "5432") ||
    migration.pathname !== worker.pathname
  ) throw new Error("Migration and connector worker URLs must target the same isolated test database.");
  if ([migration.username, runtime.username].includes(worker.username)) throw new Error("The connector worker database role must be distinct.");
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(worker.username) || !worker.password) throw new Error("The connector worker URL must contain a valid role and password.");

  const sql = String.raw`
SELECT format(
  'CREATE ROLE %I LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'worker_role', :'worker_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'worker_role')
\gexec
SELECT format(
  'ALTER ROLE %I WITH LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'worker_role', :'worker_password'
)
\gexec
SELECT format('GRANT lighthouse_runtime, lighthouse_connector_worker TO %I', :'worker_role')
\gexec
`;
  await psql(migrationUrl, sql, { worker_role: worker.username, worker_password: worker.password });
}

async function migrate() {
  const migrationUrl = migrationDatabaseUrl();
  const runtimeUrl = runtimeDatabaseUrl();
  assertTestDatabaseUrl(
    migrationUrl,
    "TEST_DATABASE_MIGRATION_URL/DATABASE_MIGRATION_URL",
  );
  if (usesDefaultDockerDatabase(migrationUrl)) {
    await up();
  }
  await applySqlMigrations(migrationUrl);
  await ensureRuntimeLogin(migrationUrl, runtimeUrl);
  await ensureWorkerLogin(migrationUrl, runtimeUrl, workerDatabaseUrl());
  console.log("Test database schema, restricted runtime role, and connector worker role are ready.");
}

async function reset() {
  const migrationUrl = migrationDatabaseUrl();
  assertTestDatabaseUrl(
    migrationUrl,
    "TEST_DATABASE_MIGRATION_URL/DATABASE_MIGRATION_URL",
  );
  if (usesDefaultDockerDatabase(migrationUrl)) {
    await up();
  }
  await psql(
    migrationUrl,
    `DROP SCHEMA IF EXISTS public CASCADE;
DROP SCHEMA IF EXISTS ${migrationLedgerSchema} CASCADE;
CREATE SCHEMA public;`,
  );
  await migrate();
}

async function verifyMigrationRunner() {
  const migrationUrl = migrationDatabaseUrl();
  assertTestDatabaseUrl(migrationUrl, "TEST_DATABASE_MIGRATION_URL/DATABASE_MIGRATION_URL");
  if (usesDefaultDockerDatabase(migrationUrl)) await up();

  await psql(migrationUrl, `DROP SCHEMA IF EXISTS public CASCADE;
DROP SCHEMA IF EXISTS ${migrationLedgerSchema} CASCADE;
CREATE SCHEMA public;`);

  const legacyMigrations = await migrationFiles("0003_family_knowledge_graph.sql");
  for (const migration of legacyMigrations) {
    await psql(migrationUrl, `BEGIN;\n${migration.sql}\nCOMMIT;`);
  }
  await applySqlMigrations(migrationUrl);

  const allMigrations = await migrationFiles();
  const ledgerCount = Number(await psqlCapture(migrationUrl, `SELECT count(*) FROM ${migrationLedgerTable};`));
  if (ledgerCount !== allMigrations.length) {
    throw new Error(`Upgrade verification expected ${allMigrations.length} ledger rows but found ${ledgerCount}.`);
  }
  if (await psqlCapture(migrationUrl, "SELECT to_regclass('public.connector_connections') IS NOT NULL;") !== "t") {
    throw new Error("Upgrade verification did not apply the connector migration.");
  }

  const failedMigrationSql = "CREATE TABLE public.migration_retry_probe (id integer PRIMARY KEY); SELECT 1 / 0;";
  const failedMigration = {
    file: "9998_transaction_retry_probe.sql",
    sql: failedMigrationSql,
    checksum: migrationChecksum(failedMigrationSql),
  };
  const applied = await appliedMigrations(migrationUrl);
  let failedAsExpected = false;
  try {
    await applyOneMigration(migrationUrl, failedMigration, applied);
  } catch {
    failedAsExpected = true;
  }
  if (!failedAsExpected) throw new Error("Intentional migration failure unexpectedly succeeded.");
  const failedState = await psqlCapture(migrationUrl, `
SELECT to_regclass('public.migration_retry_probe') IS NULL
  AND NOT EXISTS (SELECT 1 FROM ${migrationLedgerTable} WHERE migration_id = '9998_transaction_retry_probe.sql');
`);
  if (failedState !== "t") throw new Error("Failed migration left partial schema or ledger state.");

  const retrySql = "CREATE TABLE public.migration_retry_probe (id integer PRIMARY KEY);";
  const retryMigration = { file: failedMigration.file, sql: retrySql, checksum: migrationChecksum(retrySql) };
  await applyOneMigration(migrationUrl, retryMigration, applied);
  if (await psqlCapture(migrationUrl, "SELECT to_regclass('public.migration_retry_probe') IS NOT NULL;") !== "t") {
    throw new Error("Retry migration did not apply after the rolled-back failure.");
  }
  let checksumRejected = false;
  try {
    await applyOneMigration(migrationUrl, { ...retryMigration, sql: `${retrySql}\n-- changed`, checksum: migrationChecksum(`${retrySql}\n-- changed`) }, applied);
  } catch (error) {
    checksumRejected = error instanceof Error && /checksum mismatch/.test(error.message);
  }
  if (!checksumRejected) throw new Error("Applied migration checksum drift was not rejected.");

  await psql(migrationUrl, `BEGIN;
DROP TABLE public.migration_retry_probe;
DELETE FROM ${migrationLedgerTable} WHERE migration_id = '9998_transaction_retry_probe.sql';
COMMIT;`);
  console.log("Migration upgrade, transactional rollback/retry, and checksum verification passed.");
}

const command = process.argv[2];

try {
  if (command === "up") await up();
  else if (command === "down") await down();
  else if (command === "migrate") await migrate();
  else if (command === "reset") await reset();
  else if (command === "verify-migrations") await verifyMigrationRunner();
  else if (command === "url") console.log(runtimeDatabaseUrl());
  else if (command === "migration-url") console.log(migrationDatabaseUrl());
  else if (command === "worker-url") console.log(workerDatabaseUrl());
  else {
    console.error(
      "Usage: node scripts/db-test.mjs <up|migrate|reset|verify-migrations|down|url|migration-url|worker-url>",
    );
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
