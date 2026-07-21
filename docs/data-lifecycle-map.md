# Data Lifecycle Map

## Lifecycle States

1. Created or imported
2. Classified
3. Provenance recorded
4. Owner and subject resolved
5. Purpose and consent checked
6. Stored with retention state
7. Shared or kept private
8. Used for deterministic workflows
9. Used for analytics or AI only when allowed
10. Corrected, archived, exported, revoked, or deleted

## Current Implementation

- Created/imported: manual app actions and synthetic seed data.
- Classified: partially present in profile visibility fields; Family Library adds explicit sensitivity.
- Provenance: partial for memories; Family Library adds source metadata.
- Consent: not yet broadly implemented; Family Library sharing grants and revocations are the first consent-like access primitive.
- Retention: not broadly implemented; Family Library adds retention labels and archive/delete state.
- Export: not broadly implemented; Family Library adds JSON export for owned items.
- Deterministic insights: calculated on demand from all non-deleted, RLS-visible Family Library rows in one database snapshot. Phase 4A results are returned to the requesting user without observation persistence, audit-event writes, shared caching, or background calculation.
- Deletion propagation: documented as required, not yet implemented for all domains.

## Phase 4A Insight Lifecycle

1. Authenticate an adult session.
2. Open a transaction and set transaction-local actor and household context.
3. Validate the seven active, migration-governed definitions.
4. Aggregate only rows visible through PostgreSQL RLS, excluding deleted rows.
5. Return a private current-state response with coverage and uncertainty metadata.
6. Discard the calculated response after request delivery; create no signal observation or view audit trail.

Definitions can be disabled or superseded only through a reviewed migration. A changed formula receives a new formula version rather than silently replacing prior semantics.

## Deletion and Export Principles

- Adult-owned records must be exportable by the owner.
- Revocation blocks future access but does not silently rewrite history.
- Audit events should preserve security-relevant facts without retaining sensitive content.
- Production deletion must eventually propagate to backups, derived stores, search indexes, analytics, and connector caches according to a documented retention schedule.
