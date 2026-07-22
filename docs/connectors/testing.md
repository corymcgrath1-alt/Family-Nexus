# Connector Testing

The normal suite uses PostgreSQL and the deterministic fake Google provider. Live Google credentials are not needed.

```bash
pnpm run db:test:reset
pnpm run test:connector-platform
pnpm run test:integration
pnpm run test:e2e
```

Unit tests cover definitions/scopes, state transitions, AES-GCM round trips and tamper/wrong-key failure, OAuth state/PKCE, redirect validation, event/recurrence/tombstone normalization, checksums, pagination, incremental cursors, and error classification.

Integration tests use the administrative URL only for fixtures and assertions. API requests use the restricted runtime URL. Worker tests use a separate worker login. They verify schema constraints/RLS, credential isolation, one-time state, explicit selection and consent, source idempotency, private imports, same-household isolation, incremental changes, correction preservation, pause/resume, scheduled claim authority, revocation during retry, redacted audit data, and retain/delete lifecycles.

Playwright drives two adult sessions through authorization, selection, consent, initial and repeated sync, increment reconciliation, correction, pause/resume, same-household denial, and revocation. A second scenario verifies eligible permanent deletion.

Fake-provider scenarios are available only while `NODE_ENV=test` and `CONNECTOR_PROVIDER_MODE=fake`: incremental update/new/delete, provider update, cursor invalidation, token expiry, refresh failure, rate limit, outage, and permission loss. The test route first checks connection ownership and returns 404 in all other modes.

Optional live testing should use a dedicated Google test project/account with synthetic calendars, exact loopback redirect configuration, and no real family data.
