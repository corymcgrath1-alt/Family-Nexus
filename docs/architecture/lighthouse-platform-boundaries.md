# Lighthouse Platform Boundaries

## Current Implementation Status

Lighthouse is currently a modular monolith prototype: one Vite app, one Express API, shared TypeScript libraries, PostgreSQL through Drizzle, and a separately invocable restricted connector worker. The code has session authentication, household membership, relationship-support experiences, Family Library records, sharing grants, redacted audits, a migration-managed Family Knowledge Graph, and actor-scoped RLS. Its first external reference connector is read-only Google Calendar, with separate provider authorization and Lighthouse consent, selected-resource import, application-encrypted credentials, durable provenance, and revocation choices. It does not yet have graph product APIs, production identity, application-wide row-level security for legacy tables, production KMS integration, or full consent lifecycle automation.

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

## Lighthouse Passport IDs

Lighthouse Passport IDs are opaque, random, non-semantic identifiers for people. They must never be derived from age, diagnosis, trauma, work, finances, behavior, relationship role, or any other personal trait. External aliases and internal IDs remain separate. Passport IDs are portable/exportable identifiers, not eligibility scores.

## Signal Vector

Lighthouse must not collapse a person into a universal number. Future analytics should use explainable, independently governed signal domains such as capacity, load, recovery, connection, time flexibility, household readiness, financial resilience, health follow-through, career momentum, and environmental friction.

Every retained metric needs a name, definition, domain, unit, time window, formula/model version, input provenance, missing-data coverage, baseline, evidence threshold, uncertainty, sensitivity, allowed/prohibited uses, owner, visibility, explanation, timestamps, and disable/correction/rejection controls.

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

## Family Knowledge Graph Boundary

The graph is the canonical normalization destination for future reviewed imports and intelligence workflows. It is not a replacement for current domain tables. Adoption is incremental: a domain keeps its established API and policy until a documented service maps it into graph entities without changing ownership or lifecycle semantics.

Global entity and relationship vocabularies are migration-managed. Provider-specific concepts live in connector definitions and mappings, so adding a provider does not require changing core graph tables. Private graph rows, sources, history, audit events, and Passport data are protected by transaction-scoped actor context and PostgreSQL RLS. Relationship visibility requires both endpoints; topology never grants access.

See [knowledge-graph.md](./knowledge-graph.md) and the accompanying entity, relationship, timeline, Memory, Passport, connector, insight, and recommendation documents.

## Connector Boundary

Connector definitions and provider adapters are code-owned. Actor-owned operational state is protected by RLS; credentials have no direct runtime table privilege and pass only through owner-checking functions. The worker may claim one due connection and apply bounded operational cleanup, then must run synchronization under that connection owner's transaction-scoped actor context. Provider authorization never grants household access, imported records begin private, and source provenance remains outside Library sharing responses.

Google Calendar proves the OAuth-cloud shape only. File imports, device-mediated sources, personal access tokens, financial aggregators, and local bridges share ownership, consent, provenance, health, and deletion concepts but require different transport and authentication implementations.

## Current Reference Baselines

These are design references, not compliance claims:

- NIST Privacy Framework 1.1 update work: https://www.nist.gov/privacy-framework/new-projects/privacy-framework-version-11
- NIST AI RMF 1.0, currently being revised: https://www.nist.gov/itl/ai-risk-management-framework
- NIST Cybersecurity Framework 2.0: https://www.nist.gov/publications/nist-cybersecurity-framework-csf-20
- NIST SP 800-63-4 final Digital Identity Guidelines: https://csrc.nist.gov/pubs/sp/800/63/4/final
- OWASP ASVS 5.0.0: https://owasp.org/www-project-application-security-verification-standard/
- OWASP MASVS: https://mas.owasp.org/MASVS/
