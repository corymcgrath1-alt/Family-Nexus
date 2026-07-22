# Entity Model

## Canonical Envelope

Every `knowledge_entities` row carries the same governance envelope:

- Identity: opaque UUID and migration-managed `entityType`.
- Authority: `ownerUserId`, `householdId`, optional self-only `subjectUserId`, and creator/updater IDs.
- Lifecycle: active, archived, or deleted status; creation/update/archive/delete timestamps; exact integer version.
- Access: privacy level, visibility, sensitivity, and explicit record grants.
- Evidence: primary source, confidence score, verification state, and additional source links.
- Discovery: canonical label, bounded search text, tags, search metadata, structured metadata, and custom fields.
- Time: occurred, started, ended, duration, expected, actual, recurrence, and temporal state.
- Governance: retention policy, optional delete-after timestamp, and legal hold.
- History: immutable version snapshots and redacted audit events.

The generic envelope contains cross-domain controls, not a universal bag of domain facts. Typed extension tables hold fields whose constraints matter to a domain. Arbitrary connector payloads must not be copied into `customFields` without an approved, bounded mapping.

## Registered Types

The migration and `KNOWLEDGE_ENTITY_TYPES` share 53 stable keys:

- Identity and household: person, household, pet.
- Assets and environment: vehicle, home, room, property, warranty, inspection, maintenance record, device.
- Organizations and development: organization, employer, school, doctor, skill, certification.
- Planning and activity: appointment, task, project, event, calendar event, goal, habit, trip, place, notification.
- Communication and memory: conversation, relationship, memory, observation, document, photo, video.
- Finance: financial account, investment, expense, income, subscription, insurance.
- Health-adjacent types: medication, health metric, mood entry, sleep session, workout, meal.
- Governance and intelligence: connector, permission, consent, source, AI insight, recommendation, risk.

The presence of a type is not permission to collect it. Financial, health, identity-document, third-party, device, and behavioral data remain gated by product, consent, security, and legal review. Type registration provides a stable destination for future reviewed workflows.

## Identity And Ownership

Entity IDs are non-semantic UUIDs. Provider identifiers are stored only as source references and never become authorization tokens. Ownership and household are immutable after creation. This milestone permits `subjectUserId` only when it is null or equal to the owner, preventing an adult from converting an assertion about another adult into canonical data without a future consent model.

Household visibility is distinct from household membership. It is valid only with household privacy classification. Private remains the default. Shared means a specific active entity grant exists; setting the visibility string alone does not authorize a reader.

## Confidence And Verification

Confidence is a bounded value from zero through one. It communicates evidence quality, not truth probability or a score about a person. Verification state is one of unverified, self-asserted, source-verified, user-verified, disputed, or rejected.

Observations stay separate from verified facts. An observation extension cannot be attached through the runtime path to an entity represented as source- or user-verified. Corrections create a new entity version; they do not overwrite historical snapshots.

## Lifecycle And History

Runtime code archives or marks entities deleted; it cannot physically delete them. Update triggers require the version to increase by exactly one, maintain lifecycle timestamps, capture a full owner-protected snapshot, and add a redacted audit event. Legal hold and deleted status are mutually exclusive.

Version snapshots can contain sensitive entity data, so sharing the current entity does not share its version history. Typed extensions maintain their own exact version sequence in `knowledge_extension_versions`, and extension changes add redacted audit events. Audit metadata is constrained against common content-bearing keys and stores type, extension kind, version, status, visibility, verification, or grant state rather than labels or bodies.

## Extension Rules

Extension triggers enforce the matching base type:

- `knowledge_memories` requires `memory`.
- `knowledge_observations` requires `observation`.
- `knowledge_insights` requires `ai_insight`.
- `knowledge_recommendations` requires `recommendation`.
- `lighthouse_passports` requires a private person entity owned by the same user.

An extension does not create independent authorization. Its RLS policy delegates to the base entity, with owner-only writes.
