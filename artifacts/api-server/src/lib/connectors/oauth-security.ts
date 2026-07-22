import { createHash, randomBytes } from "node:crypto";

import { encryptConnectorSecret } from "./credential-cipher";

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function base64Url(value: Buffer): string {
  return value.toString("base64url");
}

export function createOauthRequestMaterial(now = new Date()) {
  const state = base64Url(randomBytes(32));
  const codeVerifier = base64Url(randomBytes(64));
  const codeChallenge = base64Url(createHash("sha256").update(codeVerifier).digest());
  const encryptedVerifier = encryptConnectorSecret(codeVerifier, "oauth-pkce-verifier");
  return {
    state,
    stateHash: hashOauthState(state),
    codeChallenge,
    encryptedVerifier,
    expiresAt: new Date(now.getTime() + OAUTH_STATE_TTL_MS),
  };
}

export function hashOauthState(state: string): string {
  return createHash("sha256").update(state, "utf8").digest("hex");
}

export function validateConnectorRedirectPath(raw: unknown): string {
  const path = typeof raw === "string" && raw ? raw : "/connectors";
  const allowed = new Set(
    (process.env.CONNECTOR_ALLOWED_REDIRECT_PATHS ?? "/connectors")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  if (!path.startsWith("/") || path.startsWith("//") || !allowed.has(path)) {
    throw new Error("Redirect destination is not allowed.");
  }
  return path;
}
