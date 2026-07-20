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
- Deletion propagation: documented as required, not yet implemented for all domains.

## Deletion and Export Principles

- Adult-owned records must be exportable by the owner.
- Revocation blocks future access but does not silently rewrite history.
- Audit events should preserve security-relevant facts without retaining sensitive content.
- Production deletion must eventually propagate to backups, derived stores, search indexes, analytics, and connector caches according to a documented retention schedule.
