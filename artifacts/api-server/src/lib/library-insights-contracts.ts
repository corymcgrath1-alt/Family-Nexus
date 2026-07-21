import { z } from "zod/v4";
import { libraryCategories, librarySensitivity } from "./library-contracts";

export const LIBRARY_INSIGHTS_CATALOG_VERSION = "library-insights.v1" as const;
export const LIBRARY_INSIGHTS_FORMULA_VERSION = "v1" as const;

export const libraryInsightDefinitionKeys = [
  "library.archived_items.count",
  "library.household_items.count",
  "library.items_by_category.count",
  "library.items_by_sensitivity.count",
  "library.owned_items.count",
  "library.shared_with_me.count",
  "library.visible_items.count",
] as const;

export type LibraryInsightDefinitionKey =
  (typeof libraryInsightDefinitionKeys)[number];

const exactStringArray = <T extends readonly [string, ...string[]]>(
  expected: T,
) =>
  z
    .array(z.enum(expected))
    .length(expected.length)
    .refine(
      (actual) => actual.every((value, index) => value === expected[index]),
      "Values must match the registered order.",
    );

const inputRequirementsSchema = z
  .object({
    source: z.literal("family_library"),
    authorization: z.literal("currently_visible_rows"),
    includedStatuses: z.tuple([z.literal("active"), z.literal("archived")]),
    excludedStatuses: z.tuple([z.literal("deleted")]),
  })
  .strict();

const missingDataSemanticsSchema = z
  .object({
    calculation: z.literal("zero_when_no_visible_rows"),
    sourceCompleteness: z.literal("unknown_user_controlled"),
    interpretationWarning: z.string().trim().min(1).max(300),
  })
  .strict();

const baselineSemanticsSchema = z
  .object({
    kind: z.literal("none"),
    explanation: z.string().trim().min(1).max(300),
  })
  .strict();

const evidenceThresholdSchema = z
  .object({
    minimumVisibleRows: z.literal(0),
    semantics: z.string().trim().min(1).max(300),
  })
  .strict();

const uncertaintySemanticsSchema = z
  .object({
    calculation: z.literal("none"),
    sourceCompleteness: z.literal("unknown_user_controlled"),
    interpretationWarning: z.string().trim().min(1).max(300),
  })
  .strict();

const outputShapeSchema = z.union([
  z.object({ kind: z.literal("scalar_count") }).strict(),
  z
    .object({
      kind: z.literal("dimensioned_count"),
      dimension: z.literal("category"),
      allowedValues: exactStringArray(libraryCategories),
    })
    .strict(),
  z
    .object({
      kind: z.literal("dimensioned_count"),
      dimension: z.literal("sensitivity"),
      allowedValues: exactStringArray(librarySensitivity),
    })
    .strict(),
]);

export const librarySignalDefinitionSchema = z
  .object({
    definitionKey: z.enum(libraryInsightDefinitionKeys),
    name: z.string().trim().min(1).max(160),
    domain: z.literal("family_library"),
    unit: z.literal("items"),
    timeWindow: z.literal("current_state"),
    formulaVersion: z.literal(LIBRARY_INSIGHTS_FORMULA_VERSION),
    definition: z.string().trim().min(1).max(1000),
    inputRequirements: inputRequirementsSchema,
    evidenceKind: z.literal("deterministic_derived_metric"),
    outputShape: outputShapeSchema,
    missingDataSemantics: missingDataSemanticsSchema,
    baselineSemantics: baselineSemanticsSchema,
    evidenceThreshold: evidenceThresholdSchema,
    uncertaintySemantics: uncertaintySemanticsSchema,
    allowedUses: z.array(z.string().trim().min(1).max(300)).min(1),
    prohibitedUses: z.array(z.string().trim().min(1).max(300)).min(1),
    sensitivity: z.literal("personal"),
    ownerScope: z.literal("requesting_user"),
    defaultVisibility: z.literal("private"),
    explanation: z.string().trim().min(1).max(500),
    status: z.literal("active"),
  })
  .strict();

export type LibrarySignalDefinition = z.infer<
  typeof librarySignalDefinitionSchema
>;

export const librarySignalDefinitionListResponseSchema = z
  .object({
    catalogVersion: z.literal(LIBRARY_INSIGHTS_CATALOG_VERSION),
    definitions: z
      .array(librarySignalDefinitionSchema)
      .length(libraryInsightDefinitionKeys.length),
  })
  .strict()
  .superRefine((value, context) => {
    const keys = value.definitions.map(
      (definition) => definition.definitionKey,
    );
    const uniqueKeys = new Set(keys);
    if (uniqueKeys.size !== keys.length) {
      context.addIssue({
        code: "custom",
        message: "Definition key and version combinations must be unique.",
        path: ["definitions"],
      });
    }
    if (
      keys.some((key, index) => key !== libraryInsightDefinitionKeys[index])
    ) {
      context.addIssue({
        code: "custom",
        message: "Definitions must contain every registered key in order.",
        path: ["definitions"],
      });
    }
  });

export const metricCoverageSchema = z
  .object({
    includedRows: z.literal("all_non_deleted_visible_family_library_rows"),
    rowLimitApplied: z.literal(false),
    deletedRowsExcluded: z.literal(true),
    exactForDatabaseSnapshot: z.literal(true),
    sourceCompleteness: z.literal("unknown_user_controlled"),
    explanation: z.string().trim().min(1).max(500),
  })
  .strict();

export const metricUncertaintySchema = z
  .object({
    calculation: z.literal("none"),
    sourceCompleteness: z.literal("unknown_user_controlled"),
    interpretationWarning: z.string().trim().min(1).max(300),
  })
  .strict();

const nonnegativeCount = z.number().int().nonnegative();

const scalarInsightValue = <T extends LibraryInsightDefinitionKey>(key: T) =>
  z
    .object({
      definitionKey: z.literal(key),
      formulaVersion: z.literal(LIBRARY_INSIGHTS_FORMULA_VERSION),
      value: nonnegativeCount,
    })
    .strict();

const categoryCountsSchema = z
  .object({
    note: nonnegativeCount,
    "document-reference": nonnegativeCount,
    instruction: nonnegativeCount,
    decision: nonnegativeCount,
    memory: nonnegativeCount,
    "medical-reference": nonnegativeCount,
    "household-record": nonnegativeCount,
    "vehicle-record": nonnegativeCount,
    "career-record": nonnegativeCount,
    other: nonnegativeCount,
  })
  .strict();

const sensitivityCountsSchema = z
  .object({
    standard: nonnegativeCount,
    personal: nonnegativeCount,
    sensitive: nonnegativeCount,
    restricted: nonnegativeCount,
  })
  .strict();

export const categoryInsightValueSchema = z
  .object({
    definitionKey: z.literal("library.items_by_category.count"),
    formulaVersion: z.literal(LIBRARY_INSIGHTS_FORMULA_VERSION),
    values: categoryCountsSchema,
  })
  .strict();

export const sensitivityInsightValueSchema = z
  .object({
    definitionKey: z.literal("library.items_by_sensitivity.count"),
    formulaVersion: z.literal(LIBRARY_INSIGHTS_FORMULA_VERSION),
    values: sensitivityCountsSchema,
  })
  .strict();

export const libraryInsightsResponseSchema = z
  .object({
    catalogVersion: z.literal(LIBRARY_INSIGHTS_CATALOG_VERSION),
    calculatedAt: z.string().datetime({ offset: true }),
    ownerUserId: z.number().int().positive(),
    visibility: z.literal("private"),
    evidenceKind: z.literal("deterministic_derived_metric"),
    source: z.literal("family_library"),
    authorizationBoundary: z.tuple([
      z.literal("authenticated_session"),
      z.literal("transaction_scoped_actor"),
      z.literal("postgres_rls"),
    ]),
    coverage: metricCoverageSchema,
    uncertainty: metricUncertaintySchema,
    metrics: z
      .object({
        visibleItems: scalarInsightValue("library.visible_items.count"),
        ownedItems: scalarInsightValue("library.owned_items.count"),
        sharedWithMe: scalarInsightValue("library.shared_with_me.count"),
        householdItems: scalarInsightValue("library.household_items.count"),
        archivedItems: scalarInsightValue("library.archived_items.count"),
        byCategory: categoryInsightValueSchema,
        bySensitivity: sensitivityInsightValueSchema,
      })
      .strict(),
  })
  .strict();

export const legacyLibraryStatsResponseSchema = z
  .object({
    visibleItems: nonnegativeCount,
    ownedItems: nonnegativeCount,
    sharedWithMe: nonnegativeCount,
    householdItems: nonnegativeCount,
    byCategory: categoryCountsSchema,
    bySensitivity: sensitivityCountsSchema,
  })
  .strict();

export type LibraryInsightsResponse = z.infer<
  typeof libraryInsightsResponseSchema
>;

export function parseLibrarySignalDefinitions(
  rows: readonly unknown[],
): LibrarySignalDefinition[] {
  const definitions = rows
    .map((row) => librarySignalDefinitionSchema.parse(row))
    .sort((left, right) =>
      left.definitionKey.localeCompare(right.definitionKey),
    );
  return librarySignalDefinitionListResponseSchema.parse({
    catalogVersion: LIBRARY_INSIGHTS_CATALOG_VERSION,
    definitions,
  }).definitions;
}
