import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

process.env.CONNECTOR_ACTIVE_KEY_VERSION = "test-v1";
process.env.CONNECTOR_CREDENTIAL_KEYS_JSON = JSON.stringify({ "test-v1": Buffer.alloc(32, 7).toString("base64") });
process.env.CONNECTOR_PROVIDER_MODE = "fake";
process.env.NODE_ENV = "test";

import {
  CONNECTOR_CONNECTION_STATES,
  ConnectorError,
  assertConnectorStateTransition,
  canTransitionConnectorState,
} from "@workspace/knowledge-model";
import { GOOGLE_CALENDAR_SCOPES, googleCalendarDefinition } from "./connector-definition";
import { decryptConnectorSecret, encryptConnectorSecret } from "./credential-cipher";
import { FakeGoogleCalendarProvider } from "./fake-google-calendar-provider";
import { checksumNormalizedEvent, normalizeGoogleCalendarEvent } from "./google-calendar-provider";
import { createOauthRequestMaterial, hashOauthState, validateConnectorRedirectPath } from "./oauth-security";
import { connectorConsentMaterialVersion, googleCalendarImportPolicy } from "./connector-import-policy";

test("Google Calendar definition exposes only implemented read capabilities and minimum scopes", () => {
  assert.equal(googleCalendarDefinition.status, "available");
  assert.deepEqual(googleCalendarDefinition.minimumRequiredScopes, GOOGLE_CALENDAR_SCOPES);
  assert(googleCalendarDefinition.capabilities.includes("selective_resource_sync"));
  assert(!googleCalendarDefinition.capabilities.includes("write"));
  assert(!googleCalendarDefinition.capabilities.includes("delete_at_provider"));
  assert(!GOOGLE_CALENDAR_SCOPES.some((scope) => /gmail|contacts|drive/i.test(scope)));
});

test("effective import windows are material consent policy", () => {
  const first = googleCalendarImportPolicy({ CONNECTOR_BACKFILL_PAST_DAYS: "30", CONNECTOR_BACKFILL_FUTURE_DAYS: "60" });
  const sameMaterial = googleCalendarImportPolicy({ CONNECTOR_BACKFILL_PAST_DAYS: "30", CONNECTOR_BACKFILL_FUTURE_DAYS: "60", LOG_LEVEL: "debug" });
  const changed = googleCalendarImportPolicy({ CONNECTOR_BACKFILL_PAST_DAYS: "31", CONNECTOR_BACKFILL_FUTURE_DAYS: "60" });
  assert.equal(first.backfillPastDays, 30);
  assert.equal(first.backfillFutureDays, 60);
  assert.equal(first.consentPolicyFingerprint, sameMaterial.consentPolicyFingerprint);
  assert.notEqual(first.consentPolicyFingerprint, changed.consentPolicyFingerprint);
  assert.notEqual(
    connectorConsentMaterialVersion({ connectorVersion: "1.0.0", selectedResourceIds: ["calendar-a"], grantedScopes: ["read"], selectedCapabilities: ["read"], consentPolicyFingerprint: first.consentPolicyFingerprint }),
    connectorConsentMaterialVersion({ connectorVersion: "1.0.0", selectedResourceIds: ["calendar-a"], grantedScopes: ["read"], selectedCapabilities: ["read"], consentPolicyFingerprint: changed.consentPolicyFingerprint }),
  );
});

test("connector state machine permits recovery paths and rejects unsafe resurrection", () => {
  assert.equal(CONNECTOR_CONNECTION_STATES.length, 9);
  assert(canTransitionConnectorState("active", "syncing"));
  assert(canTransitionConnectorState("syncing", "reconnect_required"));
  assert(canTransitionConnectorState("revoked", "archived"));
  assert.equal(canTransitionConnectorState("revoked", "active"), false);
  assert.equal(canTransitionConnectorState("archived", "pending_authorization"), false);
  assert.throws(() => assertConnectorStateTransition("archived", "active"), /Unsafe connector state transition/);
});

test("credential encryption round trips with a fresh authenticated nonce", () => {
  const first = encryptConnectorSecret("refresh-token-synthetic", "unit-test");
  const second = encryptConnectorSecret("refresh-token-synthetic", "unit-test");
  assert.notDeepEqual(first.encryptionNonce, second.encryptionNonce);
  assert.notDeepEqual(first.encryptedPayload, second.encryptedPayload);
  assert.equal(decryptConnectorSecret(first, "unit-test").toString("utf8"), "refresh-token-synthetic");
});

test("credential encryption detects ciphertext and authentication-tag tampering", () => {
  const encrypted = encryptConnectorSecret("synthetic-secret", "tamper-test");
  const changed = Buffer.from(encrypted.encryptedPayload);
  changed[0] = (changed[0] ?? 0) ^ 1;
  assert.throws(() => decryptConnectorSecret({ ...encrypted, encryptedPayload: changed }, "tamper-test"));
  const changedTag = Buffer.from(encrypted.authenticationTag);
  changedTag[0] = (changedTag[0] ?? 0) ^ 1;
  assert.throws(() => decryptConnectorSecret({ ...encrypted, authenticationTag: changedTag }, "tamper-test"));
});

test("credential encryption fails closed for missing and wrong keys", () => {
  const encrypted = encryptConnectorSecret("synthetic-secret", "wrong-key-test");
  const wrongVersion = { ...process.env, CONNECTOR_ACTIVE_KEY_VERSION: "test-v2", CONNECTOR_CREDENTIAL_KEYS_JSON: JSON.stringify({ "test-v2": Buffer.alloc(32, 8).toString("base64") }) };
  assert.throws(() => decryptConnectorSecret(encrypted, "wrong-key-test", wrongVersion), /key version is unavailable/);
  assert.throws(() => encryptConnectorSecret("secret", "missing-config", {}), /are required/);
});

test("OAuth state and PKCE material are random, hashed, encrypted, and short lived", () => {
  const now = new Date("2026-07-22T12:00:00.000Z");
  const first = createOauthRequestMaterial(now);
  const second = createOauthRequestMaterial(now);
  assert.notEqual(first.state, second.state);
  assert.equal(first.stateHash, hashOauthState(first.state));
  assert.equal(first.stateHash.length, 64);
  assert.equal(first.codeChallenge.length, 43);
  assert.equal(first.expiresAt.toISOString(), "2026-07-22T12:10:00.000Z");
  const verifier = decryptConnectorSecret(first.encryptedVerifier, "oauth-pkce-verifier").toString("utf8");
  assert.equal(createHash("sha256").update(verifier).digest("base64url"), first.codeChallenge);
});

test("OAuth redirect validation rejects unregistered and network-path destinations", () => {
  process.env.CONNECTOR_ALLOWED_REDIRECT_PATHS = "/connectors,/privacy";
  assert.equal(validateConnectorRedirectPath("/connectors"), "/connectors");
  assert.throws(() => validateConnectorRedirectPath("https://attacker.example"), /not allowed/);
  assert.throws(() => validateConnectorRedirectPath("//attacker.example"), /not allowed/);
  assert.throws(() => validateConnectorRedirectPath("/library"), /not allowed/);
});

test("Google event normalization preserves temporal and recurrence fields without inference", () => {
  const normalized = normalizeGoogleCalendarEvent({
    id: "event-recurring-1",
    etag: "etag-1",
    status: "confirmed",
    summary: "Synthetic recurring event",
    description: "Synthetic description",
    location: "Synthetic place",
    start: { date: "2026-08-01" },
    end: { date: "2026-08-02" },
    recurrence: ["RRULE:FREQ=WEEKLY;COUNT=3"],
    organizer: { email: "owner@example.test", self: true },
    attendees: [{ email: "guest@example.test", responseStatus: "tentative" }],
    visibility: "private",
  }, "calendar-1");
  assert.equal(normalized.allDay, true);
  assert.deepEqual(normalized.recurrence, ["RRULE:FREQ=WEEKLY;COUNT=3"]);
  assert.equal(normalized.organizer?.self, true);
  assert.equal(normalized.attendees[0]?.responseStatus, "tentative");
  assert.equal(normalized.providerVisibility, "private");
});

test("cancelled event normalization produces a source tombstone", () => {
  const normalized = normalizeGoogleCalendarEvent({ id: "cancelled-1", status: "cancelled" }, "calendar-1");
  assert.equal(normalized.sourceDeleted, true);
  assert.equal(normalized.title, "Cancelled event");
});

test("normalized checksums are deterministic and change with provider values", () => {
  const first = normalizeGoogleCalendarEvent({ id: "event-1", summary: "Before", status: "confirmed" }, "calendar-1");
  const same = normalizeGoogleCalendarEvent({ id: "event-1", summary: "Before", status: "confirmed" }, "calendar-1");
  const changed = normalizeGoogleCalendarEvent({ id: "event-1", summary: "After", status: "confirmed" }, "calendar-1");
  assert.equal(checksumNormalizedEvent(first), checksumNormalizedEvent(same));
  assert.notEqual(checksumNormalizedEvent(first), checksumNormalizedEvent(changed));
});

test("fake provider supports paginated initial sync and idempotent incremental cursors", async () => {
  const provider = new FakeGoogleCalendarProvider();
  const resources = await provider.discoverResources();
  const personal = resources.find((resource) => resource.displayName === "Personal")!;
  const query = { resource: personal, pageToken: null, cursor: null, backfillStart: "2025-07-22T00:00:00.000Z", backfillEnd: "2027-07-22T00:00:00.000Z" };
  const first = await provider.listSourceObjects(query as never);
  assert.equal(first.items.length, 1);
  assert(first.nextPageToken);
  await assert.rejects(provider.listSourceObjects({ ...query, pageToken: first.nextPageToken, backfillEnd: "2027-07-23T00:00:00.000Z" } as never), (error) => error instanceof ConnectorError && error.category === "malformed_provider_response");
  const second = await provider.listSourceObjects({ ...query, pageToken: first.nextPageToken } as never);
  assert.equal(second.items.length, 1);
  assert.equal(second.nextPageToken, null);
  assert.equal(second.nextCursor, "fake-cursor-1");
  const unchanged = await provider.listSourceObjects({ ...query, pageToken: null, cursor: second.nextCursor } as never);
  assert.deepEqual(unchanged.items, []);
});

test("fake provider exposes update, insertion, deletion, cursor, and classified failure scenarios", async () => {
  const provider = new FakeGoogleCalendarProvider();
  const resource = (await provider.discoverResources())[0]!;
  provider.applyScenario("incremental_change");
  const page = await provider.listSourceObjects({ resource, pageToken: null, cursor: "fake-cursor-1" } as never);
  assert.equal(page.items.length, 1);
  provider.applyScenario("cursor_invalidated");
  await assert.rejects(provider.listSourceObjects({ resource, pageToken: null, cursor: "fake-cursor-2" } as never), (error) => error instanceof ConnectorError && error.category === "cursor_invalidated");
  provider.applyScenario("rate_limit");
  await assert.rejects(provider.listSourceObjects({ resource, pageToken: null, cursor: null } as never), (error) => error instanceof ConnectorError && error.disposition === "retryable");
});
