# Connector Sync Engine

## Execution

Manual, initial, scheduled, webhook-ready, and recovery trigger types share one orchestrator. This release executes manual/initial work synchronously and supplies `worker:once` for scheduled claims; it does not expose an unauthenticated notification endpoint.

Each run:

1. Re-checks owner, active consent, selected resources, and connection state under RLS.
2. Acquires or adopts a 15-minute connection lease.
3. Recovers stale running rows before starting a new run.
4. Refreshes encrypted credentials when expiry is near.
5. Processes selected calendars sequentially with pages bounded to provider limits.
6. Re-checks connection, consent, and resource selection before every page commit.
7. Commits normalized source objects, graph entities, Library projections, mappings, and the checkpoint in one actor transaction.
8. Advances a page token or final sync cursor only after that transaction commits.
9. Clears the lease and records redacted counts and status.

Sequential resources provide bounded concurrency of one. Each provider page is bounded to 250 objects and memory is released before the next page. Existing source objects, mappings, Library targets, and graph targets are loaded in four page-level indexed queries rather than per-event reads; repeated sync does not scan full history.

## Idempotency

The unique source identity is connection + selected resource + external object type + external object ID. A normalized SHA-256 checksum makes identical retries unchanged. Mappings ensure one source object reconciles one canonical event and Library projection. A crash before commit advances nothing; a crash after commit can replay safely.

## Retry and Recovery

Retryable rate-limit, network, and provider-availability failures use bounded exponential backoff with jitter and respect a provider retry delay when supplied. Invalid Google sync tokens mark the resource for recovery, clear only that checkpoint, and run the same bounded historical/future window. Recovery never becomes an unbounded account scrape.

Google documents final-page sync tokens, deleted-entry behavior, and HTTP 410 invalidation at <https://developers.google.com/workspace/calendar/api/guides/sync>. Quota backoff guidance is at <https://developers.google.com/workspace/calendar/api/guides/quota>.

Provider permission loss or refresh failure moves the connection to `reconnect_required`. Pause, consent supersession, or revocation blocks new work. Revocation during a retry or provider call is detected before the next page persist.
