# Connector Domain Model

## Code-Owned Definition

`ConnectorRuntimeDefinition` is immutable application code. It records a stable key, provider, category, version, availability, authentication modes, capabilities, source object types, target entity types, sync modes, minimum and optional scopes, sensitivity, and user-facing documentation. Duplicate and unavailable definitions fail closed. Users cannot register trusted definitions.

## Actor-Owned Operations

| Model | Purpose | Important boundary |
| --- | --- | --- |
| `connector_connections` | One external account authorization | Owner, Passport, and household are server-derived |
| `connector_consents` | Explicit Lighthouse use authorization | Separate from token possession; material resource changes supersede it |
| `connector_resource_selections` | Provider sub-resources | Discovery defaults to unselected |
| `connector_credentials` | Protected OAuth token set | No ordinary runtime table privilege |
| `connector_oauth_states` | One-time OAuth and encrypted PKCE state | Ten-minute expiry; actor and Passport bound |
| `connector_sync_checkpoints` | Page and incremental cursor durability | One row per selected resource |
| `connector_sync_runs` | Redacted attempt accounting | No provider payloads, tokens, codes, or cursor values |
| `connector_source_objects` | Normalized provider provenance | Unique per connection, resource, object type, and external ID |
| `connector_source_mappings` | Source-to-entity/Library reconciliation | Tracks transformation versions and user overrides |
| `connector_audit_events` | Security and lifecycle audit | Action metadata only; no record content or secrets |

Connections prevent duplicate active links for the same owner, connector, and provider stable account ID. Email is display metadata, not account identity.

## State Machine

States are `pending_authorization`, `active`, `syncing`, `paused`, `degraded`, `reconnect_required`, `revoked`, `archived`, and `failed`. Application and database transition guards use the same rules. Revoked connections can only archive; archived connections cannot reactivate. Missing credentials, consent, selected resources, or actor context never produce an empty successful sync.

## Worker Identity

`lighthouse_connector_worker` is a non-login, non-superuser, non-`BYPASSRLS` role. A worker login may inherit it and `lighthouse_runtime`. Its added authority is limited to `lighthouse_claim_due_connector()`, which atomically returns one connection, owner, household, and lease, plus `lighthouse_purge_connector_operational_data()`, which deletes only expired OAuth state and old finalized sync runs. The worker then executes the normal sync service with that exact actor. The normal API role cannot invoke either cross-owner function, and the worker cannot browse owner rows without actor context.
