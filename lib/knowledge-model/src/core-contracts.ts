import { z } from "zod/v4";

import {
  KNOWLEDGE_MODEL_VERSION,
  knowledgeConfidenceSchema,
  knowledgeEntityTypeSchema,
  knowledgePrivacyLevelSchema,
  knowledgeRelationshipTypeSchema,
  knowledgeSensitivitySchema,
  knowledgeSourceKindSchema,
  knowledgeTemporalStateSchema,
  knowledgeVerificationStateSchema,
  knowledgeVisibilitySchema,
} from "./registries";

export const boundedTextSchema = z.string().trim().min(1).max(500);
export const stableIdentifierSchema = z.string().trim().min(1).max(128).regex(/^[a-z0-9][a-z0-9._-]*$/);

export const metadataSchema = z.record(z.string().max(100), z.unknown()).superRefine((value, context) => {
  if (Object.keys(value).length > 100) {
    context.addIssue({ code: "custom", message: "Metadata may contain at most 100 keys." });
  }
});

export const temporalEnvelopeSchema = z.object({
  occurredAt: z.iso.datetime().nullable().default(null),
  startedAt: z.iso.datetime().nullable().default(null),
  endedAt: z.iso.datetime().nullable().default(null),
  durationSeconds: z.number().int().nonnegative().nullable().default(null),
  expectedAt: z.iso.datetime().nullable().default(null),
  actualAt: z.iso.datetime().nullable().default(null),
  recurrenceRule: z.string().trim().min(1).max(1000).nullable().default(null),
  temporalState: knowledgeTemporalStateSchema.default("current"),
}).strict().superRefine((value, context) => {
  if (value.startedAt && value.endedAt && Date.parse(value.endedAt) < Date.parse(value.startedAt)) {
    context.addIssue({ code: "custom", path: ["endedAt"], message: "endedAt must not precede startedAt." });
  }
});

export const retentionEnvelopeSchema = z.object({
  retentionPolicy: z.string().trim().min(1).max(100),
  retentionDeleteAfter: z.iso.datetime().nullable().default(null),
  legalHold: z.boolean().default(false),
}).strict();

export const sourceProvenanceSchema = z.object({
  sourceKind: knowledgeSourceKindSchema,
  provider: boundedTextSchema,
  connectorKey: stableIdentifierSchema.nullable().default(null),
  connectorVersion: z.string().trim().min(1).max(100).nullable().default(null),
  sourceLabel: z.string().trim().min(1).max(500).nullable().default(null),
  externalReference: z.string().trim().min(1).max(1000).nullable().default(null),
  confidenceScore: knowledgeConfidenceSchema,
  verificationState: knowledgeVerificationStateSchema,
  collectedAt: z.iso.datetime().nullable().default(null),
  importedAt: z.iso.datetime().nullable().default(null),
  provenance: metadataSchema.default({}),
}).strict();

export const normalizedEntityInputSchema = z.object({
  localRef: stableIdentifierSchema,
  sourceRecordRef: z.string().trim().min(1).max(1000).nullable().default(null),
  entityType: knowledgeEntityTypeSchema,
  canonicalLabel: boundedTextSchema,
  privacyLevel: knowledgePrivacyLevelSchema,
  visibility: knowledgeVisibilitySchema.default("private"),
  sensitivity: knowledgeSensitivitySchema,
  confidenceScore: knowledgeConfidenceSchema,
  verificationState: knowledgeVerificationStateSchema,
  tags: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  searchText: z.string().max(10_000).default(""),
  searchMetadata: metadataSchema.default({}),
  structuredMetadata: metadataSchema.default({}),
  customFields: metadataSchema.default({}),
  temporal: temporalEnvelopeSchema,
  retention: retentionEnvelopeSchema,
}).strict();

export const normalizedRelationshipInputSchema = z.object({
  localRef: stableIdentifierSchema,
  sourceRecordRef: z.string().trim().min(1).max(1000).nullable().default(null),
  sourceEntityRef: stableIdentifierSchema,
  targetEntityRef: stableIdentifierSchema,
  relationshipType: knowledgeRelationshipTypeSchema,
  direction: z.enum(["directed", "undirected", "bidirectional"]),
  strength: knowledgeConfidenceSchema.nullable().default(null),
  confidenceScore: knowledgeConfidenceSchema,
  verificationState: knowledgeVerificationStateSchema,
  privacyInheritance: z.enum(["most_restrictive", "source", "target", "explicit"]).default("most_restrictive"),
  privacyLevel: knowledgePrivacyLevelSchema,
  visibility: knowledgeVisibilitySchema.default("private"),
  provenance: metadataSchema.default({}),
  tags: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  structuredMetadata: metadataSchema.default({}),
  temporal: temporalEnvelopeSchema,
  retention: retentionEnvelopeSchema,
}).strict();

export const normalizedConnectorBatchSchema = z.object({
  modelVersion: z.literal(KNOWLEDGE_MODEL_VERSION),
  connectorKey: stableIdentifierSchema,
  connectorVersion: z.string().trim().min(1).max(100),
  batchRef: z.string().trim().min(1).max(1000),
  source: sourceProvenanceSchema,
  entities: z.array(normalizedEntityInputSchema).min(1).max(10_000),
  relationships: z.array(normalizedRelationshipInputSchema).max(25_000).default([]),
}).strict().superRefine((batch, context) => {
  const entityRefs = new Set<string>();
  for (const [index, entity] of batch.entities.entries()) {
    if (entityRefs.has(entity.localRef)) {
      context.addIssue({ code: "custom", path: ["entities", index, "localRef"], message: "Entity references must be unique within a batch." });
    }
    entityRefs.add(entity.localRef);
  }

  const relationshipRefs = new Set<string>();
  for (const [index, relationship] of batch.relationships.entries()) {
    if (relationshipRefs.has(relationship.localRef)) {
      context.addIssue({ code: "custom", path: ["relationships", index, "localRef"], message: "Relationship references must be unique within a batch." });
    }
    relationshipRefs.add(relationship.localRef);
    if (!entityRefs.has(relationship.sourceEntityRef) || !entityRefs.has(relationship.targetEntityRef)) {
      context.addIssue({ code: "custom", path: ["relationships", index], message: "Relationship endpoints must reference entities in the same normalized batch." });
    }
  }
});

export type NormalizedConnectorBatch = z.infer<typeof normalizedConnectorBatchSchema>;
