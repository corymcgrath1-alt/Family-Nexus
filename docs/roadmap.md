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

## Phase 3: Consent and Connector Registry

- Phase 3A complete: add the immutable, typed `connector-catalog.v1` capability registry.
- Phase 3A complete: add safe, bounded manual `library-item.v1` import and existing JSON export before external connectors.
- Phase 3A complete: record provider-specific status, terms review, scope, purpose, sensitivity, refresh, regional, and platform limitations.
- Deferred: implement no live OAuth, periodic API, device collector, portability, health, monitoring, or scraping connector until its separate review gate is complete.

## Phase 4: Insights and Signals

- Phase 4A complete: govern seven versioned, deterministic Family Library metric definitions in PostgreSQL.
- Phase 4A complete: calculate exact, current-state, requesting-user-owned counts from RLS-visible Library rows without persisting observations.
- Phase 4A complete: expose the governed definitions and private counts through authenticated APIs and the Insights page.
- Deferred: persisted signal history, trends, recommendations, AI summaries, external-connector insights, health or financial insights, and household-member comparisons.
- Deferred: production identity, application-wide legacy-table RLS, and full consent lifecycle automation.

## Deferred Regulatory Gates

- Health, financial, identity document, child-specific, employment, education, and safety-critical domains require legal/security review before production release.
- Do not claim HIPAA, medical validity, financial suitability, employment suitability, or insurance eligibility support without specific review and evidence.
