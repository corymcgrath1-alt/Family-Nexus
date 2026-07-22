# Lighthouse Passport Architecture

## Purpose

A Lighthouse Passport is the canonical, portable profile boundary for one person. Its opaque `lhp_` identifier is stable and non-semantic. It is not a score, diagnosis, credential, government identity, authorization secret, or household role.

The Passport is represented by:

- One private `person` entity owned by the user.
- One `lighthouse_passports` extension bound to that entity and the same user.
- Relationships to separately governed memories, goals, organizations, skills, and other entities.
- Existing account `lighthousePassportId`, which the database trigger requires to match.

## Profile Domains

The extension reserves structured areas for identity, preferences, strengths, growth areas, communication style, career, education, medical context, family, relationships, important memories, goals, interests, privacy preferences, consent summary, and a dormant AI profile.

These areas are not a license to ingest every domain. Health, financial, identity, third-party, dependent, and other sensitive data require separately reviewed sources and purposes. Growth areas replace a generalized weaknesses field to avoid encoding a permanent negative judgment as identity.

## Privacy And Consent

The Passport owner, user, and person-entity subject are the same actor in this milestone. Passport entities and rows must remain private. Household administration, spouse status, family relationship, and possession of a Passport ID do not grant access.

The Passport may reference shared or household entities, but it does not copy those records into a private profile or expand their visibility. A future Passport export must authorize every referenced record at generation time and omit inaccessible content.

## Updates And Corrections

Person entity identity and ownership are immutable. Profile changes occur through versioned service operations and must preserve source and correction provenance. Conflicting assertions are represented through verification/dispute state and evidence, not destructive overwrite.

The Passport table is a typed projection; canonical domain records remain separate entities. For example, a certification or goal should be its own record with lifecycle and source, then linked to the person. This prevents one giant profile document from becoming an unbounded write hotspot.

## AI Profile Boundary

No AI profile is generated in this milestone. The stored JSON field remains empty unless a future, reviewed workflow has actor permission, purpose limitation, source provenance, model/version metadata, uncertainty, explanation, correction, and deletion behavior. A future AI profile cannot become a hidden eligibility, risk, relationship, health, or worth score.

## Portability

Future exports should include schema versions, source references suitable for the owner, relationship semantics, lifecycle state, and explicit omissions. Internal database IDs, grant IDs, credentials, and inaccessible third-party content must not be treated as portable identity. Import creates or reconciles records under the authenticated owner; a Passport ID alone never transfers ownership.
