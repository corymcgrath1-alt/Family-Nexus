import { z } from "zod/v4";

export const libraryCategories = [
  "note",
  "document-reference",
  "instruction",
  "decision",
  "memory",
  "medical-reference",
  "household-record",
  "vehicle-record",
  "career-record",
  "other",
] as const;
export const libraryVisibility = ["private", "shared", "household"] as const;
export const librarySensitivity = [
  "standard",
  "personal",
  "sensitive",
  "restricted",
] as const;
export const libraryRetentionPolicies = [
  "keep-until-archived",
  "review-annually",
  "delete-after-date",
  "legal-hold",
] as const;
export const librarySourceTypes = [
  "manual",
  "message",
  "document-reference",
  "web",
  "import",
  "other",
] as const;

export const optionalLibraryDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .nullable();

export const createLibraryItemSchema = z.object({
  title: z.string().trim().min(1).max(160),
  category: z.enum(libraryCategories).default("note"),
  body: z.string().trim().max(12000).optional().nullable(),
  visibility: z.enum(libraryVisibility).default("private"),
  shareWithUserIds: z
    .array(z.coerce.number().int().positive())
    .max(20)
    .default([]),
  sourceType: z.enum(librarySourceTypes).default("manual"),
  sourceLabel: z.string().trim().max(260).optional().nullable(),
  provenanceNote: z.string().trim().max(1000).optional().nullable(),
  effectiveDate: optionalLibraryDate,
  sensitivity: z.enum(librarySensitivity).default("personal"),
  retentionPolicy: z
    .enum(libraryRetentionPolicies)
    .default("keep-until-archived"),
  retentionDeleteAfter: optionalLibraryDate,
});

export const updateLibraryItemSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  body: z.string().trim().max(12000).optional().nullable(),
  sourceLabel: z.string().trim().max(260).optional().nullable(),
  provenanceNote: z.string().trim().max(1000).optional().nullable(),
  effectiveDate: optionalLibraryDate,
  sensitivity: z.enum(librarySensitivity).optional(),
  retentionPolicy: z.enum(libraryRetentionPolicies).optional(),
  retentionDeleteAfter: optionalLibraryDate,
  status: z.enum(["active", "archived"]).optional(),
});

export type LibraryCategory = (typeof libraryCategories)[number];
export type LibraryVisibility = (typeof libraryVisibility)[number];
export type LibrarySensitivity = (typeof librarySensitivity)[number];
export type LibraryRetentionPolicy = (typeof libraryRetentionPolicies)[number];
export type LibrarySourceType = (typeof librarySourceTypes)[number];
