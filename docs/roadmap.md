# Phased Roadmap

## Phase 0: Repository Takeover

- Audit repository state, setup, stack, and baseline checks.
- Preserve current features and user changes.
- Commit product-facing Lighthouse rename.

## Phase 1: Trust Foundation

- Model person-owned records, household contexts, sharing grants, revocation, retention state, and audit events.
- Add server-side authorization helpers and focused policy tests.
- Keep production access gated until real identity and secret posture are configured.

## Phase 2: Family Library

- Build an end-to-end workflow for creating, viewing, searching, sharing, revoking, auditing, archiving, correcting, and exporting library items.
- Prove private-by-default adult ownership and household-admin boundary behavior.

## Phase 2B: Family Knowledge Graph Foundation

- Complete: migration-managed canonical entity and relationship registries.
- Complete: actor-owned sources, normalized entity envelope, source-record identity, temporal model, retention, legal hold, version history, and redacted graph audit.
- Complete: generalized endpoint-safe relationships and explicit graph sharing grants.
- Complete: typed Memory, Observation, Insight, Recommendation, Passport, connector, and unified-search contracts.
- Complete: PostgreSQL RLS proof for private, household, shared, revoked, cross-household, provenance, history, relationship, and Passport boundaries.
- Deferred: graph product APIs, domain backfills, search execution, semantic indexes, connector implementations, AI, and background processing.

## Phase 3: Consent and Connector Registry

- Add typed connector capability registry.
- Add safe manual import/export path before external connectors.
- Add provider-specific terms, scope, and platform limitation records.

## Phase 4: Insights and Signals

- Add deterministic Library statistics only.
- Add metric definitions with provenance, missing-data coverage, uncertainty, and allowed-use metadata.
- Defer AI summaries until provider/data-flow decisions and user-authorized purposes exist.

## Deferred Regulatory Gates

- Health, financial, identity document, child-specific, employment, education, and safety-critical domains require legal/security review before production release.
- Do not claim HIPAA, medical validity, financial suitability, employment suitability, or insurance eligibility support without specific review and evidence.
