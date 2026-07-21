import { defineConfig, devices } from "@playwright/test";

const apiPort = process.env.API_PORT ?? "5000";
const appPort = process.env.FAMILY_APP_PORT ?? "5173";
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://lighthouse_test_app:lighthouse_test_app_password@127.0.0.1:55432/lighthouse_test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${appPort}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: `${pnpm} --filter @workspace/api-server exec tsx src/index.ts`,
      url: `http://127.0.0.1:${apiPort}/api/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        DATABASE_URL: databaseUrl,
        NODE_ENV: "test",
        PORT: apiPort,
        SESSION_SECRET: process.env.SESSION_SECRET ?? "e2e-test-session-secret",
        LOG_LEVEL: "silent",
      },
    },
    {
      command: `${pnpm} --filter @workspace/family-app run dev`,
      url: `http://127.0.0.1:${appPort}/`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        NODE_ENV: "test",
        PORT: appPort,
        BASE_PATH: "/",
        API_PROXY_TARGET: `http://127.0.0.1:${apiPort}`,
      },
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
