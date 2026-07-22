# Connector Platform Overview

Lighthouse connectors are user-owned ingestion boundaries. A connector may acquire provider data only after an authenticated adult completes provider authorization, selects provider resources, and records separate Lighthouse import consent. A connection belongs to one actor and one Lighthouse Passport; household membership neither creates nor extends connector access.

## Shared Platform

The provider-neutral platform supplies:

- Immutable, code-owned connector definitions and machine-readable capabilities.
- Owner-bound connections, explicit consents, resource selections, encrypted credentials, sync checkpoints, runs, source objects, and source mappings.
- A centralized connection state machine.
- One-time OAuth state, PKCE, redirect allowlisting, scope validation, and key-versioned authenticated encryption.
- Leased, page-committed, retry-safe synchronization.
- Canonical knowledge entities plus private Family Library projections.
- Source-object checksums and mappings for idempotency and reconciliation.
- Actor-scoped PostgreSQL RLS, redacted connector audit events, and generic IDOR responses.
- Retain, archive, and eligible-delete revocation policies.

Provider adapters own transport, provider response validation, account identity resolution, resource discovery, cursor calls, normalization, revocation, and provider error classification. They cannot choose a Lighthouse owner, household, visibility, grant, or consent state.

## Implemented Connector

Google Calendar is the only live connector definition in this milestone. It supports read-only OAuth, calendar discovery, explicit selection, bounded initial import, incremental sync, manual and scheduled execution, pause/resume, reconnect state, and revocation. No Gmail, Contacts, Drive, attachment, or calendar-write capability is implemented.

## Trust Boundaries

1. The browser receives an authorization URL and redacted connection state, never tokens.
2. Provider authorization proves provider access; it does not create Lighthouse import consent.
3. The API derives actor, household, and Passport from the authenticated session.
4. Normal API SQL runs inside transaction-scoped actor context.
5. Credentials are encrypted in application code and are unavailable through ordinary runtime table privileges.
6. A scheduled worker claims one due connection through a narrow database function, then re-enters actor-scoped RLS.
7. Provider IDs are provenance and idempotency keys, never authorization tokens.
8. Imported events are private until the owner uses Lighthouse sharing separately.

The shared model covers OAuth cloud, file import, device-mediated, API-token, financial aggregator, and local bridge connectors at the ownership, consent, provenance, health, and deletion layers. Authentication and transport remain connector-class-specific.
