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

## Current Gaps

- No production identity provider or MFA.
- No application-wide CSRF/rate-limit middleware yet.
- No encrypted file storage or envelope encryption.
- No formal support-access tooling.
- No broad deletion propagation implementation.
- No real connector token store.

## Reference Baselines

Use NIST CSF 2.0, NIST Privacy Framework 1.1 update work, NIST AI RMF 1.0, NIST SP 800-63-4, OWASP ASVS 5.0.0, and OWASP MASVS as design inputs. Do not claim compliance until controls are implemented, tested, and independently reviewed.
