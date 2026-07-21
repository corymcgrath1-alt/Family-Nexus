# Lighthouse Platform Boundaries

## Current Implementation Status

Lighthouse is currently a modular monolith prototype: one Vite app, one Express API, shared TypeScript libraries, and PostgreSQL through Drizzle. The code has session authentication, household membership, relationship-support experiences, messages, planning tasks, memories, profiles, reflections, Family Library records, sharing grants, redacted Library audit events, row-level security for the Lighthouse-owned privacy tables, an immutable connector capability catalog, a bounded manual Library JSON import, and exact actor-scoped Library insights. It does not yet have production identity, application-wide row-level security for legacy tables, live external connectors, encryption-at-rest controls, or full consent lifecycle automation.

## Product Scope

Lighthouse is the Family Intelligence Operating System: a consent-native memory, planning, knowledge, analytics, and decision-support layer for individuals, households, and families.

Bounded domains:

- Identity and household membership
- Family Library and knowledge records
- Plans, routines, obligations, and calendars
- Connection and relationship support
- Privacy, permissions, consent, and audit
- Connectors and imports
- Insights and signal definitions
- Deferred domains: health, home, vehicles, money, career, education, media, and smart-home data

Relationship-support features are one domain under Connection. They are not the whole product identity.

## Data Ownership Classes

- Personal data: owned by one person and private by default.
- Shared data: deliberately contributed by an owner to selected people or contexts.
- Household data: facts about jointly managed assets, obligations, schedules, or resources.
- Dependent data: data about a child or dependent, subject to guardianship, age, law, development, and safety.
- Third-party data: data about people who may not have consented; minimize collection and restrict inference.

## Adult Ownership Boundary

Every adult owns their account, private vault, raw imports, self-reports, derived insights, sharing permissions, export rights, and deletion rights. Household administration manages membership and shared infrastructure; it is not superuser access to another adult's private vault.

One adult must not authorize phone, location, health, financial, media, browsing, social, mood, or behavioral tracking for another adult.

## Connector and Import Boundary

The server-owned `connector-catalog.v1` registry is immutable application code, not mutable user data. Only `manual-family-library` is available. Deferred, unsupported, and prohibited entries expose limitations but no activation state, credentials, URLs, or other-adult authorization path.

Manual import accepts one bounded `library-item.v1` JSON document. Preview is write-free. Commit revalidates the original document inside authenticated database actor context and creates a new private, active, actor-owned item. Source IDs, identity references, lifecycle state, timestamps, versions, purposes, visibility, and sharing grants cannot cross the import boundary. No binary storage or external network collection is part of this path.

## Lighthouse Passport IDs

Lighthouse Passport IDs are opaque, random, non-semantic identifiers for people. They must never be derived from age, diagnosis, trauma, work, finances, behavior, relationship role, or any other personal trait. External aliases and internal IDs remain separate. Passport IDs are portable/exportable identifiers, not eligibility scores.

## Signal Vector

Lighthouse must not collapse a person into a universal number. Future analytics should use explainable, independently governed signal domains such as capacity, load, recovery, connection, time flexibility, household readiness, financial resilience, health follow-through, career momentum, and environmental friction.

Every retained metric needs a name, definition, domain, unit, time window, formula/model version, input provenance, missing-data coverage, baseline, evidence threshold, uncertainty, sensitivity, allowed/prohibited uses, owner, visibility, explanation, timestamps, and disable/correction/rejection controls.

## Deterministic Insights Boundary

Phase 4A uses `signal_definitions` as the migration-governed canonical registry. Runtime roles can read active definitions but cannot create, update, or delete them. Definition changes require a reviewed migration and a formula-version change when semantics change.

Library insights run synchronously inside the authenticated request transaction. A single aggregate SQL statement counts all non-deleted `library_items` visible through the requesting actor's PostgreSQL RLS context. It selects no title, body, source label, provenance, record ID, grant ID, or audit ID and returns no per-person dimensions. Registered category and sensitivity enums provide the complete, zero-filled dimension keys.

Each response is private to the requesting user and exact for one database snapshot. Source completeness remains unknown because users control what enters the Library. The request creates no `signal_observations`, audit events, grants, records, or source rows; it is recalculated without shared actor caches or background work.

## Evidence Taxonomy

The system must label and store these separately:

- Recorded fact
- User self-report
- Assertion contributed by another person
- Deterministic derived metric
- Statistical association
- Model inference
- Recommendation
- Professional judgment

Passive sensing may produce hypotheses, not diagnoses or reliable emotional-state facts.

## Consent, Provenance, Retention, and Allowed Use

Sensitive records and derived outputs must carry enough metadata to answer:

- Who owns this?
- Who or what supplied it?
- Was it imported, self-reported, inferred, or contributed by someone else?
- What purposes are allowed?
- What sensitivity class applies?
- What retention/deletion state applies?
- Who can see it now?
- Which grants or revocations justify that access?

## AI and Automation Boundaries

AI may classify, summarize, search, explain, and suggest only when the data flow and purpose are documented. Private data must not be sent to a model by default. Deterministic workflows must keep working when AI is unavailable.

AI must not diagnose mental illness, disclose one member's inferred mood to another, decide who is right in a conflict, or make financial, medical, legal, employment, safety-critical, public-posting, spending, calendar-changing, or shared-data-changing decisions without explicit approval.

## Modular-Monolith Scale Strategy

Keep a modular monolith until load, isolation, deployment cadence, or team topology justifies extraction. Prepare for scale now through:

- Explicit person, household, owner, and context partition keys
- Opaque stable IDs
- Server-side authorization
- Idempotent writes and imports
- Pagination and bounded queries
- Optimistic concurrency/versioning for sensitive records
- Schema-versioned event contracts
- Outbox-ready audit/event design
- Search authorization parity
- Deletion/export paths
- Redacted logs and traceable provenance

## Current Reference Baselines

These are design references, not compliance claims:

- NIST Privacy Framework 1.1 update work: https://www.nist.gov/privacy-framework/new-projects/privacy-framework-version-11
- NIST AI RMF 1.0, currently being revised: https://www.nist.gov/itl/ai-risk-management-framework
- NIST Cybersecurity Framework 2.0: https://www.nist.gov/publications/nist-cybersecurity-framework-csf-20
- NIST SP 800-63-4 final Digital Identity Guidelines: https://csrc.nist.gov/pubs/sp/800/63/4/final
- OWASP ASVS 5.0.0: https://owasp.org/www-project-application-security-verification-standard/
- OWASP MASVS: https://mas.owasp.org/MASVS/
