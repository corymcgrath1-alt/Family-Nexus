# Data Classification Guide

## Classes

- Public: product metadata or documentation approved for public release.
- Internal: operational notes, non-sensitive system metadata, and synthetic fixtures.
- Household: shared household facts, schedules, resources, and jointly managed records.
- Personal private: adult-owned private records, self-reports, imports, and derived insights.
- Sensitive personal: health, financial, location, communications, relationship conflict, identity documents, credentials, precise behavioral telemetry, and children's data.
- Restricted third-party: data about people who have not directly consented.

## Minimum Handling

- Public: normal repository hygiene.
- Internal: do not place secrets or production data in source control.
- Household: require authenticated household membership and server-side authorization.
- Personal private: private by default, owner export/delete rights, explicit sharing grants.
- Sensitive personal: purpose limitation, provenance, retention state, redacted logs, step-up design for share/export/delete, and future envelope-encryption architecture.
- Restricted third-party: minimize, avoid inference, limit sharing, and provide correction/deletion paths where feasible.

## Current App Constraints

The current prototype does not provide end-to-end encryption, production identity assurance, or real external data connectors. It must not store banking credentials, identity documents, medical records, or production secrets until those controls are implemented and reviewed.

## Deterministic Library Insights

Phase 4A Library insight responses are personal private derived data owned by the requesting user. They contain aggregate counts only, never raw Library content, row identifiers, grant identifiers, or per-person breakdowns. Counts may reflect explicitly shared or household-visible rows because those rows are already readable by the actor, but the result remains private and cannot be shared automatically.

The arithmetic has no calculation uncertainty for its database snapshot. The source is nevertheless incomplete by design: a user-controlled Library is not evidence that all relevant real-world records exist in Lighthouse. These metrics must not be used for diagnosis, eligibility, rankings, cross-adult comparison, or safety-critical decisions.
