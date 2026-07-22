# Relationship Engine

## Model

A relationship is a first-class, versioned edge between two canonical entities. It records source and target, registered type, direction, optional strength, confidence, verification, provenance, privacy inheritance, visibility, time, retention, lifecycle, and source-record identity.

The registry includes parent/child, sibling, spouse, friend, works-at, lives-in, owns, maintains, created, modified, attended, purchased, viewed, mentioned, related-to, duplicate-of, derived-from, supports, requires, and depends-on. Symmetric and inverse metadata is descriptive; the database stores the edge actually asserted and does not silently create an inverse edge.

## Direction

- `directed`: source-to-target meaning is authoritative.
- `undirected`: endpoint order does not change meaning.
- `bidirectional`: both directions are asserted, while one stored edge preserves shared provenance and lifecycle.

Self-edges are rejected except for `related_to`. Traversal code must honor type metadata and direction rather than guessing from display labels.

## Privacy Inheritance

The available inheritance declarations are most-restrictive, source, target, and explicit. In this milestone they record policy intent; the RLS control is deliberately stricter:

- Owners can read their own relationship rows.
- A non-owner can read a household/shared relationship only if both endpoint entities are readable on the same request.
- An edge never makes an endpoint readable.
- Revoking an endpoint grant removes dependent edge visibility on the next transaction.
- Hidden endpoints therefore cannot be inferred through relationship counts or traversal.

Application services must compute the most restrictive endpoint classification before insert or update. They may make an edge more restrictive, never use an inheritance declaration to broaden endpoint access.

## Write Authority

The current runtime actor must own both endpoints and the primary source to create a relationship. Endpoint, owner, household, type, and creation identity are immutable. Updates require exactly one version increment and remain owner-only. Physical deletion is denied; archive and deleted lifecycle states preserve history.

This intentionally excludes cross-owner graph assertions. Supporting those later requires a consent-aware proposal/acceptance model; household membership alone is insufficient.

## Provenance And Deduplication

Every relationship has a primary source and optional `sourceRecordRef`. The pair is unique when present, allowing a connector to retry without creating duplicate edges. Provenance metadata explains mapping decisions but must remain bounded and free of credentials. Relationship versions preserve prior edge state for the owner.

## Traversal Contract

The shared search schema limits traversal depth to four and result pages to 100. Production traversal must also bound execution time and edge fan-out, apply actor context before recursion, exclude deleted rows, and use stable cursor ordering. Recursive SQL, a graph projection, or a search index may implement this contract, but authorization parity is mandatory.

Transitive relationships are search results, not facts. Lighthouse must not infer family roles, friendship, dependency, risk, consent, or access from graph topology alone.
