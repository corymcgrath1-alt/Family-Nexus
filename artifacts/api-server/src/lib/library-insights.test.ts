import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LIBRARY_INSIGHTS_CATALOG_VERSION,
  LIBRARY_INSIGHTS_FORMULA_VERSION,
  libraryInsightDefinitionKeys,
  librarySignalDefinitionListResponseSchema,
  librarySignalDefinitionSchema,
  parseLibrarySignalDefinitions,
  type LibraryInsightDefinitionKey,
} from "./library-insights-contracts";
import { libraryCategories, librarySensitivity } from "./library-contracts";

const allowedUses = [
  "Personal Library organization",
  "Understanding the composition of records visible to the requesting user",
  "Privacy and retention review",
  "Product navigation",
];
const prohibitedUses = [
  "Diagnosing a person",
  "Employment, credit, insurance, housing, education, or eligibility decisions",
  "Comparing adults",
  "Ranking household members",
  "Inferring another adult's private behavior",
];

function definition(key: LibraryInsightDefinitionKey) {
  const outputShape =
    key === "library.items_by_category.count"
      ? {
          kind: "dimensioned_count" as const,
          dimension: "category" as const,
          allowedValues: [...libraryCategories],
        }
      : key === "library.items_by_sensitivity.count"
        ? {
            kind: "dimensioned_count" as const,
            dimension: "sensitivity" as const,
            allowedValues: [...librarySensitivity],
          }
        : { kind: "scalar_count" as const };

  return {
    definitionKey: key,
    name: `Definition ${key}`,
    domain: "family_library" as const,
    unit: "items" as const,
    timeWindow: "current_state" as const,
    formulaVersion: LIBRARY_INSIGHTS_FORMULA_VERSION,
    definition: "Exact SQL count over actor-visible non-deleted Library rows.",
    inputRequirements: {
      source: "family_library" as const,
      authorization: "currently_visible_rows" as const,
      includedStatuses: ["active", "archived"] as const,
      excludedStatuses: ["deleted"] as const,
    },
    evidenceKind: "deterministic_derived_metric" as const,
    outputShape,
    missingDataSemantics: {
      calculation: "zero_when_no_visible_rows" as const,
      sourceCompleteness: "unknown_user_controlled" as const,
      interpretationWarning:
        "Absence from the Library does not prove absence in the real world.",
    },
    baselineSemantics: {
      kind: "none" as const,
      explanation: "No baseline is used.",
    },
    evidenceThreshold: {
      minimumVisibleRows: 0 as const,
      semantics: "Zero is a valid exact result.",
    },
    uncertaintySemantics: {
      calculation: "none" as const,
      sourceCompleteness: "unknown_user_controlled" as const,
      interpretationWarning:
        "Absence from the Library does not prove absence in the real world.",
    },
    allowedUses,
    prohibitedUses,
    sensitivity: "personal" as const,
    ownerScope: "requesting_user" as const,
    defaultVisibility: "private" as const,
    explanation: "A private current-state organizational count.",
    status: "active" as const,
  };
}

const definitions = libraryInsightDefinitionKeys.map(definition);

test("exactly seven active Phase 4A definitions are registered", () => {
  assert.equal(libraryInsightDefinitionKeys.length, 7);
  assert.equal(
    definitions.filter((item) => item.status === "active").length,
    7,
  );
});

test("definition keys and formula versions are stable", () => {
  assert.deepEqual(libraryInsightDefinitionKeys, [
    "library.archived_items.count",
    "library.household_items.count",
    "library.items_by_category.count",
    "library.items_by_sensitivity.count",
    "library.owned_items.count",
    "library.shared_with_me.count",
    "library.visible_items.count",
  ]);
  assert(definitions.every((item) => item.formulaVersion === "v1"));
});

test("definition key and version combinations are unique", () => {
  const combinations = definitions.map(
    (item) => `${item.definitionKey}:${item.formulaVersion}`,
  );
  assert.equal(new Set(combinations).size, combinations.length);
});

test("every definition contains the complete governance metadata", () => {
  for (const item of definitions) {
    assert.doesNotThrow(() => librarySignalDefinitionSchema.parse(item));
  }
});

test("every definition is a deterministic derived metric", () => {
  assert(
    definitions.every(
      (item) => item.evidenceKind === "deterministic_derived_metric",
    ),
  );
});

test("every definition is private and requesting-user owned", () => {
  assert(
    definitions.every(
      (item) =>
        item.defaultVisibility === "private" &&
        item.ownerScope === "requesting_user",
    ),
  );
});

test("every definition has non-empty allowed and prohibited uses", () => {
  assert(
    definitions.every(
      (item) => item.allowedUses.length > 0 && item.prohibitedUses.length > 0,
    ),
  );
});

test("prohibited uses include adult comparison and eligibility decisions", () => {
  for (const item of definitions) {
    assert(item.prohibitedUses.some((use) => /comparing adults/i.test(use)));
    assert(item.prohibitedUses.some((use) => /eligibility/i.test(use)));
  }
});

test("category dimensions exactly match the registered Library enum", () => {
  const item = definition("library.items_by_category.count");
  assert.equal(item.outputShape.kind, "dimensioned_count");
  assert.deepEqual(item.outputShape.allowedValues, [...libraryCategories]);
});

test("sensitivity dimensions exactly match the registered Library enum", () => {
  const item = definition("library.items_by_sensitivity.count");
  assert.equal(item.outputShape.kind, "dimensioned_count");
  assert.deepEqual(item.outputShape.allowedValues, [...librarySensitivity]);
});

test("missing-data semantics separate exact calculation from source completeness", () => {
  for (const item of definitions) {
    assert.equal(item.uncertaintySemantics.calculation, "none");
    assert.equal(
      item.uncertaintySemantics.sourceCompleteness,
      "unknown_user_controlled",
    );
    assert.match(
      item.missingDataSemantics.interpretationWarning,
      /does not prove/,
    );
  }
});

test("definitions make no AI, inference, diagnosis, prediction, recommendation, or score claim", () => {
  for (const item of definitions) {
    const claims = [
      item.name,
      item.definition,
      item.explanation,
      ...item.allowedUses,
    ].join(" ");
    assert.doesNotMatch(
      claims,
      /\b(ai|inference|diagnosis|prediction|recommendation|universal score)\b/i,
    );
  }
});

test("malformed database definition rows fail closed", () => {
  const malformed = { ...definitions[0], ownerScope: "household" };
  assert.throws(() => parseLibrarySignalDefinitions([malformed]));
});

test("duplicate definition key and version combinations are rejected", () => {
  const duplicate = definitions.map((item) => ({ ...item }));
  duplicate[1] = { ...duplicate[0] };
  assert.throws(() =>
    librarySignalDefinitionListResponseSchema.parse({
      catalogVersion: LIBRARY_INSIGHTS_CATALOG_VERSION,
      definitions: duplicate,
    }),
  );
});
