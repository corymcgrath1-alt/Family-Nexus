import { z } from "zod/v4";
import {
  assertConnectorImportAllowed,
  ConnectorPolicyError,
} from "./connector-catalog";
import {
  libraryCategories,
  libraryRetentionPolicies,
  librarySensitivity,
} from "./library-contracts";

export const LIBRARY_IMPORT_FORMAT_VERSION = "library-item.v1" as const;
export const MANUAL_LIBRARY_CONNECTOR_ID = "manual-family-library" as const;
export const MAX_LIBRARY_IMPORT_BYTES = 32 * 1024;

const nullableDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional();
const nullableDateTime = z
  .string()
  .datetime({ offset: true })
  .nullable()
  .optional();

const importProvenanceSchema = z
  .object({
    sourceType: z.string().max(80).optional(),
    sourceLabel: z.string().max(260).nullable().optional(),
    note: z.string().max(1000).nullable().optional(),
    recordedByUserId: z.number().int().positive().optional(),
    correctedByUserId: z.number().int().positive().optional(),
    correctedAt: z.string().datetime({ offset: true }).optional(),
    connectorId: z.string().max(80).optional(),
    originalFormatVersion: z.string().max(80).optional(),
    importedAt: z.string().datetime({ offset: true }).optional(),
    originalSourceLabel: z.string().max(260).nullable().optional(),
  })
  .strict();

const importGrantSchema = z
  .object({
    id: z.number().int().positive().optional(),
    granteeUserId: z.number().int().positive().optional(),
    permission: z.string().max(80).optional(),
    purpose: z.string().max(160).optional(),
    createdAt: z.string().datetime({ offset: true }).optional(),
    revokedAt: nullableDateTime,
    expiresAt: nullableDateTime,
  })
  .strict();

const importSourceItemSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    category: z.enum(libraryCategories).default("note"),
    body: z.string().trim().max(12000).nullable().optional(),
    sourceLabel: z.string().trim().max(260).nullable().optional(),
    effectiveDate: nullableDate,
    sensitivity: z.enum(librarySensitivity).default("personal"),
    retentionPolicy: z
      .enum(libraryRetentionPolicies)
      .default("keep-until-archived"),
    retentionDeleteAfter: nullableDate,
    provenance: importProvenanceSchema.optional(),
    id: z.number().int().positive().optional(),
    householdId: z.number().int().positive().optional(),
    ownerUserId: z.number().int().positive().optional(),
    subjectUserId: z.number().int().positive().nullable().optional(),
    ownerKind: z.string().max(80).optional(),
    visibility: z.string().max(80).optional(),
    sourceType: z.string().max(80).optional(),
    allowedPurposes: z.array(z.string().max(160)).max(20).optional(),
    status: z.string().max(80).optional(),
    version: z.number().int().positive().optional(),
    createdById: z.number().int().positive().optional(),
    updatedById: z.number().int().positive().optional(),
    archivedAt: nullableDateTime,
    deletedAt: nullableDateTime,
    createdAt: z.string().datetime({ offset: true }).optional(),
    updatedAt: z.string().datetime({ offset: true }).optional(),
    grants: z.array(importGrantSchema).max(100).optional(),
  })
  .strict();

export const libraryItemImportDocumentSchema = z
  .object({
    connectorId: z.string().max(80).default(MANUAL_LIBRARY_CONNECTOR_ID),
    formatVersion: z.literal(LIBRARY_IMPORT_FORMAT_VERSION),
    exportedAt: z.string().datetime({ offset: true }).optional(),
    item: importSourceItemSchema,
  })
  .strict();

export const libraryImportCommitSchema = z
  .object({
    confirmPrivateCopy: z.literal(true),
    document: libraryItemImportDocumentSchema,
  })
  .strict();

export class LibraryImportError extends Error {
  constructor(
    readonly code:
      | "invalid-document"
      | "unsupported-format"
      | "connector-unavailable"
      | "payload-too-large",
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
    this.name = "LibraryImportError";
  }
}

export type LibraryImportDocument = z.infer<
  typeof libraryItemImportDocumentSchema
>;

export function assertLibraryImportPayloadSize(value: unknown): void {
  const size = Buffer.byteLength(JSON.stringify(value), "utf8");
  if (size > MAX_LIBRARY_IMPORT_BYTES) {
    throw new LibraryImportError(
      "payload-too-large",
      "Import document exceeds the 32 KiB limit.",
    );
  }
}

export function parseLibraryImportDocument(
  value: unknown,
): LibraryImportDocument {
  if (
    value &&
    typeof value === "object" &&
    "formatVersion" in value &&
    (value as { formatVersion?: unknown }).formatVersion !==
      LIBRARY_IMPORT_FORMAT_VERSION
  ) {
    throw new LibraryImportError(
      "unsupported-format",
      `Only ${LIBRARY_IMPORT_FORMAT_VERSION} imports are supported.`,
    );
  }

  const parsed = libraryItemImportDocumentSchema.safeParse(value);
  if (!parsed.success) {
    throw new LibraryImportError(
      "invalid-document",
      "The JSON file is not a valid Lighthouse Library item export.",
      parsed.error.issues.map((issue) => issue.message),
    );
  }

  try {
    assertConnectorImportAllowed(parsed.data.connectorId);
  } catch (error) {
    if (error instanceof ConnectorPolicyError) {
      throw new LibraryImportError(
        "connector-unavailable",
        "The selected connector cannot import Library items.",
      );
    }
    throw error;
  }

  return parsed.data;
}

function sanitizeProvenanceNote(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const sanitized = value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, 500);
  return sanitized || null;
}

function presentFields(
  item: Record<string, unknown>,
  fields: readonly string[],
): string[] {
  return fields.filter((field) =>
    Object.prototype.hasOwnProperty.call(item, field),
  );
}

export function previewLibraryImport(value: unknown) {
  assertLibraryImportPayloadSize(value);
  const document = parseLibraryImportDocument(value);
  const item = document.item;
  const identifiers = presentFields(item, [
    "id",
    "householdId",
    "ownerUserId",
    "subjectUserId",
    "createdById",
    "updatedById",
  ]);
  const lifecycle = presentFields(item, [
    "status",
    "version",
    "archivedAt",
    "deletedAt",
    "createdAt",
    "updatedAt",
  ]);
  const discarded = presentFields(item, [
    "ownerKind",
    "visibility",
    "sourceType",
    "allowedPurposes",
  ]);
  const sourceLabel =
    item.sourceLabel ??
    item.provenance?.sourceLabel ??
    item.provenance?.originalSourceLabel ??
    null;

  return {
    formatVersion: LIBRARY_IMPORT_FORMAT_VERSION,
    connectorId: MANUAL_LIBRARY_CONNECTOR_ID,
    candidate: {
      title: item.title,
      category: item.category,
      body: item.body ?? null,
      sourceLabel,
      effectiveDate: item.effectiveDate ?? null,
      sensitivity: item.sensitivity,
      retentionPolicy: item.retentionPolicy,
      retentionDeleteAfter: item.retentionDeleteAfter ?? null,
      provenanceNote: sanitizeProvenanceNote(item.provenance?.note),
      visibility: "private" as const,
      status: "active" as const,
      sourceType: "import" as const,
    },
    warnings: [
      {
        code: "private-copy" as const,
        message:
          "The import creates a new private copy owned by the signed-in adult.",
        fields: ["visibility", "ownerUserId", "householdId", "subjectUserId"],
      },
      {
        code: "sharing-not-restored" as const,
        message: "Prior sharing grants are not restored or recreated.",
        fields: item.grants === undefined ? [] : ["grants"],
      },
      {
        code: "identifiers-not-preserved" as const,
        message:
          "Original database and identity identifiers are not preserved.",
        fields: identifiers,
      },
      {
        code: "lifecycle-reset" as const,
        message:
          "Archived, deleted, version, and timestamp state does not carry into the new copy.",
        fields: lifecycle,
      },
      {
        code: "fields-not-imported" as const,
        message:
          "Server-controlled source, ownership, purpose, and visibility fields do not influence the import.",
        fields: discarded,
      },
    ],
  };
}
