# Family Knowledge Graph

## Purpose

The Family Knowledge Graph is Lighthouse's canonical normalization boundary. A connector, manual workflow, deterministic calculation, or future model may produce input in its own shape, but durable knowledge enters Lighthouse only after it has been validated as registered entities, sources, and relationships.

The graph is additive to the Family Library and existing Connection/Together domain. It does not replace those user-facing models or change their behavior. Domain services may project approved records into the graph incrementally after their ownership, lifecycle, and compatibility rules are documented.

## Storage Topology

Migration `0003_family_knowledge_graph.sql` creates:

- `knowledge_entity_types`: migration-managed entity vocabulary.
- `knowledge_relationship_types`: migration-managed relationship vocabulary and inverse metadata.
- `knowledge_sources`: actor-owned collection/import provenance.
- `knowledge_entities`: canonical entity envelope and searchable metadata.
- `knowledge_entity_sources`: supporting evidence links and idempotent source-record references.
- `knowledge_entity_grants`: explicit read grants for a single entity.
- `knowledge_entity_versions`: immutable entity snapshots.
- `knowledge_extension_versions`: immutable snapshots for typed entity extensions.
- `knowledge_relationships`: directed or symmetric graph edges.
- `knowledge_relationship_versions`: immutable relationship snapshots.
- `knowledge_audit_events`: redacted security and lifecycle history.
- Typed extension tables for memories, observations, insights, recommendations, and Passports.

Global type registries are runtime-readable and runtime-immutable. Actor-owned tables are protected by PostgreSQL RLS and transaction-scoped actor context. Runtime roles cannot physically delete graph rows.

## Canonical Flow

1. Authenticate the actor and begin `withDatabaseActor`.
2. Resolve a registered, versioned connector definition or a first-party manual workflow.
3. Validate the complete input with the strict schemas in `@workspace/knowledge-model`.
4. Create an actor-owned source record. Provider names live in data; source kinds describe stable ingestion channels and do not require a migration per provider.
5. Normalize provider records into bounded entity and relationship batches.
6. Derive owner, household, subject, and actor fields from authenticated server context.
7. Resolve `sourceRecordRef` values for idempotent import or correction behavior.
8. Write entities before relationships in one transaction.
9. Let database triggers create immutable base/extension versions and redacted entity, extension, share, and revoke audit events.
10. Build search or product projections only from RLS-authorized rows.

No connector is implemented by this milestone. The flow is the contract a later connector must satisfy.

## Authorization Boundary

- Missing actor context returns no protected rows and rejects protected writes.
- Private entities are owner-readable only.
- Household entities require current household context and `privacyLevel=household`.
- Shared entities require an active, unexpired entity grant to the current actor.
- A relationship is visible to a non-owner only when its own visibility permits access and both endpoints are currently readable.
- Relationship traversal never grants access to an endpoint.
- Source records, source-link evidence, version snapshots, and graph audit events remain owner-only even when the current entity is shared.
- Passport rows and their person entities remain private to the owning user.
- Cross-adult subjects are rejected by the current graph boundary. A future consent-reviewed subject model requires an additive migration and policy tests.

RLS is defense in depth. API authorization, response minimization, generic errors, and export-time checks remain required.

## Scale Strategy

UUID identifiers allow independent ingestion workers and offline normalization without coordinating integer sequences. Owner, household, type, status, timeline, source-reference, endpoint, tag, and text-search indexes support common access paths. JSON metadata is bounded at the contract layer and indexed only where a demonstrated query requires it.

Graph traversal must be bounded by depth, result count, actor context, and time. Search applies authorization in PostgreSQL before ranking or pagination. At substantially larger scale, the current partition keys permit time or household partitioning, read replicas for actor-scoped queries, and a separately authorized search projection without changing canonical entity identity.

The relational store remains the source of truth. A future graph or vector index is a rebuildable projection and must preserve RLS-equivalent filtering, revocation latency, deletion propagation, and source/version identity.

## Deliberate Limits

- No graph CRUD or search API is exposed yet.
- No existing Library or Together records are automatically copied into the graph.
- No model calls, embeddings, inference, or recommendations run.
- No background sync, connector credentials, or external collection exists.
- No transitive authorization or household-administrator override exists.
- No claim is made that stored entities completely represent a family or the real world.

These limits keep the canonical boundary reviewable while later domains adopt it one at a time.
