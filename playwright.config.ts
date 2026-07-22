import { defineConfig, devices } from "@playwright/test";

const apiPort = process.env.API_PORT ?? "5000";
const appPort = process.env.FAMILY_APP_PORT ?? "5173";
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
      command: "node artifacts/api-server/node_modules/tsx/dist/cli.mjs artifacts/api-server/src/index.ts",
      url: `http://127.0.0.1:${apiPort}/api/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        DATABASE_URL: databaseUrl,
        NODE_ENV: "test",
        PORT: apiPort,
        SESSION_SECRET: process.env.SESSION_SECRET ?? "e2e-test-session-secret",
        LOG_LEVEL: "silent",
        CONNECTOR_PROVIDER_MODE: process.env.CONNECTOR_PROVIDER_MODE ?? "fake",
        CONNECTOR_ACTIVE_KEY_VERSION: process.env.CONNECTOR_ACTIVE_KEY_VERSION ?? "test-v1",
        CONNECTOR_CREDENTIAL_KEYS_JSON: process.env.CONNECTOR_CREDENTIAL_KEYS_JSON ?? JSON.stringify({ "test-v1": Buffer.alloc(32, 7).toString("base64") }),
        CONNECTOR_APP_ORIGIN: process.env.CONNECTOR_APP_ORIGIN ?? `http://127.0.0.1:${appPort}`,
      },
    },
    {
      command: "node artifacts/family-app/node_modules/vite/bin/vite.js --config artifacts/family-app/vite.config.ts --host 0.0.0.0",
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
