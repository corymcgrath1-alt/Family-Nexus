# Adding a Connector

1. Add one immutable `ConnectorRuntimeDefinition` with only implemented capabilities and scopes.
2. Choose the connector class: OAuth cloud, file import, device-mediated, API token, financial aggregator, or local bridge. Do not force non-OAuth connectors through the Google flow.
3. Implement `ConnectorProviderAdapter` for authorization, refresh, stable account identity, resource discovery, page/cursor transport, normalization, revocation, and error classification.
4. Define strict bounded provider and normalized Zod schemas.
5. Map only registered source object types to canonical entity types.
6. Reuse the connection, consent, resource, checkpoint, run, source, mapping, credential, audit, and RLS tables.
7. Derive owner, household, and Passport from the authenticated actor. Never accept them as client authority.
8. Define resource selection, purpose, scope, backfill, retention, correction, provider deletion, and material re-consent policies.
9. Add deterministic fake-provider scenarios for approval, denial, pagination, increments, tombstones, invalid cursor, token refresh, rate limit, outage, and permission loss.
10. Prove owner isolation, worker scope, idempotency, correction preservation, revocation during sync, and all retention choices in PostgreSQL and browser tests.

The shared platform is intentionally not a universal transport. A local bridge may need device pairing; a file import has no refresh token; a financial aggregator needs provider-specific consent and deletion; and device-mediated health data requires platform authorization and sensitivity review. Shared ownership and provenance do not imply shared acquisition mechanics.

Do not add an interface without one real implementation and test. Do not advertise provider notifications, writes, attachments, precise location, health, or financial capabilities until the transport, product policy, and authorization tests exist.
