import assert from "node:assert/strict";
import test from "node:test";
import {
  CONNECTOR_CATALOG_VERSION,
  ConnectorPolicyError,
  assertConnectorActivationAllowed,
  assertConnectorImportAllowed,
  assertKnownDataCategories,
  assertKnownPurposes,
  connectorCatalog,
  createConnectorCatalog,
  getConnector,
} from "./connector-catalog";

test("catalog is versioned and has one available connector", () => {
  assert.equal(CONNECTOR_CATALOG_VERSION, "connector-catalog.v1");
  const available = connectorCatalog.filter(
    (connector) => connector.status === "available",
  );
  assert.deepEqual(
    available.map((connector) => connector.id),
    ["manual-family-library"],
  );
});

test("every connector exposes the complete immutable metadata contract", () => {
  const requiredKeys = [
    "id",
    "provider",
    "displayName",
    "description",
    "dataCategories",
    "collectionMode",
    "status",
    "requiredScopes",
    "authorizationRequirements",
    "allowedPurposes",
    "prohibitedUses",
    "sensitivity",
    "refreshLimitations",
    "regionalPlatformLimitations",
    "termsReviewStatus",
    "importSupport",
    "exportSupport",
    "unavailableReason",
    "canCollectAnotherAdultData",
  ];
  for (const connector of connectorCatalog) {
    assert.deepEqual(Object.keys(connector).sort(), [...requiredKeys].sort());
    assert(Object.isFrozen(connector));
    assert(Object.isFrozen(connector.dataCategories));
  }
});

test("unknown connector IDs fail closed", () => {
  assert.throws(
    () => getConnector("not-registered"),
    (error: unknown) =>
      error instanceof ConnectorPolicyError &&
      error.code === "unknown-connector",
  );
});

test("unknown categories and purposes fail closed", () => {
  assert.throws(
    () => assertKnownDataCategories(["unknown"]),
    (error: unknown) =>
      error instanceof ConnectorPolicyError &&
      error.code === "unknown-data-category",
  );
  assert.throws(
    () => assertKnownPurposes(["unknown"]),
    (error: unknown) =>
      error instanceof ConnectorPolicyError && error.code === "unknown-purpose",
  );
});

test("deferred and unsupported connectors cannot activate or import", () => {
  for (const connector of connectorCatalog.filter((entry) =>
    ["deferred", "unsupported"].includes(entry.status),
  )) {
    assert.throws(
      () =>
        assertConnectorActivationAllowed({
          connectorId: connector.id,
          dataCategories: connector.dataCategories,
          purposes: connector.allowedPurposes,
        }),
      ConnectorPolicyError,
    );
    assert.throws(
      () => assertConnectorImportAllowed(connector.id),
      ConnectorPolicyError,
    );
  }
});

test("prohibited connectors have no activation or scope mechanism", () => {
  for (const connector of connectorCatalog.filter(
    (entry) => entry.status === "prohibited",
  )) {
    assert.deepEqual(connector.requiredScopes, []);
    assert.equal("activationUrl" in connector, false);
    assert.equal("enabled" in connector, false);
    assert.throws(
      () =>
        assertConnectorActivationAllowed({
          connectorId: connector.id,
          dataCategories: connector.dataCategories,
          purposes: connector.allowedPurposes,
        }),
      ConnectorPolicyError,
    );
  }
});

test("no connector can authorize collection from another adult", () => {
  for (const connector of connectorCatalog) {
    assert.equal(connector.canCollectAnotherAdultData, false);
  }
  assert.throws(
    () =>
      assertConnectorActivationAllowed({
        connectorId: "manual-family-library",
        dataCategories: ["family-library-records"],
        purposes: ["user-directed-import"],
        requestsAnotherAdultData: true,
      }),
    (error: unknown) =>
      error instanceof ConnectorPolicyError &&
      error.code === "other-adult-collection-prohibited",
  );
});

test("only registered connector capability combinations are accepted", () => {
  assert.doesNotThrow(() =>
    assertConnectorImportAllowed("manual-family-library"),
  );
  assert.throws(
    () =>
      assertConnectorActivationAllowed({
        connectorId: "manual-family-library",
        dataCategories: ["health-data"],
        purposes: ["user-directed-import"],
      }),
    (error: unknown) =>
      error instanceof ConnectorPolicyError &&
      error.code === "combination-not-registered",
  );
});

test("catalog ordering and IDs are stable", () => {
  assert.deepEqual(
    connectorCatalog.map((connector) => connector.id),
    [
      "accessibility-scraping",
      "adult-device-mdm",
      "android-usage-stats",
      "apple-healthkit",
      "apple-screen-time",
      "google-data-portability",
      "manual-family-library",
      "social-media-portability",
    ],
  );
});

test("duplicate connector IDs are rejected", () => {
  assert.throws(
    () => createConnectorCatalog([connectorCatalog[0], connectorCatalog[0]]),
    /Duplicate connector ID/,
  );
});
