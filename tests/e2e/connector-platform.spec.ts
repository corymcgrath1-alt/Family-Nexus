import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const password = "CorrectHorseBattery1!";

test("Google Calendar consent, sync, correction, and revocation stay private to Adult A", async ({ browser, page }) => {
  const suffix = Date.now();
  const aEmail = `connector.a.${suffix}@example.test`;
  const bEmail = `connector.b.${suffix}@example.test`;
  await register(page, `Connector E2E ${suffix}`, "Connector Adult A", aEmail);
  const invite = await page.context().request.post("/api/auth/invite", { data: { email: bEmail } });
  const { token } = await invite.json() as { token: string };
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await join(pageB, token, "Connector Adult B", bEmail);

  await connectAndInitialSync(page);

  await page.goto("/library");
  await page.getByLabel("Search Library").fill("Provider planning block");
  await expect(page.getByTestId("library-selected-detail")).toContainText("Provider planning block");
  await expect(page.getByTestId("library-selected-detail")).toContainText("private");
  await page.getByLabel("Search Library").fill("UNSELECTED_CALENDAR_PRIVATE_EVENT");
  await expect(page.getByText("UNSELECTED_CALENDAR_PRIVATE_EVENT")).toHaveCount(0);

  await page.goto("/connectors");
  await runSyncAndExpect(page, "0 created");
  const connectionId = await currentConnectionId(page.context());
  await applyFakeScenario(page.context(), connectionId, "incremental_change");
  await runSyncAndExpect(page, "1 created, 1 updated, 1 archived");

  await page.goto("/library");
  await page.getByLabel("Search Library").fill("Provider planning block updated");
  await expect(page.getByTestId("library-selected-detail")).toContainText("Provider planning block updated");
  const userCorrection = `USER_CORRECTED_CALENDAR_BODY_${suffix}`;
  await page.getByLabel("Correction body").fill(userCorrection);
  await page.getByRole("button", { name: "Save correction" }).click();
  await expect(page.getByTestId("library-selected-body")).toContainText(userCorrection);

  await applyFakeScenario(page.context(), connectionId, "provider_update");
  await page.goto("/connectors");
  await runSyncAndExpect(page, "1 updated");
  await page.goto("/library");
  await page.getByLabel("Search Library").fill("Provider attempted another overwrite");
  await expect(page.getByTestId("library-selected-body")).toContainText(userCorrection);
  await expect(page.getByTestId("library-selected-body")).not.toContainText("Provider attempted another body overwrite");

  await page.goto("/connectors");
  await page.getByRole("button", { name: "Pause sync" }).click();
  await expect(page.getByText("paused", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sync now" })).toBeDisabled();
  const pausedSync = await page.context().request.post(`/api/connectors/connections/${connectionId}/sync`);
  expect(pausedSync.status()).toBe(409);
  await page.getByRole("button", { name: "Resume sync" }).click();
  await expect(page.getByText("active", { exact: true })).toBeVisible();

  await pageB.goto("/connectors");
  await expect(pageB.getByText("owner@fake.google.test")).toHaveCount(0);
  await expect(pageB.getByRole("button", { name: "Authorize Google" })).toBeVisible();
  const bConnections = await pageB.context().request.get("/api/connectors/connections");
  expect(await bConnections.json()).toEqual([]);
  for (const endpoint of [
    `/api/connectors/connections/${connectionId}`,
    `/api/connectors/connections/${connectionId}/resources`,
    `/api/connectors/connections/${connectionId}/sync-runs`,
  ]) expect((await pageB.context().request.get(endpoint)).status()).toBe(404);
  expect((await pageB.context().request.post(`/api/connectors/connections/${connectionId}/sync`)).status()).toBe(404);
  expect((await pageB.context().request.post(`/api/connectors/connections/${connectionId}/revoke`, { data: { disposition: "delete" } })).status()).toBe(404);
  await pageB.goto("/library");
  await pageB.getByLabel("Search Library").fill("Provider attempted another overwrite");
  await expect(pageB.getByText("Provider attempted another overwrite")).toHaveCount(0);
  await expect(pageB.getByText(userCorrection)).toHaveCount(0);

  await page.goto("/connectors");
  await page.getByRole("button", { name: "Revoke connection" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("User-corrected, detached, or legally held records are not silently deleted.");
  await page.getByRole("radio", { name: /Retain imported records/ }).check();
  await page.getByRole("button", { name: "Revoke and apply choice" }).click();
  await expect(page.getByRole("status")).toContainText("No later synchronization can run");
  await expect(page.getByText("revoked", { exact: true })).toBeVisible();
  expect((await page.context().request.post(`/api/connectors/connections/${connectionId}/sync`)).status()).toBe(409);
  await page.goto("/library");
  await page.getByLabel("Search Library").fill("Provider attempted another overwrite");
  await expect(page.getByTestId("library-selected-body")).toContainText(userCorrection);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Connectors").click();
  await expect(page).toHaveURL(/\/connectors/);
  await expect(page.getByRole("heading", { name: "Connectors" })).toBeVisible();
  await contextB.close();
});

test("permanent connector revocation removes eligible imported records", async ({ page }) => {
  const suffix = Date.now();
  await register(page, `Deletion E2E ${suffix}`, "Deletion Adult", `connector.delete.${suffix}@example.test`);
  await connectAndInitialSync(page);
  const connectionId = await currentConnectionId(page.context());
  const before = await page.context().request.get("/api/library/items?q=Provider");
  const imported = await before.json() as Array<{ id: number; title: string }>;
  expect(imported.length).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Revoke connection" }).click();
  await page.getByRole("radio", { name: /Delete eligible imported records/ }).check();
  await page.getByRole("button", { name: "Revoke and apply choice" }).click();
  await expect(page.getByText("revoked", { exact: true })).toBeVisible();
  expect((await page.context().request.post(`/api/connectors/connections/${connectionId}/sync`)).status()).toBe(409);
  for (const item of imported) {
    expect((await page.context().request.get(`/api/library/items/${item.id}`)).status()).toBe(404);
  }
  const after = await page.context().request.get("/api/library/items?q=Provider");
  expect(await after.json()).toEqual([]);
});

async function connectAndInitialSync(page: Page) {
  await page.goto("/connectors");
  await page.getByRole("button", { name: "Authorize Google" }).click();
  await expect(page.getByRole("heading", { name: "Fake Google Calendar authorization" })).toBeVisible();
  await page.getByRole("button", { name: "Allow read-only calendar access" }).click();
  await expect(page).toHaveURL(/\/connectors\?.*oauth=authorized/);
  await expect(page.getByText("owner@fake.google.test")).toBeVisible();
  await page.getByRole("button", { name: "Discover" }).click();
  await expect(page.getByText("Nothing is selected automatically")).toBeVisible();
  await expect(page.getByText("Personal", { exact: true })).toBeVisible();
  await expect(page.getByText("Other calendar", { exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: /Personal/ }).check();
  await page.getByRole("button", { name: "Save calendar selection" }).click();
  await expect(page.getByText("Confirm Lighthouse consent to activate imports")).toBeVisible();
  await page.getByRole("checkbox", { name: /I understand the purpose/ }).check();
  await page.getByRole("button", { name: "Confirm Lighthouse consent" }).click();
  await expect(page.getByText("connection is ready to sync", { exact: false })).toBeVisible();
  await runSyncAndExpect(page, "2 created");
}

async function runSyncAndExpect(page: Page, expected: string) {
  const syncButton = page.getByRole("button", { name: "Sync now" });
  const responsePromise = page.waitForResponse((response) => {
    const path = new URL(response.url()).pathname;
    return response.request().method() === "POST"
      && /^\/api\/connectors\/connections\/[^/]+\/sync$/.test(path);
  });
  await syncButton.click();
  expect((await responsePromise).status()).toBe(202);
  await expect(syncButton).toBeEnabled({ timeout: 30_000 });
  await expect(page.getByRole("status")).toContainText(expected);
}

async function currentConnectionId(context: BrowserContext): Promise<string> {
  const response = await context.request.get("/api/connectors/connections");
  expect(response.status()).toBe(200);
  const connections = await response.json() as Array<{ id: string; state: string }>;
  expect(connections.length).toBeGreaterThan(0);
  return connections.at(-1)!.id;
}

async function applyFakeScenario(context: BrowserContext, connectionId: string, scenario: string) {
  const response = await context.request.post(`/api/connectors/connections/${connectionId}/fake-scenario`, { data: { scenario } });
  expect(response.status()).toBe(204);
}

async function register(page: Page, householdName: string, displayName: string, email: string) {
  await page.goto("/register");
  await page.getByLabel("Household name").fill(householdName);
  await page.getByLabel("Your name").fill(displayName);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create household" }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function join(page: Page, token: string, displayName: string, email: string) {
  await page.goto(`/join/${token}`);
  await page.getByLabel("Your name").fill(displayName);
  await expect(page.getByLabel("Email")).toHaveValue(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Join household" }).click();
  await expect(page).toHaveURL(/\/$/);
}
