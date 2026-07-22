# Source Provenance and Reconciliation

Google payloads are strictly validated and minimized into `calendar-event.v1`; raw payloads are not retained. Source objects preserve provider, connection, selected resource, external type and ID, etag/version, provider timestamps, checksum, tombstone state, parser version, and normalized event data.

Each event creates:

- A private canonical `calendar_event` knowledge entity for timeline and future graph use.
- A private Family Library projection for current correction, archive, export, search, and sharing workflows.
- A source mapping linking both targets to the source object and transformation version.

Library provenance deliberately omits provider account IDs, calendar IDs, event IDs, attendee data, and connection IDs because an owner may later share the Library record. Detailed provenance remains in owner-only connector and graph-source tables.

## User Corrections

The mapping records the last provider-controlled title, body, source label, and effective date. Before applying an update, sync compares the current Library values with that baseline. Differences become user overrides and are not overwritten. Provider values continue to update the source object, preserving both the source evidence and the user's correction without duplicating sensitive content in audit metadata.

A corrected mapping becomes detached. Provider deletion archives uncorrected source-backed records but preserves detached or legally held records. Repeated deliveries and cursor recovery use the same reconciliation path.

Attendee email addresses remain third-party source metadata. Lighthouse does not create users, Passports, relationships, or inferred facts from attendees, organizers, descriptions, locations, conference links, or co-attendance.
