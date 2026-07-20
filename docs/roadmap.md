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
