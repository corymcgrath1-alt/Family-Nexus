# Recommendation Engine

## Infrastructure Boundary

A Recommendation is a canonical `recommendation` entity plus a typed extension. It can carry recommendation text, priority, urgency, estimated benefit, estimated effort, categories, required permissions, status, and relationships to supporting evidence.

This milestone provides storage and validation infrastructure only. It generates no recommendation, executes no follow-up action, sends no notification, and makes no model call.

## Evidence And Provenance

Every recommendation requires supporting evidence entities in the shared contract. Its source identifies whether it was human-authored, deterministically derived, imported, or produced by a future reviewed system. Confidence belongs to the base entity and describes evidentiary support, not guaranteed benefit.

Recommendations must not embed raw evidence in reasoning, audit metadata, or notifications. Consumers resolve evidence through actor-authorized entity reads. Revoked or deleted evidence may make a recommendation stale; it never remains accessible through the recommendation edge.

## Status And Action

Proposed, accepted, dismissed, completed, and expired are user-workflow states. Accepted is not permission to execute. Every side effect requires a separate, current authorization check for its exact action, target, and scope.

Priority and urgency are bounded labels, not safety classifications. Estimated benefit and effort are explainable text until a governed metric model exists. Critical or immediate labels must not trigger automatic spending, disclosure, sharing, medical, financial, legal, employment, or safety action.

## Privacy

Recommendation entities cannot use household visibility under the current database constraint. They are owner-private by default and may be explicitly shared as a record, subject to endpoint-safe evidence access. The recommendation must not disclose inaccessible evidence, another adult's private behavior, or a hidden relationship.

Cross-adult rankings, eligibility decisions, diagnoses, and universal scores are prohibited architecture uses. Household membership is not consent to receive recommendations about another person.

## Future Service Contract

A future engine must declare rule/model version, allowed purpose, required permissions, evidence threshold, missing-data behavior, uncertainty, expiration policy, and user explanation. It must be deterministic when described as deterministic and preserve a no-automation path when model infrastructure is unavailable.
