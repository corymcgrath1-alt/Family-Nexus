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
