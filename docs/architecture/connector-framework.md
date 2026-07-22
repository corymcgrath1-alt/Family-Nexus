# Connector Framework

## Boundary

Connectors translate provider data into the canonical knowledge model. They do not choose actor identity, bypass consent, or write unvalidated provider payloads directly into graph metadata. The framework in `@workspace/knowledge-model` defines provider-neutral contracts; Google Calendar is the first implemented adapter and proof.

## Versioned Definition

Every connector definition declares:

- Stable connector key and version.
- Display name and capabilities: import, incremental sync, deletion propagation, export.
- Registered entity and relationship types it may emit.
- Manual, on-demand, or bounded periodic sync frequency.
- Authentication kind and required authorization material.
- Purpose-described permissions.
- Passive, active, or no health-check strategy.
- Optional rate-limit window.
- Versioned provider-type-to-entity mappings.

The registry rejects duplicate connector key/version pairs. Unknown entity or relationship types fail closed. Every supported entity requires an explicit import mapping. A normalized batch must match the exact registered connector identity.

## Normalized Batch

A batch has a model version, connector identity, stable batch reference, source envelope, bounded entities, and bounded relationships. Each entity and relationship has a local batch reference and optional provider `sourceRecordRef`. References must be unique and relationship endpoints must exist in the same normalized batch.

`sourceRecordRef` plus source identity provides idempotent retry and correction lookup without making a provider ID the canonical entity ID. Provider names and connector keys are data. `sourceKind` is a stable ingestion channel such as external API, data-portability export, platform collector, or local device, so adding a provider does not require changing the core source enum.

## Import Pipeline

1. Authenticate the user and verify connector availability and purpose.
2. Resolve the exact immutable connector definition.
3. Acquire provider data through a separately reviewed adapter.
4. Validate and bound provider input before mapping.
5. Normalize into the shared batch contract.
6. Revalidate normalized output and reject undeclared types.
7. Enter transaction-scoped actor context.
8. Derive owner and household exclusively from the session.
9. Resolve source-record references and apply idempotent create/correction behavior.
10. Write entities, evidence links, then relationships in one transaction.
11. Persist no credentials or raw payloads in provenance or logs.

An adapter may stream batches, but each committed batch remains bounded and transactional. Partial-provider failures record connector health outside the graph; they must not turn incomplete data into negative evidence.

## Authentication And Secrets

The contract distinguishes no authentication, file upload, OAuth 2, API key, device authorization, and platform permission. OAuth token sets use key-versioned AES-256-GCM and a credential table unavailable to ordinary runtime queries. Narrow actor-checked functions expose ciphertext only after ownership is established. Production key material must come from a managed envelope/KMS design; the environment keyring is the local/test mechanism.

## Health And Rate Limits

Connector health describes operational ability to collect, not the health or behavior of a person. Rate-limit state, cursors, retries, and sync leases belong in connector operational storage, not canonical entities. Provider throttling must not erase prior records or change confidence silently.

## Privacy

One adult cannot activate collection for another adult. Connector support for person entities does not authorize cross-adult subjects. Source and evidence rows remain owner-only. Sharing a normalized entity does not share credentials, source-link notes, external references, prior versions, or graph audit history.

Health, finance, communications, location, device, and third-party collection remain unavailable until provider-specific review, consent flows, minimization, retention, and deletion propagation are implemented and tested.
