# Timeline Model

## Shared Temporal Envelope

Entities and relationships use the same temporal vocabulary:

- `occurredAt`: a point event.
- `startedAt` and `endedAt`: an interval, with end not before start.
- `durationSeconds`: non-negative measured or declared duration.
- `expectedAt`: planned time.
- `actualAt`: observed completion time.
- `recurrenceRule`: a bounded recurrence expression retained with its source.
- `temporalState`: historical, current, future, or predicted.

Storage timestamps answer when Lighthouse learned or changed a record. Domain timestamps answer when the represented event happened. These must not be substituted for one another.

## Exact, Expected, And Predicted Time

Expected and actual values coexist so schedule variance can be represented without rewriting history. Predicted time is explicitly labeled and never promoted to recorded fact without a new source or user verification. A recurrence rule describes a schedule; it does not materialize unlimited future entities.

Missing time means unknown, not zero and not now. Precision and timezone details belong in structured metadata when a source provides them. Connectors must preserve source timezone and precision rather than silently converting a date-only fact into an exact instant.

## Timeline Queries

Timeline search is actor-scoped and excludes deleted rows unless an owner-only lifecycle view explicitly requests them. Queries may filter by interval overlap, temporal state, entity type, relationship type, and tags. Results require stable cursor ordering by the selected domain timestamp plus entity ID.

The graph timeline index currently supports household and occurrence-time access. Future scale may add owner/time indexes or partitions based on measured queries. Timeline projections remain rebuildable; canonical version history stays in PostgreSQL.

## Lifecycle Versus Domain Time

Archive and delete timestamps are lifecycle controls, not event dates. Retention delete-after time is a governance deadline, not an expected event. Legal hold prevents a row from entering deleted status but does not alter its represented timeline.

Corrections create a new version with a new update timestamp while retaining the original domain time unless the correction explicitly changes it.

## Future Calculations

Durations, recurrence expansion, and predicted dates can be deterministic services later. They must retain formula/version provenance, bound expansion windows, expose uncertainty, and never run as hidden authorization side channels. This milestone stores and validates the temporal inputs only.
