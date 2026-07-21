import { z } from "zod/v4";

export const KNOWLEDGE_MODEL_VERSION = "family-knowledge-graph.v1" as const;

export const KNOWLEDGE_ENTITY_TYPES = [
  "person", "household", "pet", "vehicle", "home", "room", "organization",
  "employer", "school", "doctor", "medication", "appointment", "task", "project",
  "conversation", "relationship", "event", "memory", "observation", "document",
  "photo", "video", "financial_account", "investment", "expense", "income",
  "subscription", "insurance", "property", "warranty", "inspection",
  "maintenance_record", "health_metric", "mood_entry", "sleep_session", "workout",
  "meal", "trip", "place", "calendar_event", "goal", "habit", "skill",
  "certification", "device", "connector", "permission", "consent", "source",
  "ai_insight", "recommendation", "risk", "notification",
] as const;

export const KNOWLEDGE_RELATIONSHIP_TYPES = [
  "parent_of", "child_of", "sibling_of", "spouse_of", "friend_of", "works_at",
  "lives_in", "owns", "maintains", "created", "modified", "attended", "purchased",
  "viewed", "mentioned", "related_to", "duplicate_of", "derived_from", "supports",
  "requires", "depends_on",
] as const;

export const KNOWLEDGE_SOURCE_KINDS = [
  "manual_entry", "imported_json", "external_api", "data_portability_export",
  "platform_collector", "local_device", "user_correction", "ai_generated", "derived", "other",
] as const;

export const knowledgeEntityTypeSchema = z.enum(KNOWLEDGE_ENTITY_TYPES);
export const knowledgeRelationshipTypeSchema = z.enum(KNOWLEDGE_RELATIONSHIP_TYPES);
export const knowledgeSourceKindSchema = z.enum(KNOWLEDGE_SOURCE_KINDS);
export const knowledgePrivacyLevelSchema = z.enum([
  "internal", "household", "personal_private", "sensitive_personal", "restricted_third_party",
]);
export const knowledgeVisibilitySchema = z.enum(["private", "household", "shared"]);
export const knowledgeSensitivitySchema = z.enum(["standard", "personal", "sensitive", "restricted"]);
export const knowledgeVerificationStateSchema = z.enum([
  "unverified", "self_asserted", "source_verified", "user_verified", "disputed", "rejected",
]);
export const knowledgeTemporalStateSchema = z.enum(["historical", "current", "future", "predicted"]);
export const knowledgeLifecycleStatusSchema = z.enum(["active", "archived", "deleted"]);
export const knowledgeConfidenceSchema = z.number().min(0).max(1);

export type KnowledgeEntityType = z.infer<typeof knowledgeEntityTypeSchema>;
export type KnowledgeRelationshipType = z.infer<typeof knowledgeRelationshipTypeSchema>;
