import { z } from "zod/v4";

import {
  KNOWLEDGE_ENTITY_TYPES,
  KNOWLEDGE_RELATIONSHIP_TYPES,
  knowledgeEntityTypeSchema,
  knowledgeLifecycleStatusSchema,
  knowledgePrivacyLevelSchema,
  knowledgeRelationshipTypeSchema,
  knowledgeTemporalStateSchema,
  knowledgeVisibilitySchema,
} from "./registries";

export const knowledgeSearchRequestSchema = z.object({
  keyword: z.string().trim().min(1).max(500).optional(),
  entityTypes: z.array(knowledgeEntityTypeSchema).max(KNOWLEDGE_ENTITY_TYPES.length).optional(),
  statuses: z.array(knowledgeLifecycleStatusSchema).max(3).optional(),
  privacyLevels: z.array(knowledgePrivacyLevelSchema).max(5).optional(),
  visibilities: z.array(knowledgeVisibilitySchema).max(3).optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  timeline: z.object({
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    states: z.array(knowledgeTemporalStateSchema).max(4).optional(),
  }).strict().optional(),
  graph: z.object({
    anchorEntityId: z.uuid(),
    relationshipTypes: z.array(knowledgeRelationshipTypeSchema).max(KNOWLEDGE_RELATIONSHIP_TYPES.length).optional(),
    direction: z.enum(["outgoing", "incoming", "both"]),
    maxDepth: z.number().int().min(1).max(4),
  }).strict().optional(),
  semantic: z.object({
    query: z.string().trim().min(1).max(2_000),
    contractVersion: z.literal("semantic-search.v1"),
  }).strict().optional(),
  limit: z.number().int().min(1).max(100).default(25),
  cursor: z.string().trim().min(1).max(500).optional(),
}).strict().superRefine((request, context) => {
  if (!request.keyword && !request.entityTypes?.length && !request.tags?.length && !request.timeline && !request.graph && !request.semantic) {
    context.addIssue({ code: "custom", message: "Search requires at least one bounded criterion." });
  }
  if (request.timeline?.from && request.timeline.to && Date.parse(request.timeline.to) < Date.parse(request.timeline.from)) {
    context.addIssue({ code: "custom", path: ["timeline", "to"], message: "Timeline end must not precede its start." });
  }
});

export type KnowledgeSearchRequest = z.infer<typeof knowledgeSearchRequestSchema>;
