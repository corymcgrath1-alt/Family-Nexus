import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const playwrightCli = path.join(
  repoRoot,
  "node_modules",
  "@playwright",
  "test",
  "cli.js",
);
const migrationDatabaseUrl =
  process.env.TEST_DATABASE_MIGRATION_URL ??
  "postgres://lighthouse_test:lighthouse_test_password@127.0.0.1:55432/lighthouse_test";
const runtimeDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgres://lighthouse_test_app:lighthouse_test_app_password@127.0.0.1:55432/lighthouse_test";
const workerDatabaseUrl =
  process.env.TEST_CONNECTOR_WORKER_DATABASE_URL ??
  "postgres://lighthouse_test_worker:lighthouse_test_worker_password@127.0.0.1:55432/lighthouse_test";

function run(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: { ...process.env, ...env },
      stdio: "inherit",
      shell: process.platform === "win32" && command.toLowerCase().endsWith(".cmd"),
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

try {
  await run(process.execPath, ["scripts/db-test.mjs", "reset"], {
    TEST_DATABASE_MIGRATION_URL: migrationDatabaseUrl,
    TEST_DATABASE_URL: runtimeDatabaseUrl,
    TEST_CONNECTOR_WORKER_DATABASE_URL: workerDatabaseUrl,
  });
  await run(process.execPath, [playwrightCli, "test"], {
    DATABASE_URL: runtimeDatabaseUrl,
    TEST_DATABASE_MIGRATION_URL: migrationDatabaseUrl,
    TEST_DATABASE_URL: runtimeDatabaseUrl,
    NODE_ENV: "test",
    SESSION_SECRET: "e2e-test-session-secret",
    CONNECTOR_PROVIDER_MODE: "fake",
    CONNECTOR_ACTIVE_KEY_VERSION: "test-v1",
    CONNECTOR_CREDENTIAL_KEYS_JSON: JSON.stringify({ "test-v1": Buffer.alloc(32, 7).toString("base64") }),
    CONNECTOR_APP_ORIGIN: `http://127.0.0.1:${process.env.FAMILY_APP_PORT ?? "5173"}`,
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
