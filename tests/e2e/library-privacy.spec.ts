import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const password = "CorrectHorseBattery1!";

test("Family Library private, shared, household, and revoked access stay bounded", async ({ browser, page }) => {
  const suffix = Date.now();
  const aEmail = `adult.a.e2e.${suffix}@example.test`;
  const bEmail = `adult.b.e2e.${suffix}@example.test`;
  const privateTitle = `E2E_PRIVATE_TITLE_${suffix}`;
  const privateBody = `E2E_PRIVATE_BODY_${suffix}`;
  const householdTitle = `E2E_HOUSEHOLD_TITLE_${suffix}`;
  const householdBody = `E2E_HOUSEHOLD_BODY_${suffix}`;
  const bPrivateTitle = `E2E_B_PRIVATE_TITLE_${suffix}`;
  const bPrivateBody = `E2E_B_PRIVATE_BODY_${suffix}`;
  const correctedBody = `E2E_CORRECTED_BODY_${suffix}`;

  await registerAdultA(page, {
    householdName: `E2E Household ${suffix}`,
    displayName: "Adult A E2E",
    email: aEmail,
  });

  const invite = await page.context().request.post("/api/auth/invite", {
    data: { email: bEmail },
  });
  expect(invite.status()).toBe(201);
  const { token } = (await invite.json()) as { token: string };

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await joinAdultB(pageB, token, { displayName: "Adult B E2E", email: bEmail });

  await page.goto("/library");
  await createLibraryItem(page, {
    title: privateTitle,
    body: privateBody,
    access: "Private",
  });
  const privateId = await lookupLibraryItemId(page.context(), privateTitle);

  await pageB.goto("/library");
  await expect(pageB.getByText(privateTitle)).toHaveCount(0);
  await pageB.getByLabel("Search Library").fill(privateTitle);
  await expect(pageB.getByText(privateTitle)).toHaveCount(0);

  await assertApiNotFound(pageB.context(), `/api/library/items/${privateId}`, [privateTitle, privateBody]);
  await assertApiNotFound(pageB.context(), `/api/library/items/${privateId}/audit`, [privateTitle, privateBody]);
  await assertApiNotFound(pageB.context(), `/api/library/items/${privateId}/export`, [privateTitle, privateBody]);

  await pageB.goto(`/api/library/items/${privateId}`);
  await expect(pageB.locator("body")).toContainText("Not found");
  await expect(pageB.locator("body")).not.toContainText(privateTitle);
  await pageB.goto("/library");

  await page.bringToFront();
  await page.goto("/library");
  await page.getByLabel("Search Library").fill(privateTitle);
  await expect(page.getByTestId("library-selected-detail")).toContainText(privateTitle);
  await page.getByLabel("Share with adult").selectOption({ label: "Adult B E2E" });
  await page.getByRole("button", { name: "Share" }).click();
  await expect(page.getByTestId("library-active-grants").getByText("Adult B E2E")).toBeVisible();

  await pageB.bringToFront();
  await pageB.goto("/library");
  await pageB.getByLabel("Search Library").fill(privateTitle);
  await expect(pageB.getByTestId("library-selected-detail")).toContainText(privateTitle);
  await expect(pageB.getByTestId("library-selected-body")).toContainText(privateBody);
  await expect(pageB.getByLabel("Export JSON")).toHaveCount(0);
  await expect(pageB.getByLabel("Archive item")).toHaveCount(0);
  await expect(pageB.getByLabel("Delete item")).toHaveCount(0);
  await expect(pageB.getByRole("button", { name: "Save correction" })).toHaveCount(0);
  await expect(pageB.getByLabel("Share with adult")).toHaveCount(0);

  await assertApiNotFound(pageB.context(), `/api/library/items/${privateId}/export`, [privateBody]);
  await assertMutationDenied(pageB.context(), privateId);

  await page.bringToFront();
  await page.getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByText("No active sharing grants.")).toBeVisible();

  await pageB.bringToFront();
  await expect(pageB.getByText(privateBody)).toHaveCount(0, { timeout: 10_000 });
  await pageB.goto("/library");
  await pageB.getByLabel("Search Library").fill(privateTitle);
  await expect(pageB.getByText(privateTitle)).toHaveCount(0);
  await assertApiNotFound(pageB.context(), `/api/library/items/${privateId}`, [privateTitle, privateBody]);

  await page.bringToFront();
  await page.getByLabel("Search Library").fill("");
  await createLibraryItem(page, {
    title: householdTitle,
    body: householdBody,
    access: "Household",
  });
  const householdId = await lookupLibraryItemId(page.context(), householdTitle);

  await pageB.bringToFront();
  await pageB.goto("/library");
  await pageB.getByLabel("Search Library").fill(householdTitle);
  await expect(pageB.getByTestId("library-selected-detail")).toContainText(householdTitle);
  await expect(pageB.getByTestId("library-selected-body")).toContainText(householdBody);
  const householdDirect = await pageB.context().request.get(`/api/library/items/${householdId}`);
  expect(householdDirect.status()).toBe(200);

  await pageB.getByLabel("Search Library").fill("");
  await createLibraryItem(pageB, {
    title: bPrivateTitle,
    body: bPrivateBody,
    access: "Private",
  });
  const bPrivateId = await lookupLibraryItemId(pageB.context(), bPrivateTitle);

  await page.bringToFront();
  await page.goto("/library");
  await page.getByLabel("Search Library").fill(bPrivateTitle);
  await expect(page.getByText(bPrivateTitle)).toHaveCount(0);
  await assertApiNotFound(page.context(), `/api/library/items/${bPrivateId}`, [bPrivateTitle, bPrivateBody]);

  await page.getByLabel("Search Library").fill(privateTitle);
  await expect(page.getByTestId("library-selected-detail")).toContainText(privateTitle);
  await expect(page.getByTestId("library-selected-body")).toContainText(privateBody);
  await expect(page.getByTestId("library-selected-detail")).toContainText("Library sharing revoked");

  await page.getByLabel("Correction body").fill(correctedBody);
  await page.getByRole("button", { name: "Save correction" }).click();
  await expect(page.getByTestId("library-selected-body")).toContainText(correctedBody);

  const downloadPromise = page.waitForEvent("download");
  await page.getByLabel("Export JSON").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`lighthouse-library-item-${privateId}.json`);
  await download.delete();

  await page.getByLabel("Archive item").click();
  await expect(page.getByTestId("library-selected-detail")).toContainText("Archived");

  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    await dialog.accept();
  });
  await page.getByLabel("Delete item").click();
  await expect(page.getByText(privateTitle)).toHaveCount(0);

  await contextB.close();
});

async function registerAdultA(
  page: Page,
  input: { householdName: string; displayName: string; email: string },
) {
  await page.goto("/register");
  await page.getByLabel("Household name").fill(input.householdName);
  await page.getByLabel("Your name").fill(input.displayName);
  await page.getByLabel("Email").fill(input.email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create household" }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function joinAdultB(page: Page, token: string, input: { displayName: string; email: string }) {
  await page.goto(`/join/${token}`);
  await page.getByLabel("Your name").fill(input.displayName);
  await expect(page.getByLabel("Email")).toHaveValue(input.email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Join household" }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function createLibraryItem(
  page: Page,
  input: { title: string; body: string; access: "Private" | "Household" },
) {
  await page.getByLabel("Title").fill(input.title);
  await page.getByRole("button", { name: input.access }).click();
  await page.getByLabel("Details").fill(input.body);
  await page.getByRole("button", { name: "Save Library item" }).click();
  await expect(page.getByTestId("library-selected-detail")).toContainText(input.title);
}

async function lookupLibraryItemId(context: BrowserContext, title: string) {
  const response = await context.request.get(`/api/library/items?q=${encodeURIComponent(title)}`);
  expect(response.status()).toBe(200);
  const body = (await response.json()) as Array<{ id: number; title: string }>;
  const item = body.find((candidate) => candidate.title === title);
  expect(item).toBeTruthy();
  return item!.id;
}

async function assertApiNotFound(context: BrowserContext, pathname: string, tokens: string[]) {
  const response = await context.request.get(pathname);
  expect(response.status()).toBe(404);
  const text = await response.text();
  expect(text).toContain("Not found");
  for (const token of tokens) {
    expect(text).not.toContain(token);
  }
}

async function assertMutationDenied(context: BrowserContext, itemId: number) {
  const operations = [
    () => context.request.patch(`/api/library/items/${itemId}`, { data: { body: "unauthorized" } }),
    () => context.request.post(`/api/library/items/${itemId}/share`, { data: { granteeUserId: 1 } }),
    () => context.request.post(`/api/library/items/${itemId}/revoke`, { data: { granteeUserId: 1 } }),
    () => context.request.delete(`/api/library/items/${itemId}`),
  ];
  for (const operation of operations) {
    const response = await operation();
    expect(response.status()).toBe(404);
  }
}
