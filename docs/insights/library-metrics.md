# Governed Family Library Metrics

## Phase 4A Boundary

Lighthouse Phase 4A provides seven deterministic, current-state Family Library metrics. They are private to the requesting adult, calculated synchronously from rows readable through that actor's transaction-scoped PostgreSQL RLS context, and never persisted as signal observations.

The calculation is exact for the database snapshot. The Library is user-controlled, so real-world source completeness is unknown. Absence from the Library does not prove absence in the real world.

## Definitions

All definitions use formula version `v1`, time window `current_state`, unit `items`, evidence kind `deterministic_derived_metric`, owner scope `requesting_user`, and default visibility `private`.

| Definition key | Exact formula |
| --- | --- |
| `library.visible_items.count` | Count all non-deleted Library rows visible through the requesting actor's RLS context. |
| `library.owned_items.count` | Count non-deleted visible rows whose owner is the requesting actor. |
| `library.shared_with_me.count` | Count non-deleted visible shared rows owned by another user and readable through a current active read grant to the actor. |
| `library.household_items.count` | Count non-deleted visible rows with household visibility. |
| `library.archived_items.count` | Count visible rows with archived status. |
| `library.items_by_category.count` | Count non-deleted visible rows for every registered Library category, including zero buckets. |
| `library.items_by_sensitivity.count` | Count non-deleted visible rows for every registered Library sensitivity class, including zero buckets. |

Active and archived records contribute to the visible, owned, shared, household, category, and sensitivity metrics. Deleted records never contribute. No row limit is applied.

## Governance

`signal_definitions` is the canonical migration-managed registry. Every definition includes its formula, inputs, output shape, evidence threshold, missing-data and baseline semantics, uncertainty, sensitivity, allowed uses, prohibited uses, explanation, owner scope, visibility, and status. Runtime roles can read active definitions but cannot insert, update, or delete them. There is no mutable formula API.

A future migration may disable a definition by setting `status = disabled` and `disabled_at`. A semantic formula change must add a new formula version; it must not silently replace `v1`. The API fails closed when any required active definition is missing, duplicated, out of order, or malformed.

## Coverage And Uncertainty

- Coverage: every non-deleted Family Library row visible to the actor in one database snapshot.
- Row limit: none.
- Calculation uncertainty: none; PostgreSQL performs exact integer counts.
- Source completeness: unknown and user-controlled.
- Interpretation: these counts describe Lighthouse records, not the user's complete real life.

The response includes no raw record, title, body, source label, provenance note, item ID, grant ID, audit ID, owner comparison, subject comparison, or household-member ranking. Registered enums, not untrusted database text, define dimension keys.

## Allowed Uses

- Personal Library organization
- Understanding the composition of records visible to the requesting user
- Privacy and retention review
- Product navigation

## Prohibited Uses

- Diagnosis or evaluation of mental or physical health
- Employment, credit, insurance, housing, education, eligibility, or safety-critical decisions
- Comparing adults or ranking household members
- Inferring another adult's private behavior
- Automatic sharing or disclosure

Phase 4A has no AI, model call, inference, recommendation, prediction, universal score, person comparison, trend, or external connector calculation.

## Read-Only Lifecycle

`GET /api/insights/definitions` and `GET /api/insights/library` are read-only. Insight reads intentionally create no `signal_observations` or audit events and modify no Library, sharing, consent, source, or record rows. This avoids write amplification and a secondary behavioral history for frequently refreshed aggregate views. Each Library insight request calculates a fresh result; there is no shared cache or background refresh.
