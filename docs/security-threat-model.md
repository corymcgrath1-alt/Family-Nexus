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
- Future connector tokens and imports
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
- Prompt/log leakage: no raw intimate prompts in logs; model provider data-flow review before sending private content.

## Deterministic Insight Threats

| Threat | Phase 4A control and verification |
| --- | --- |
| Aggregation-based inference about another adult | Aggregates operate only on rows already readable through the requesting actor's RLS context. Integration and browser tests prove private rows do not affect another adult's totals or dimensions before sharing and disappear immediately after revocation. |
| Incorrect actor-context propagation | The API uses transaction-scoped actor settings and the aggregate verifies the database actor and household match the session actor. Missing or mismatched context fails closed. |
| Count truncation from hidden query limits | One database aggregate covers the full RLS-visible relation with no row limit. Tests prove both the Insights API and deprecated stats route count more than 500 visible rows exactly. |
| Accidental inclusion of deleted rows | The materialized visible-row CTE excludes `status = deleted`; integration fixtures prove deleted rows affect neither totals nor dimensions. |
| Dimension-key leakage | Category and sensitivity keys come from registered application enums, are zero-filled, and are never generated from arbitrary database text. |
| Raw-content leakage | The aggregate selects only ID for grant matching plus ownership, visibility, status, category, and sensitivity. Responses are strictly validated and tests reject item IDs, grant IDs, titles, bodies, source labels, and provenance. |
| Shared caching across actors | Phase 4A has no insight cache, scheduled calculation, or background worker. Every response is calculated in the current request transaction. |
| Incomplete Library treated as complete evidence | Coverage and uncertainty metadata state that arithmetic is exact for the snapshot while real-world source completeness is unknown and user-controlled. The UI repeats that absence in Lighthouse does not prove real-world absence. |
| Unauthorized definition mutation | Runtime roles have SELECT only on `signal_definitions`; database tests prove INSERT, UPDATE, and DELETE fail. There is no definition mutation API. |
| Silent formula changes | `definition_key, formula_version` is unique, definitions are migration-managed, and tests pin all seven key/version pairs. Future semantic changes must introduce a new version. |
| Read endpoints create a behavioral trail | Definitions and Library insight GETs perform no writes and intentionally create no view audit event. Before/after protected-table counts and zero observation rows verify this boundary. |

## Current Gaps

- No production identity provider or MFA.
- No application-wide CSRF/rate-limit middleware yet.
- No encrypted file storage or envelope encryption.
- No formal support-access tooling.
- No broad deletion propagation implementation.
- No real connector token store.

## Reference Baselines

Use NIST CSF 2.0, NIST Privacy Framework 1.1 update work, NIST AI RMF 1.0, NIST SP 800-63-4, OWASP ASVS 5.0.0, and OWASP MASVS as design inputs. Do not claim compliance until controls are implemented, tested, and independently reviewed.
