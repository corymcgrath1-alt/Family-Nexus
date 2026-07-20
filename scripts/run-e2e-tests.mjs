import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const playwright = path.join(repoRoot, "node_modules", ".bin", process.platform === "win32" ? "playwright.cmd" : "playwright");
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
  await run(playwright, ["test"], {
    DATABASE_URL: databaseUrl,
    TEST_DATABASE_URL: databaseUrl,
    NODE_ENV: "test",
    SESSION_SECRET: "e2e-test-session-secret",
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
