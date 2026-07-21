ALTER TABLE signal_definitions
  ADD COLUMN IF NOT EXISTS definition_key text,
  ADD COLUMN IF NOT EXISTS evidence_kind text,
  ADD COLUMN IF NOT EXISTS output_shape jsonb,
  ADD COLUMN IF NOT EXISTS missing_data_semantics jsonb,
  ADD COLUMN IF NOT EXISTS baseline_semantics jsonb,
  ADD COLUMN IF NOT EXISTS evidence_threshold jsonb,
  ADD COLUMN IF NOT EXISTS uncertainty_semantics jsonb,
  ADD COLUMN IF NOT EXISTS owner_scope text,
  ADD COLUMN IF NOT EXISTS default_visibility text,
  ADD COLUMN IF NOT EXISTS explanation text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS disabled_at timestamp with time zone;

-- Pre-existing definitions predate the governed registry. Give each a stable,
-- non-conflicting key and disable it until a future reviewed migration assigns
-- complete semantics.
UPDATE signal_definitions
SET
  definition_key = COALESCE(
    definition_key,
    'legacy.' || md5(concat_ws('|', id::text, domain, name, formula_version))
  ),
  evidence_kind = COALESCE(evidence_kind, 'legacy_unclassified'),
  output_shape = COALESCE(output_shape, '{"kind":"legacy_unknown"}'::jsonb),
  missing_data_semantics = COALESCE(
    missing_data_semantics,
    '{"calculation":"unknown","sourceCompleteness":"unknown"}'::jsonb
  ),
  baseline_semantics = COALESCE(
    baseline_semantics,
    '{"kind":"unknown","explanation":"Legacy definition pending review."}'::jsonb
  ),
  evidence_threshold = COALESCE(
    evidence_threshold,
    '{"minimumVisibleRows":0,"semantics":"Legacy definition pending review."}'::jsonb
  ),
  uncertainty_semantics = COALESCE(
    uncertainty_semantics,
    '{"calculation":"unknown","sourceCompleteness":"unknown","interpretationWarning":"Legacy definition pending review."}'::jsonb
  ),
  owner_scope = COALESCE(owner_scope, 'requesting_user'),
  default_visibility = COALESCE(default_visibility, 'private'),
  explanation = COALESCE(explanation, 'Legacy definition pending governed review.'),
  status = COALESCE(status, 'disabled'),
  disabled_at = CASE
    WHEN COALESCE(status, 'disabled') = 'disabled'
      THEN COALESCE(disabled_at, now())
    ELSE disabled_at
  END;

ALTER TABLE signal_definitions
  ALTER COLUMN definition_key SET NOT NULL,
  ALTER COLUMN evidence_kind SET NOT NULL,
  ALTER COLUMN output_shape SET NOT NULL,
  ALTER COLUMN missing_data_semantics SET NOT NULL,
  ALTER COLUMN baseline_semantics SET NOT NULL,
  ALTER COLUMN evidence_threshold SET NOT NULL,
  ALTER COLUMN uncertainty_semantics SET NOT NULL,
  ALTER COLUMN owner_scope SET NOT NULL,
  ALTER COLUMN default_visibility SET NOT NULL,
  ALTER COLUMN explanation SET NOT NULL,
  ALTER COLUMN status SET NOT NULL;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'signal_definitions_status_check'
      AND conrelid = 'signal_definitions'::regclass
  ) THEN
    ALTER TABLE signal_definitions
      ADD CONSTRAINT signal_definitions_status_check
      CHECK (status IN ('active', 'disabled'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'signal_definitions_disabled_at_check'
      AND conrelid = 'signal_definitions'::regclass
  ) THEN
    ALTER TABLE signal_definitions
      ADD CONSTRAINT signal_definitions_disabled_at_check
      CHECK (
        (status = 'active' AND disabled_at IS NULL)
        OR (status = 'disabled' AND disabled_at IS NOT NULL)
      );
  END IF;
END
$constraints$;

CREATE UNIQUE INDEX IF NOT EXISTS signal_definitions_key_version_uq
  ON signal_definitions (definition_key, formula_version);

WITH governed_defaults AS (
  SELECT
    '{"source":"family_library","authorization":"currently_visible_rows","includedStatuses":["active","archived"],"excludedStatuses":["deleted"]}'::jsonb AS input_requirements,
    '{"calculation":"zero_when_no_visible_rows","sourceCompleteness":"unknown_user_controlled","interpretationWarning":"Absence from the Library does not prove absence in the real world."}'::jsonb AS missing_data_semantics,
    '{"kind":"none","explanation":"Current-state counts have no personal or household baseline."}'::jsonb AS baseline_semantics,
    '{"minimumVisibleRows":0,"semantics":"Zero is a valid exact result."}'::jsonb AS evidence_threshold,
    '{"calculation":"none","sourceCompleteness":"unknown_user_controlled","interpretationWarning":"Absence from the Library does not prove absence in the real world."}'::jsonb AS uncertainty_semantics,
    '["Personal Library organization","Understanding the composition of records visible to the requesting user","Privacy and retention review","Product navigation"]'::jsonb AS allowed_uses,
    '["Diagnosing a person","Evaluating mental or physical health","Employment, credit, insurance, housing, education, or eligibility decisions","Comparing adults","Ranking household members","Inferring another adult''s private behavior","Safety-critical decisions","Automatic sharing or disclosure"]'::jsonb AS prohibited_uses
), definitions (
  definition_key,
  name,
  definition,
  output_shape,
  explanation
) AS (
  VALUES
    (
      'library.visible_items.count',
      'Visible Library items',
      'Count every Family Library row visible through the requesting actor''s current PostgreSQL RLS context where status is not deleted.',
      '{"kind":"scalar_count"}'::jsonb,
      'The number of active or archived Library items currently visible to you.'
    ),
    (
      'library.owned_items.count',
      'Owned Library items',
      'Count every non-deleted, RLS-visible Family Library row whose owner_user_id equals the requesting actor user ID.',
      '{"kind":"scalar_count"}'::jsonb,
      'The number of visible Library items owned by you.'
    ),
    (
      'library.shared_with_me.count',
      'Library items shared with me',
      'Count every non-deleted, RLS-visible Family Library row owned by another user with shared visibility and a currently active read grant for the requesting actor.',
      '{"kind":"scalar_count"}'::jsonb,
      'The number of another owner''s Library items currently shared with you.'
    ),
    (
      'library.household_items.count',
      'Household Library items',
      'Count every non-deleted, RLS-visible Family Library row with household visibility.',
      '{"kind":"scalar_count"}'::jsonb,
      'The number of household-visible Library items currently visible to you.'
    ),
    (
      'library.archived_items.count',
      'Archived Library items',
      'Count every RLS-visible Family Library row whose status is archived.',
      '{"kind":"scalar_count"}'::jsonb,
      'The number of archived Library items currently visible to you.'
    ),
    (
      'library.items_by_category.count',
      'Visible Library items by category',
      'Group every non-deleted, RLS-visible Family Library row by the registered Library category enum and return an exact count for every registered category, including zero values.',
      '{"kind":"dimensioned_count","dimension":"category","allowedValues":["note","document-reference","instruction","decision","memory","medical-reference","household-record","vehicle-record","career-record","other"]}'::jsonb,
      'The category composition of Library items currently visible to you.'
    ),
    (
      'library.items_by_sensitivity.count',
      'Visible Library items by sensitivity',
      'Group every non-deleted, RLS-visible Family Library row by the registered Library sensitivity enum and return an exact count for every registered class, including zero values.',
      '{"kind":"dimensioned_count","dimension":"sensitivity","allowedValues":["standard","personal","sensitive","restricted"]}'::jsonb,
      'The sensitivity composition of Library items currently visible to you.'
    )
)
INSERT INTO signal_definitions (
  definition_key,
  name,
  domain,
  unit,
  time_window,
  formula_version,
  definition,
  input_requirements,
  evidence_kind,
  output_shape,
  missing_data_semantics,
  baseline_semantics,
  evidence_threshold,
  uncertainty_semantics,
  allowed_uses,
  prohibited_uses,
  sensitivity,
  owner_scope,
  default_visibility,
  explanation,
  status,
  disabled_at
)
SELECT
  definitions.definition_key,
  definitions.name,
  'family_library',
  'items',
  'current_state',
  'v1',
  definitions.definition,
  governed_defaults.input_requirements,
  'deterministic_derived_metric',
  definitions.output_shape,
  governed_defaults.missing_data_semantics,
  governed_defaults.baseline_semantics,
  governed_defaults.evidence_threshold,
  governed_defaults.uncertainty_semantics,
  governed_defaults.allowed_uses,
  governed_defaults.prohibited_uses,
  'personal',
  'requesting_user',
  'private',
  definitions.explanation,
  'active',
  NULL
FROM definitions
CROSS JOIN governed_defaults
ON CONFLICT (definition_key, formula_version) DO NOTHING;

GRANT SELECT ON signal_definitions TO lighthouse_runtime;
REVOKE INSERT, UPDATE, DELETE ON signal_definitions FROM lighthouse_runtime;
