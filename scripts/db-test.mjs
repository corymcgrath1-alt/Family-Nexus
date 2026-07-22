import { spawn } from "node:child_process";
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

  await run("psql", [rawUrl, "-v", "ON_ERROR_STOP=1", ...variableArgs], {
    input: sql,
  });
}

async function applySqlMigrations(rawUrl) {
  const migrationsDir = path.join(repoRoot, "lib", "db", "migrations");
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    console.log(`Applying ${file}`);
    await psql(rawUrl, sql);
  }
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
    "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;",
  );
  await migrate();
}

const command = process.argv[2];

try {
  if (command === "up") await up();
  else if (command === "down") await down();
  else if (command === "migrate") await migrate();
  else if (command === "reset") await reset();
  else if (command === "url") console.log(runtimeDatabaseUrl());
  else if (command === "migration-url") console.log(migrationDatabaseUrl());
  else if (command === "worker-url") console.log(workerDatabaseUrl());
  else {
    console.error(
      "Usage: node scripts/db-test.mjs <up|migrate|reset|down|url|migration-url|worker-url>",
    );
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
