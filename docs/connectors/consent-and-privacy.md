# Connector Consent and Privacy

## Two Decisions

Google OAuth authorizes Lighthouse to call Google. Lighthouse consent authorizes a specific product purpose, capability set, Passport, provider account, and selected-calendar set. OAuth success leaves a connection in `pending_authorization`; only explicit Lighthouse confirmation activates import.

Consent records include requested and granted scopes, selected capabilities and resources, purpose text, consent-copy version, material version, actor, Passport, account ID, consent time, status, and revocation time. Changing selected calendars supersedes active consent, pauses synchronization, and requires confirmation again.

## Ownership

- One adult cannot create, inspect, sync, pause, revoke, or infer another adult's connection.
- A provider account containing another person's event or email does not create a Lighthouse Passport or relationship.
- Attendee data remains private provider-sourced metadata under the importing actor's RLS boundary.
- Imported records start with person ownership, `private` visibility, and no sharing grants.
- Sharing an imported Library projection uses the existing Library grant path and never shares credentials, source objects, cursors, or connector audit history.

## Revocation

Local revocation is committed before best-effort provider revocation, so an in-flight page cannot persist after the connection becomes revoked. Credentials are removed in every revocation mode.

- **Retain:** mappings detach and private Lighthouse copies remain.
- **Archive:** eligible source-backed records archive. Corrected, detached, and legally held records remain.
- **Delete:** eligible Library and graph records are soft-deleted; eligible source objects, mappings, checkpoints, and unreferenced resource selections are physically removed. Provenance rows and their resource references remain when a corrected, detached, or legally held record must be preserved.

User-corrected, detached, and legally held records are never silently deleted. Revocation creates redacted connector audit events but does not copy event content.

## Retention

- OAuth state: valid for ten minutes and consumed once. Operations purge expired or consumed state after 24 hours; it is never valid again after expiry or consumption.
- Access and refresh tokens: encrypted until revocation or credential rotation; never returned to the browser.
- Raw Google payloads: not retained.
- Normalized source objects: retained while connected or retained as provenance; removed by eligible-delete revocation.
- Sync runs and failed-job summaries: redacted operational history retained for 90 days by deployment cleanup policy. Connector audits remain with the revoked connection under the product audit-retention policy.
- Imported records: controlled by Library/graph lifecycle, legal hold, user corrections, and the revocation choice.
