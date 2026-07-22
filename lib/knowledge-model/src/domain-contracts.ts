import { z } from "zod/v4";

import { boundedTextSchema, metadataSchema, stableIdentifierSchema } from "./core-contracts";
import { knowledgeConfidenceSchema } from "./registries";

export const memoryExtensionSchema = z.object({
  title: boundedTextSchema,
  summary: z.string().max(10_000).nullable(),
  participantEntityIds: z.array(z.uuid()).max(200),
  mediaEntityIds: z.array(z.uuid()).max(500),
  placeEntityIds: z.array(z.uuid()).max(100),
  emotions: z.array(z.string().trim().min(1).max(100)).max(50),
  importance: z.number().int().min(1).max(5).nullable(),
  timelinePosition: z.string().trim().min(1).max(500).nullable(),
  supportingEvidenceEntityIds: z.array(z.uuid()).max(500),
  aiSummary: z.string().max(10_000).nullable(),
  followUpSuggestions: z.array(z.string().trim().min(1).max(1000)).max(50),
}).strict();

export const observationExtensionSchema = z.object({
  observationText: z.string().trim().min(1).max(10_000),
  observationKind: z.enum(["user_observation", "sensor_observation", "imported_observation"]),
  observedAt: z.iso.datetime(),
  supportingEvidenceEntityIds: z.array(z.uuid()).max(500),
}).strict();

export const insightExtensionSchema = z.object({
  title: boundedTextSchema,
  description: z.string().trim().min(1).max(20_000),
  reasoning: z.string().trim().min(1).max(20_000),
  supportingEvidenceEntityIds: z.array(z.uuid()).min(1).max(500),
  confidenceScore: knowledgeConfidenceSchema,
  generationMethod: z.enum(["human_authored", "deterministic", "future_ai"]),
  status: z.enum(["candidate", "accepted", "dismissed", "expired"]),
  followUpActions: z.array(z.string().trim().min(1).max(1000)).max(50),
}).strict();

export const recommendationExtensionSchema = z.object({
  recommendation: z.string().trim().min(1).max(20_000),
  priority: z.enum(["low", "normal", "high", "critical"]),
  urgency: z.enum(["not_urgent", "soon", "urgent", "immediate"]),
  estimatedBenefit: z.string().trim().min(1).max(1000).nullable(),
  estimatedEffort: z.string().trim().min(1).max(1000).nullable(),
  categories: z.array(z.string().trim().min(1).max(100)).max(50),
  requiredPermissions: z.array(stableIdentifierSchema).max(100),
  supportingEvidenceEntityIds: z.array(z.uuid()).min(1).max(500),
}).strict();

export const passportProfileSchema = z.object({
  lighthousePassportId: z.string().regex(/^lhp_[A-Za-z0-9_-]{20,}$/),
  personEntityId: z.uuid(),
  identity: metadataSchema,
  preferences: metadataSchema,
  strengths: z.array(boundedTextSchema).max(100),
  growthAreas: z.array(boundedTextSchema).max(100),
  communicationStyle: metadataSchema,
  career: metadataSchema,
  education: metadataSchema,
  medical: metadataSchema,
  family: metadataSchema,
  relationshipEntityIds: z.array(z.uuid()).max(1_000),
  importantMemoryEntityIds: z.array(z.uuid()).max(1_000),
  goalEntityIds: z.array(z.uuid()).max(1_000),
  interests: z.array(boundedTextSchema).max(1_000),
  privacyPreferences: metadataSchema,
  consentSummary: metadataSchema,
  aiProfile: metadataSchema,
}).strict();
