# OAuth Security

## Authorization Request

The server generates 256 bits of random state and a random PKCE verifier. Only the SHA-256 state hash is stored. The verifier is encrypted with the connector credential keyring, bound to the authenticated actor, Passport, connector key, and allowlisted redirect path, and expires after ten minutes.

The Google request uses the authorization-code flow, `S256` PKCE, exact configured redirect URI, offline access, and explicit consent/account selection. Callback state is consumed atomically before token exchange. Replay, expiry, wrong actor, missing code, denial, missing scopes, and malformed provider responses fail closed. Callback redirects remove codes and state from the browser URL.

The implementation follows Google's web-server OAuth guidance and OpenID Connect account identity guidance:

- <https://developers.google.com/identity/protocols/oauth2/web-server>
- <https://developers.google.com/identity/openid-connect/openid-connect>

## Credentials

All token-set fields are encrypted with AES-256-GCM using a fresh 96-bit nonce, authenticated additional data containing purpose and key version, and a 128-bit authentication tag. Ciphertext stores its key version so a later read-and-rewrite rotation can migrate credentials. Refresh responses that omit a new refresh token preserve the valid stored refresh token.

`connector_credentials` grants no direct runtime access. Owner-checked security-definer functions store, retrieve, and delete ciphertext after validating transaction-scoped actor ownership. Raw tokens, authorization codes, PKCE verifiers, and client secrets are excluded from API responses, logs, sync runs, and audit metadata.

`CONNECTOR_CREDENTIAL_KEYS_JSON` is a local/test keyring contract, not a production KMS claim. Production should inject short-lived data-encryption keys or an envelope-encryption provider backed by a managed KMS/HSM, retain old decrypt-only versions during rotation, and audit key access outside Lighthouse. Fake provider mode hard-fails when `NODE_ENV=production`.

## Redirects and CSRF

Only relative paths listed in `CONNECTOR_ALLOWED_REDIRECT_PATHS` are accepted. Network-path and absolute user-supplied redirects are rejected. `CONNECTOR_APP_ORIGIN` is required in production. Session cookies remain HTTP-only, `SameSite=Lax`, and secure in production.
