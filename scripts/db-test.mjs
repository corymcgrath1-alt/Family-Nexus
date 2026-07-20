import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const containerName = process.env.TEST_POSTGRES_CONTAINER ?? "lighthouse-postgres-test";
const image = process.env.TEST_POSTGRES_IMAGE ?? "postgres:16-alpine";
const testUser = process.env.TEST_POSTGRES_USER ?? "lighthouse_test";
const testPassword = process.env.TEST_POSTGRES_PASSWORD ?? "lighthouse_test_password";
const testDatabase = process.env.TEST_POSTGRES_DB ?? "lighthouse_test";
const testHost = process.env.TEST_POSTGRES_HOST ?? "127.0.0.1";
const testPort = process.env.TEST_POSTGRES_PORT ?? "55432";
const defaultUrl = `postgres://${testUser}:${testPassword}@${testHost}:${testPort}/${testDatabase}`;

function databaseUrl() {
  return process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? defaultUrl;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: { ...process.env, ...options.env },
      stdio: options.input === undefined ? "inherit" : ["pipe", "inherit", "inherit"],
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

function assertTestDatabaseUrl(rawUrl) {
  if (process.env.ALLOW_NON_TEST_DATABASE === "true") return;

  const parsed = new URL(rawUrl);
  const databaseName = parsed.pathname.replace(/^\//, "");
  const localHost = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";

  if (!localHost || !/test/i.test(databaseName)) {
    throw new Error(
      [
        "Refusing to reset or migrate a non-test database.",
        `DATABASE_URL/TEST_DATABASE_URL resolved to ${parsed.hostname}/${databaseName}.`,
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
  const running = await runQuiet("docker", ["inspect", "-f", "{{.State.Running}}", containerName]);
  if (running) {
    await waitForPostgres();
    console.log(`Test PostgreSQL is already running at ${defaultUrl}`);
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
  console.log(`Test PostgreSQL is ready at ${defaultUrl}`);
}

async function down() {
  await runQuiet("docker", ["rm", "-f", containerName]);
  console.log(`Removed ${containerName}.`);
}

async function psql(rawUrl, sql) {
  if (usesDefaultDockerDatabase(rawUrl)) {
    await run(
      "docker",
      ["exec", "-i", containerName, "psql", "-v", "ON_ERROR_STOP=1", "-U", testUser, "-d", testDatabase],
      { input: sql },
    );
    return;
  }

  await run("psql", [rawUrl, "-v", "ON_ERROR_STOP=1"], { input: sql });
}

async function applySqlMigrations(rawUrl) {
  const migrationsDir = path.join(repoRoot, "lib", "db", "migrations");
  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();

  for (const file of files) {
    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    console.log(`Applying ${file}`);
    await psql(rawUrl, sql);
  }
}

async function migrate() {
  const rawUrl = databaseUrl();
  assertTestDatabaseUrl(rawUrl);
  if (usesDefaultDockerDatabase(rawUrl)) {
    await up();
  }
  await applySqlMigrations(rawUrl);
  console.log("Test database schema is migrated from SQL migrations.");
}

async function reset() {
  const rawUrl = databaseUrl();
  assertTestDatabaseUrl(rawUrl);
  if (usesDefaultDockerDatabase(rawUrl)) {
    await up();
  }
  await psql(rawUrl, "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  await migrate();
}

const command = process.argv[2];

try {
  if (command === "up") await up();
  else if (command === "down") await down();
  else if (command === "migrate") await migrate();
  else if (command === "reset") await reset();
  else if (command === "url") console.log(databaseUrl());
  else {
    console.error("Usage: node scripts/db-test.mjs <up|migrate|reset|down|url>");
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
