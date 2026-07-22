import { z } from "zod/v4";

import { boundedTextSchema, normalizedConnectorBatchSchema, stableIdentifierSchema } from "./core-contracts";
import { knowledgeEntityTypeSchema, knowledgeRelationshipTypeSchema } from "./registries";

export const connectorAuthenticationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }).strict(),
  z.object({ kind: z.literal("file_upload"), acceptedMediaTypes: z.array(z.string().min(1)).min(1) }).strict(),
  z.object({ kind: z.literal("oauth2"), authorizationScopes: z.array(z.string().min(1)).min(1) }).strict(),
  z.object({ kind: z.literal("api_key"), placement: z.enum(["header", "query"]) }).strict(),
  z.object({ kind: z.literal("device_authorization"), platform: boundedTextSchema }).strict(),
  z.object({ kind: z.literal("platform_permission"), permissions: z.array(z.string().min(1)).min(1) }).strict(),
]);

export const connectorDefinitionSchema = z.object({
  connectorKey: stableIdentifierSchema,
  version: z.string().trim().min(1).max(100),
  displayName: boundedTextSchema,
  capabilities: z.object({
    import: z.boolean(),
    incrementalSync: z.boolean(),
    deletePropagation: z.boolean(),
    export: z.boolean(),
  }).strict(),
  supportedEntityTypes: z.array(knowledgeEntityTypeSchema).min(1),
  supportedRelationshipTypes: z.array(knowledgeRelationshipTypeSchema).default([]),
  syncFrequency: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("manual") }).strict(),
    z.object({ mode: z.literal("on_demand") }).strict(),
    z.object({ mode: z.literal("periodic"), minimumIntervalSeconds: z.number().int().positive() }).strict(),
  ]),
  authentication: connectorAuthenticationSchema,
  permissions: z.array(z.object({ key: stableIdentifierSchema, purpose: boundedTextSchema, required: z.boolean() }).strict()).default([]),
  health: z.object({
    checkMode: z.enum(["none", "passive", "active"]),
    staleAfterSeconds: z.number().int().positive().nullable(),
  }).strict(),
  rateLimits: z.object({
    requests: z.number().int().positive(),
    windowSeconds: z.number().int().positive(),
  }).strict().nullable(),
  importMappings: z.array(z.object({
    externalType: z.string().trim().min(1).max(200),
    entityType: knowledgeEntityTypeSchema,
    mappingVersion: z.string().trim().min(1).max(100),
  }).strict()).min(1),
}).strict().superRefine((definition, context) => {
  const mappedTypes = new Set(definition.importMappings.map((mapping) => mapping.entityType));
  for (const entityType of definition.supportedEntityTypes) {
    if (!mappedTypes.has(entityType)) {
      context.addIssue({ code: "custom", path: ["importMappings"], message: `Missing import mapping for ${entityType}.` });
    }
  }
});

export type ConnectorDefinition = z.infer<typeof connectorDefinitionSchema>;

export function createConnectorRegistry(definitions: readonly unknown[]) {
  const parsed = definitions.map((definition) => connectorDefinitionSchema.parse(definition));
  const byVersion = new Map<string, Readonly<ConnectorDefinition>>();

  for (const definition of parsed) {
    const registryKey = `${definition.connectorKey}@${definition.version}`;
    if (byVersion.has(registryKey)) {
      throw new Error(`Duplicate connector definition: ${registryKey}`);
    }
    byVersion.set(registryKey, Object.freeze(definition));
  }

  return Object.freeze({
    list: () => Object.freeze(
      [...byVersion.values()].sort((left, right) =>
        `${left.connectorKey}@${left.version}`.localeCompare(`${right.connectorKey}@${right.version}`),
      ),
    ),
    get: (connectorKey: string, version: string) => byVersion.get(`${connectorKey}@${version}`),
    require: (connectorKey: string, version: string) => {
      const definition = byVersion.get(`${connectorKey}@${version}`);
      if (!definition) throw new Error("Unknown connector definition.");
      return definition;
    },
  });
}

export function parseConnectorBatch(definition: ConnectorDefinition, input: unknown) {
  const batch = normalizedConnectorBatchSchema.parse(input);
  if (batch.connectorKey !== definition.connectorKey || batch.connectorVersion !== definition.version) {
    throw new Error("Connector batch identity does not match its registered definition.");
  }

  const supportedEntities = new Set(definition.supportedEntityTypes);
  const supportedRelationships = new Set(definition.supportedRelationshipTypes);
  if (batch.entities.some((entity) => !supportedEntities.has(entity.entityType))) {
    throw new Error("Connector batch contains an unregistered entity type.");
  }
  if (batch.relationships.some((relationship) => !supportedRelationships.has(relationship.relationshipType))) {
    throw new Error("Connector batch contains an unregistered relationship type.");
  }
  return batch;
}
