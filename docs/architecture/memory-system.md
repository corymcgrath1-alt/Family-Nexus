# Memory System

## Memory As A Canonical Entity

A Memory is a `memory` entity plus one `knowledge_memories` extension. The base entity supplies ownership, privacy, source, confidence, verification, tags, time, search, retention, version, and audit behavior. The extension supplies title, summary, emotions, importance, timeline position, and dormant fields for future AI summary and follow-up suggestions.

People, participants, photos, videos, documents, places, and supporting evidence are represented as canonical entities connected by registered relationships. This avoids unversioned arrays of foreign payloads and lets each referenced object retain its own owner, source, privacy, lifecycle, and authorization.

## Memory Composition

Recommended edge use:

- A person `attended` an event or memory.
- A photo, video, or document `supports` a memory.
- A memory `related_to` a place.
- A memory `derived_from` a conversation or imported document.
- A correction source `supports` the corrected memory version.

Relationship choice must reflect the evidence supplied. A mention does not establish attendance, ownership, friendship, or consent.

## Emotion And Importance

Emotions are owner-authored labels, not inferred mental-state facts. Importance is an optional one-through-five organizing value chosen for the memory, not a measure of a person's worth or wellbeing. Both remain private unless the owner explicitly shares the Memory, and related private endpoints remain hidden.

## Evidence And Confidence

The primary source records how the Memory entered Lighthouse. Additional source links can mark supporting, derived, or correction evidence. Confidence describes the Memory assertion; each supporting entity retains its own confidence and verification state. Conflicting memories can coexist and be marked disputed rather than silently merged.

## AI Fields

`aiSummary` and follow-up suggestions are schema capacity, not active features. This milestone performs no model call and writes neither field automatically. A future workflow must document provider data flow, permission, allowed purpose, prompt/log handling, version, evidence, user review, correction, and deletion before writing these fields.

## Memory And Observation Boundary

A Memory is a retained account of an event or experience. An Observation is a lightweight assertion that may later support or contradict a Memory. An Observation is not a verified fact merely because it is stored, repeated, or linked. The runtime policy prevents a verified-state entity from receiving the Observation extension.

## Retention

Memory extension changes require an exact version increment and create an owner-only extension snapshot plus a redacted audit event. Archiving hides a Memory from default active views while preserving owner history. Deleted status blocks non-owner reads and is the precursor to controlled deletion propagation. Physical deletion is administrative only. Media retention and binary storage are outside this milestone.
