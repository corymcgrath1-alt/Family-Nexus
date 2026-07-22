# Connector Operations

## Processes

- API: restricted `DATABASE_URL`; handles authenticated authorization, consent, discovery, manual sync, state, and revocation.
- Migration: administrative `DATABASE_MIGRATION_URL`; applies reviewed SQL only.
- Worker: restricted `CONNECTOR_WORKER_DATABASE_URL`; inherits runtime RLS plus only the due-connection claim function.

Run one scheduled claim with `pnpm run connector:worker:once`. An external scheduler may invoke that command repeatedly. No blanket database owner or superuser is used for routine sync.

## Environment

Required connector variables are documented in `.env.example`: provider mode, app origin, redirect allowlist, active key version, versioned keyring, and bounded backfill windows. Live mode additionally requires Google client ID, client secret, and exact redirect URI. Fake mode is accepted in test/development only and hard-fails in production.

## Operational Signals

Structured logs expose redacted signals for idle/claimed workers, completed and failed runs, fetched/changed counts, retries, rate-limit categories, cursor recovery, and reconnect-required state. Connector audit rows record user-visible lifecycle actions. Neither channel includes tokens, codes, cursors, event titles/descriptions, attendee addresses, or provider payloads.

Operational database queries using controlled administrative access can aggregate connections by state, runs/duration, counts, retries, failures, stale `running` rows, and expired leases. Those queries must not emit owner, provider-account, calendar, or content dimensions.

Each worker invocation applies the worker-only `lighthouse_purge_connector_operational_data` function before claiming work. It purges consumed or expired OAuth state after 24 hours and finalized redacted sync-run rows after 90 days. The request-time runtime role cannot invoke this cross-owner cleanup function. Connector audit retention follows the product audit policy rather than the shorter operational-log window.

## Recovery

- Expired lease: the next claim or manual run recovers the stale run.
- Rate limit/provider outage: bounded retries, then `degraded` with a redacted error.
- Invalid credentials/permission loss: `reconnect_required`.
- Invalid cursor: one bounded resource recovery.
- Revoked connection: no transition back to active and no later page commit.
- Key rotation: add a decryptable old version, make the new version active, then re-encrypt on controlled credential reads/writes before removing the old key.

Push notification endpoints are intentionally absent. A future endpoint must authenticate provider channel identifiers and only enqueue a connection-scoped job; notification bodies are never event truth.
