# Phase 2 Connector Remediation Work Log

Branch: `codex/lighthouse-phase2-review-fixes`

## Implementation Plan

1. Move session-secret validation into a pure bootstrap helper and make every
   environment explicit, with stricter production rules.
2. Extend the reviewed SQL runner with a checksummed migration ledger,
   transactional application, verified legacy bootstrap, and PostgreSQL-backed
   upgrade/rollback tests.
3. Add a forward-only corrective migration for expired sync-lease reclaim,
   durable backfill query state, and owner-validated source mappings.
4. Serialize connector persistence and revocation by locking the connection row
   first in every short database transaction; provider calls remain outside
   transactions.
5. Persist and fingerprint the exact initial-backfill query, then validate
   restart behavior with a strict fake-provider contract.
6. Publish the effective import window through the connector definition API,
   include it in consent material versioning, and render it in the app.
7. Regenerate contracts, run clean and upgrade database proofs, integration and
   browser tests, production builds, and review each focused commit.

## Lock Order

Connector operations that persist provider-derived state acquire the owned
`connector_connections` row first, then access consent/resource, source,
mapping/target, checkpoint, run, and audit rows in that order. No provider
network call occurs while the database transaction or connection-row lock is
held.

## Implemented Proofs

- Production session startup rejects missing, weak, and known fallback secrets.
- The SQL runner records checksums, applies one migration per transaction,
  verifies legacy schema markers before bootstrap, and rejects checksum drift.
- Migration `0005_connector_phase2_review_fixes.sql` repairs stale lease
  recovery, durable backfill pagination state, and mapping-target RLS.
- PostgreSQL tests cover upgrade, rollback/retry, concurrent stale-lease claim,
  revocation between fetch and persist, cross-owner mapping attempts, and
  consent renewal after a material import-policy change.
- The fake Google provider enforces identical initial-query parameters across
  page tokens so restart behavior follows the provider contract.
