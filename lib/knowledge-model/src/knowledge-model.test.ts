import assert from "node:assert/strict";
import test from "node:test";

import {
  KNOWLEDGE_ENTITY_TYPES,
  KNOWLEDGE_MODEL_VERSION,
  KNOWLEDGE_RELATIONSHIP_TYPES,
  connectorDefinitionSchema,
  createConnectorRegistry,
  knowledgeEntityTypeSchema,
  knowledgeSearchRequestSchema,
  normalizedConnectorBatchSchema,
  observationExtensionSchema,
  parseConnectorBatch,
  passportProfileSchema,
} from "./index";

const connector = connectorDefinitionSchema.parse({
  connectorKey: "test.manual-json",
  version: "1.0.0",
  displayName: "Synthetic manual JSON",
  capabilities: { import: true, incrementalSync: false, deletePropagation: false, export: false },
  supportedEntityTypes: ["memory", "place"],
  supportedRelationshipTypes: ["related_to"],
  syncFrequency: { mode: "manual" },
  authentication: { kind: "file_upload", acceptedMediaTypes: ["application/json"] },
  permissions: [],
  health: { checkMode: "none", staleAfterSeconds: null },
  rateLimits: null,
  importMappings: [
    { externalType: "memory", entityType: "memory", mappingVersion: "v1" },
    { externalType: "place", entityType: "place", mappingVersion: "v1" },
  ],
});

const baseTemporal = {
  occurredAt: null,
  startedAt: null,
  endedAt: null,
  durationSeconds: null,
  expectedAt: null,
  actualAt: null,
  recurrenceRule: null,
  temporalState: "historical",
};

const baseRetention = {
  retentionPolicy: "user_controlled",
  retentionDeleteAfter: null,
  legalHold: false,
};

function validBatch() {
  return {
    modelVersion: KNOWLEDGE_MODEL_VERSION,
    connectorKey: connector.connectorKey,
    connectorVersion: connector.version,
    batchRef: "fixture-batch-1",
    source: {
      sourceKind: "imported_json",
      provider: "User supplied file",
      connectorKey: connector.connectorKey,
      connectorVersion: connector.version,
      sourceLabel: "Synthetic fixture",
      externalReference: null,
      confidenceScore: 0.8,
      verificationState: "unverified",
      collectedAt: null,
      importedAt: "2026-07-21T12:00:00.000Z",
      provenance: {},
    },
    entities: [
      {
        localRef: "memory-1",
        sourceRecordRef: "external-memory-1",
        entityType: "memory",
        canonicalLabel: "Synthetic memory",
        privacyLevel: "personal_private",
        visibility: "private",
        sensitivity: "personal",
        confidenceScore: 0.8,
        verificationState: "unverified",
        tags: ["fixture"],
        searchText: "",
        searchMetadata: {},
        structuredMetadata: {},
        customFields: {},
        temporal: baseTemporal,
        retention: baseRetention,
      },
      {
        localRef: "place-1",
        sourceRecordRef: "external-place-1",
        entityType: "place",
        canonicalLabel: "Synthetic place",
        privacyLevel: "personal_private",
        visibility: "private",
        sensitivity: "personal",
        confidenceScore: 1,
        verificationState: "self_asserted",
        tags: [],
        searchText: "",
        searchMetadata: {},
        structuredMetadata: {},
        customFields: {},
        temporal: baseTemporal,
        retention: baseRetention,
      },
    ],
    relationships: [{
      localRef: "relation-1",
      sourceRecordRef: "external-relation-1",
      sourceEntityRef: "memory-1",
      targetEntityRef: "place-1",
      relationshipType: "related_to",
      direction: "undirected",
      strength: null,
      confidenceScore: 0.8,
      verificationState: "unverified",
      privacyInheritance: "most_restrictive",
      privacyLevel: "personal_private",
      visibility: "private",
      provenance: {},
      tags: [],
      structuredMetadata: {},
      temporal: baseTemporal,
      retention: baseRetention,
    }],
  };
}

test("canonical registries are stable and duplicate-free", () => {
  assert.equal(KNOWLEDGE_ENTITY_TYPES.length, 53);
  assert.equal(new Set(KNOWLEDGE_ENTITY_TYPES).size, 53);
  assert.equal(KNOWLEDGE_RELATIONSHIP_TYPES.length, 21);
  assert.equal(new Set(KNOWLEDGE_RELATIONSHIP_TYPES).size, 21);
});

test("unknown entity types fail closed", () => {
  assert.equal(knowledgeEntityTypeSchema.safeParse("telepathy_score").success, false);
});

test("connector definitions require mappings for every supported entity", () => {
  assert.equal(connectorDefinitionSchema.safeParse({
    ...connector,
    importMappings: connector.importMappings.slice(0, 1),
  }).success, false);
});

test("connector registries reject duplicate key and version pairs", () => {
  assert.throws(() => createConnectorRegistry([connector, connector]), /Duplicate connector definition/);
});

test("connector registries reject unknown definitions", () => {
  const registry = createConnectorRegistry([connector]);
  assert.throws(() => registry.require("unknown", "1"), /Unknown connector definition/);
});

test("normalized batches reject unknown ownership and disconnected relationships", () => {
  const batch = validBatch();
  assert.equal(normalizedConnectorBatchSchema.safeParse({ ...batch, ownerUserId: 99 }).success, false);
  batch.relationships[0].targetEntityRef = "missing";
  assert.equal(normalizedConnectorBatchSchema.safeParse(batch).success, false);
});

test("registered connectors accept only declared entity and relationship types", () => {
  assert.equal(parseConnectorBatch(connector, validBatch()).entities.length, 2);
  const batch = validBatch();
  batch.entities[0].entityType = "vehicle";
  assert.throws(() => parseConnectorBatch(connector, batch), /unregistered entity type/);
});

test("connector batch identity cannot be substituted", () => {
  const batch = validBatch();
  batch.connectorKey = "other.connector";
  assert.throws(() => parseConnectorBatch(connector, batch), /identity does not match/);
});

test("observations do not accept verified-fact state in their extension", () => {
  assert.equal(observationExtensionSchema.safeParse({
    observationText: "Synthetic observation",
    observationKind: "user_observation",
    observedAt: "2026-07-21T12:00:00.000Z",
    supportingEvidenceEntityIds: [],
    verificationState: "source_verified",
  }).success, false);
});

test("Passport contracts reject weak or malformed identifiers", () => {
  assert.equal(passportProfileSchema.safeParse({ lighthousePassportId: "person-1" }).success, false);
});

test("search contracts bound traversal depth and require criteria", () => {
  assert.equal(knowledgeSearchRequestSchema.safeParse({}).success, false);
  assert.equal(knowledgeSearchRequestSchema.safeParse({
    graph: {
      anchorEntityId: "d6470b3f-afdd-4c4d-9fce-d78e9a6ca2dc",
      direction: "both",
      maxDepth: 5,
    },
  }).success, false);
});

test("search dimensions reject unknown entity and relationship types", () => {
  assert.equal(knowledgeSearchRequestSchema.safeParse({ entityTypes: ["unknown"] }).success, false);
  assert.equal(knowledgeSearchRequestSchema.safeParse({
    graph: {
      anchorEntityId: "d6470b3f-afdd-4c4d-9fce-d78e9a6ca2dc",
      relationshipTypes: ["secretly_knows"],
      direction: "both",
      maxDepth: 2,
    },
  }).success, false);
});
