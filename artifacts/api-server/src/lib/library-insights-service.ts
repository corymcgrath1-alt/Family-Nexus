import { db, signalDefinitionsTable } from "@workspace/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { libraryCategories, librarySensitivity } from "./library-contracts";
import {
  LIBRARY_INSIGHTS_CATALOG_VERSION,
  LIBRARY_INSIGHTS_FORMULA_VERSION,
  legacyLibraryStatsResponseSchema,
  libraryInsightsResponseSchema,
  parseLibrarySignalDefinitions,
  type LibraryInsightsResponse,
} from "./library-insights-contracts";

export type LibraryInsightsActor = {
  id: number;
  householdId: number;
};

type AggregateRow = {
  actor_user_id: number | null;
  actor_household_id: number | null;
  calculated_at: Date | string;
  visible_items: string;
  owned_items: string;
  shared_with_me: string;
  household_items: string;
  archived_items: string;
  by_category: Record<string, string | number>;
  by_sensitivity: Record<string, string | number>;
};

function parseExactCount(value: string | number | bigint | undefined): number {
  const count = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("Library insight count is outside the supported range.");
  }
  return count;
}

function categoryCounts(values: AggregateRow["by_category"]) {
  return {
    note: parseExactCount(values.note),
    "document-reference": parseExactCount(values["document-reference"]),
    instruction: parseExactCount(values.instruction),
    decision: parseExactCount(values.decision),
    memory: parseExactCount(values.memory),
    "medical-reference": parseExactCount(values["medical-reference"]),
    "household-record": parseExactCount(values["household-record"]),
    "vehicle-record": parseExactCount(values["vehicle-record"]),
    "career-record": parseExactCount(values["career-record"]),
    other: parseExactCount(values.other),
  };
}

function sensitivityCounts(values: AggregateRow["by_sensitivity"]) {
  return {
    standard: parseExactCount(values.standard),
    personal: parseExactCount(values.personal),
    sensitive: parseExactCount(values.sensitive),
    restricted: parseExactCount(values.restricted),
  };
}

export async function getActiveLibraryInsightDefinitions() {
  const rows = await db
    .select({
      definitionKey: signalDefinitionsTable.definitionKey,
      name: signalDefinitionsTable.name,
      domain: signalDefinitionsTable.domain,
      unit: signalDefinitionsTable.unit,
      timeWindow: signalDefinitionsTable.timeWindow,
      formulaVersion: signalDefinitionsTable.formulaVersion,
      definition: signalDefinitionsTable.definition,
      inputRequirements: signalDefinitionsTable.inputRequirements,
      evidenceKind: signalDefinitionsTable.evidenceKind,
      outputShape: signalDefinitionsTable.outputShape,
      missingDataSemantics: signalDefinitionsTable.missingDataSemantics,
      baselineSemantics: signalDefinitionsTable.baselineSemantics,
      evidenceThreshold: signalDefinitionsTable.evidenceThreshold,
      uncertaintySemantics: signalDefinitionsTable.uncertaintySemantics,
      allowedUses: signalDefinitionsTable.allowedUses,
      prohibitedUses: signalDefinitionsTable.prohibitedUses,
      sensitivity: signalDefinitionsTable.sensitivity,
      ownerScope: signalDefinitionsTable.ownerScope,
      defaultVisibility: signalDefinitionsTable.defaultVisibility,
      explanation: signalDefinitionsTable.explanation,
      status: signalDefinitionsTable.status,
    })
    .from(signalDefinitionsTable)
    .where(
      and(
        eq(signalDefinitionsTable.domain, "family_library"),
        eq(
          signalDefinitionsTable.formulaVersion,
          LIBRARY_INSIGHTS_FORMULA_VERSION,
        ),
        eq(signalDefinitionsTable.status, "active"),
      ),
    )
    .orderBy(asc(signalDefinitionsTable.definitionKey));

  return parseLibrarySignalDefinitions(rows);
}

export async function calculateLibraryInsights(
  actor: LibraryInsightsActor,
): Promise<LibraryInsightsResponse> {
  await getActiveLibraryInsightDefinitions();

  const categoryDimensions = [...libraryCategories];
  const sensitivityDimensions = [...librarySensitivity];
  const categoryDimensionSql = sql.join(
    categoryDimensions.map((dimension) => sql`${dimension}`),
    sql`, `,
  );
  const sensitivityDimensionSql = sql.join(
    sensitivityDimensions.map((dimension) => sql`${dimension}`),
    sql`, `,
  );
  const result = await db.execute<AggregateRow>(sql`
    WITH visible AS MATERIALIZED (
      SELECT
        item.id,
        item.owner_user_id,
        item.visibility,
        item.status,
        item.category,
        item.sensitivity
      FROM library_items item
      WHERE item.status <> 'deleted'
    ),
    category_counts AS (
      SELECT
        dimension,
        count(visible.category)::text AS value
      FROM unnest(ARRAY[${categoryDimensionSql}]::text[]) AS dimension
      LEFT JOIN visible ON visible.category = dimension
      GROUP BY dimension
    ),
    sensitivity_counts AS (
      SELECT
        dimension,
        count(visible.sensitivity)::text AS value
      FROM unnest(ARRAY[${sensitivityDimensionSql}]::text[]) AS dimension
      LEFT JOIN visible ON visible.sensitivity = dimension
      GROUP BY dimension
    )
    SELECT
      lighthouse_actor_user_id() AS actor_user_id,
      lighthouse_actor_household_id() AS actor_household_id,
      statement_timestamp() AS calculated_at,
      count(*)::text AS visible_items,
      count(*) FILTER (
        WHERE visible.owner_user_id = lighthouse_actor_user_id()
      )::text AS owned_items,
      count(*) FILTER (
        WHERE visible.owner_user_id <> lighthouse_actor_user_id()
          AND visible.visibility = 'shared'
          AND EXISTS (
            SELECT 1
            FROM sharing_grants grant_row
            WHERE grant_row.resource_type = 'library_item'
              AND grant_row.resource_id = visible.id
              AND grant_row.grantee_user_id = lighthouse_actor_user_id()
              AND grant_row.permission = 'read'
              AND grant_row.revoked_at IS NULL
              AND (
                grant_row.expires_at IS NULL
                OR grant_row.expires_at > CURRENT_TIMESTAMP
              )
          )
      )::text AS shared_with_me,
      count(*) FILTER (
        WHERE visible.visibility = 'household'
      )::text AS household_items,
      count(*) FILTER (
        WHERE visible.status = 'archived'
      )::text AS archived_items,
      COALESCE(
        (SELECT jsonb_object_agg(dimension, value) FROM category_counts),
        '{}'::jsonb
      ) AS by_category,
      COALESCE(
        (SELECT jsonb_object_agg(dimension, value) FROM sensitivity_counts),
        '{}'::jsonb
      ) AS by_sensitivity
    FROM visible
  `);

  const row = result.rows[0];
  if (
    !row ||
    row.actor_user_id !== actor.id ||
    row.actor_household_id !== actor.householdId
  ) {
    throw new Error(
      "Authenticated database actor context is missing or mismatched.",
    );
  }

  const calculatedAt = new Date(row.calculated_at);
  if (Number.isNaN(calculatedAt.getTime())) {
    throw new Error("Library insight snapshot timestamp is invalid.");
  }

  return libraryInsightsResponseSchema.parse({
    catalogVersion: LIBRARY_INSIGHTS_CATALOG_VERSION,
    calculatedAt: calculatedAt.toISOString(),
    ownerUserId: actor.id,
    visibility: "private",
    evidenceKind: "deterministic_derived_metric",
    source: "family_library",
    authorizationBoundary: [
      "authenticated_session",
      "transaction_scoped_actor",
      "postgres_rls",
    ],
    coverage: {
      includedRows: "all_non_deleted_visible_family_library_rows",
      rowLimitApplied: false,
      deletedRowsExcluded: true,
      exactForDatabaseSnapshot: true,
      sourceCompleteness: "unknown_user_controlled",
      explanation:
        "All non-deleted Family Library rows visible to the requesting actor were counted without a row limit.",
    },
    uncertainty: {
      calculation: "none",
      sourceCompleteness: "unknown_user_controlled",
      interpretationWarning:
        "Absence from the Library does not prove absence in the real world.",
    },
    metrics: {
      visibleItems: {
        definitionKey: "library.visible_items.count",
        formulaVersion: LIBRARY_INSIGHTS_FORMULA_VERSION,
        value: parseExactCount(row.visible_items),
      },
      ownedItems: {
        definitionKey: "library.owned_items.count",
        formulaVersion: LIBRARY_INSIGHTS_FORMULA_VERSION,
        value: parseExactCount(row.owned_items),
      },
      sharedWithMe: {
        definitionKey: "library.shared_with_me.count",
        formulaVersion: LIBRARY_INSIGHTS_FORMULA_VERSION,
        value: parseExactCount(row.shared_with_me),
      },
      householdItems: {
        definitionKey: "library.household_items.count",
        formulaVersion: LIBRARY_INSIGHTS_FORMULA_VERSION,
        value: parseExactCount(row.household_items),
      },
      archivedItems: {
        definitionKey: "library.archived_items.count",
        formulaVersion: LIBRARY_INSIGHTS_FORMULA_VERSION,
        value: parseExactCount(row.archived_items),
      },
      byCategory: {
        definitionKey: "library.items_by_category.count",
        formulaVersion: LIBRARY_INSIGHTS_FORMULA_VERSION,
        values: categoryCounts(row.by_category),
      },
      bySensitivity: {
        definitionKey: "library.items_by_sensitivity.count",
        formulaVersion: LIBRARY_INSIGHTS_FORMULA_VERSION,
        values: sensitivityCounts(row.by_sensitivity),
      },
    },
  });
}

export function toLegacyLibraryStats(insights: LibraryInsightsResponse) {
  return legacyLibraryStatsResponseSchema.parse({
    visibleItems: insights.metrics.visibleItems.value,
    ownedItems: insights.metrics.ownedItems.value,
    sharedWithMe: insights.metrics.sharedWithMe.value,
    householdItems: insights.metrics.householdItems.value,
    byCategory: insights.metrics.byCategory.values,
    bySensitivity: insights.metrics.bySensitivity.values,
  });
}
