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

The Family Knowledge Graph implements the canonical envelope for source, classification, owner, subject, visibility, confidence, verification, time, retention, legal hold, version, and audit state. Entity and relationship corrections create immutable snapshots. Runtime users archive or mark deleted; they cannot physically delete graph rows. Source-record references support idempotent connector retries without adopting provider identifiers as canonical IDs.

## Deletion and Export Principles

- Adult-owned records must be exportable by the owner.
- Revocation blocks future access but does not silently rewrite history.
- Audit events should preserve security-relevant facts without retaining sensitive content.
- Production deletion must eventually propagate to backups, derived stores, search indexes, analytics, and connector caches according to a documented retention schedule.

## Graph Lifecycle

1. Validate an input against a registered type and versioned mapping.
2. Create an actor-owned source without credentials or unbounded payloads.
3. Normalize entities and then relationships inside actor context.
4. Record version 1 and a redacted creation audit automatically.
5. Share only through a record grant; keep provenance and historical snapshots owner-only.
6. Correct with an exact version increment.
7. Archive reversibly or mark deleted when no legal hold applies.
8. Revoke access immediately without rewriting owner history.
9. Perform future physical purge only through a controlled retention process that also covers projections and backups.

No connector sync, graph projection, binary store, insight generation, or Passport export lifecycle runs in this milestone.
