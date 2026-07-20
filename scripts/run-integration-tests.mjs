import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://lighthouse_test:lighthouse_test_password@127.0.0.1:55432/lighthouse_test";

function run(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: { ...process.env, ...env },
      stdio: "inherit",
      shell: false,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

try {
  await run(process.execPath, ["scripts/db-test.mjs", "reset"], {
    TEST_DATABASE_URL: databaseUrl,
  });
  await run(
    pnpm,
    ["--filter", "@workspace/api-server", "exec", "tsx", "src/lib/library-auth.integration.test.ts"],
    {
      DATABASE_URL: databaseUrl,
      NODE_ENV: "test",
      SESSION_SECRET: "integration-test-session-secret",
    },
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
