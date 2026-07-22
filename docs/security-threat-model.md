# Security and Privacy Threat Model

## Scope

This model covers the current Lighthouse web prototype and the planned consent-native family data platform. It is not a compliance attestation.

## Primary Assets

- Adult private records and self-reports
- Household shared records
- Dependent/child records
- Session cookies and credentials
- Sharing and consent grants
- Audit events
- Connector tokens and imported source data
- Future AI prompts, summaries, and retained outputs

## Threats and Required Mitigations

- Intimate-partner abuse: private by default, no silent surveillance, no partner-authorized tracking, generic unauthorized errors, revocation, export/delete controls.
- Compromised household administrator: admin is not adult-private superuser; sensitive reads require owner grants.
- Account takeover: strong session secrets, secure cookies in production, rate limits, password hashing, future MFA/step-up for sensitive actions.
- Insider support access: future support tooling must be just-in-time, purpose-bound, audited, and redacted by default.
- Third-party data exposure: minimize collection and avoid sensitive inference about non-consenting people.
- Device theft: short-lived sensitive views, session revocation, future step-up before export/share/delete.
- Coercion: permission previews, private data isolation, no hidden monitoring, and future safety exits where appropriate.
- Subpoena/legal exposure: retention minimization, clear ownership, export logs, and legal review before production sensitive domains.
- Data brokerage: no selling sensitive personal data; prohibit repurposing signals for consequential scoring.
- Connector token leakage: encrypt tokens, least scopes, revocation, refresh limits, and provider-specific review before launch.
- OAuth callback forgery or replay: random hashed state, encrypted PKCE verifier, ten-minute expiry, one-time consumption, actor/Passport binding, exact redirect URI, and allowlisted app redirects.
- Token possession mistaken for consent: provider authorization leaves import pending until selected resources and a separate Lighthouse consent record are confirmed.
- Connector IDOR and household inference: owner-only connector RLS, generic 404 responses, transaction-scoped actor context, and separate Adult A/Adult B API/browser tests.
- Sync replay, crash, or duplicate delivery: leased execution, unique source identities, normalized checksums, page-atomic target/mapping/checkpoint commits, and idempotent retry tests.
- Revocation race: local revocation clears consent/credentials/lease before best-effort provider revocation; every page rechecks state and consent before persistence.
- Provider payload and audit leakage: strict minimized normalization, no raw payload retention, redacted error categories, and audit metadata key guards.
- Overwritten user corrections: source baselines detect owner changes; detached/corrected records survive provider updates and deletion dispositions.
- Overprivileged synchronization worker: one-row security-definer claim, separate non-superuser role, explicit lease, and immediate re-entry into actor-scoped RLS.
- Prompt/log leakage: no raw intimate prompts in logs; model provider data-flow review before sending private content.
- Graph traversal leakage: non-owner relationship reads require both endpoints to be currently readable; edges never grant endpoint access and traversal depth/results stay bounded.
- Graph count and search inference: authorization is applied by PostgreSQL before text search, traversal, ranking, pagination, or aggregation; private rows cannot affect another actor's result surface.
- Grant retargeting: graph grant identity, entity, grantee, permission, purpose, expiry, and creation scope are immutable; updates may only revoke an active grant.
- Historical-content leakage: source-link evidence, entity/relationship versions, and graph audit history remain owner-only even when the current entity is shared.
- Provider identifier confusion: provider source references are provenance/idempotency keys, never authorization tokens or canonical IDs.
- Cross-adult assertions: graph subject IDs are null or self-owned in this milestone; relationship writes require ownership of both endpoints.
- Connector schema confusion: unknown connector versions, entity types, relationship types, mappings, fields, and disconnected references fail strict validation.
- Unbounded graph or payload denial of service: normalization batches, metadata keys, strings, tags, traversal depth, pages, and relationship counts are bounded.
- Stale projections: PostgreSQL remains canonical; future search, graph, or vector projections must propagate revocation and deletion and enforce actor-equivalent filtering.
- Confidence laundering: observations remain separate from verified facts, and confidence cannot be presented as diagnosis, certainty, eligibility, or a person score.
- Passport enumeration: opaque Passport IDs do not authorize reads; Passport rows and person entities remain owner-private under RLS.

## Current Gaps

- No production identity provider or MFA.
- No application-wide CSRF/rate-limit middleware yet.
- No encrypted file storage or envelope encryption.
- No formal support-access tooling.
- No broad deletion propagation implementation.
- No graph API, graph search executor, semantic index, or model runtime.
- Google Calendar is the only live connector; provider notifications and continuous worker scheduling remain deployment responsibilities.
- Connector operational-state cleanup is implemented, but no automated physical purge or downstream deletion propagation exists for graph projections.

## Reference Baselines

Use NIST CSF 2.0, NIST Privacy Framework 1.1 update work, NIST AI RMF 1.0, NIST SP 800-63-4, OWASP ASVS 5.0.0, and OWASP MASVS as design inputs. Do not claim compliance until controls are implemented, tested, and independently reviewed.
