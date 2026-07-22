const KNOWN_UNSAFE_SESSION_SECRETS = new Set([
  "dev-secret-change-in-production",
  "replace-with-a-local-random-secret",
  "changeme",
  "change-me",
]);

export function resolveSessionSecret(environment: NodeJS.ProcessEnv = process.env): string {
  const mode = environment.NODE_ENV ?? "development";
  const secret = environment.SESSION_SECRET;
  if (!secret) {
    throw new Error(`SESSION_SECRET is required when NODE_ENV=${mode}.`);
  }

  const byteLength = Buffer.byteLength(secret, "utf8");
  if (mode === "production") {
    const distinctCharacters = new Set(secret).size;
    if (byteLength < 32 || distinctCharacters < 12 || KNOWN_UNSAFE_SESSION_SECRETS.has(secret)) {
      throw new Error("SESSION_SECRET must be a non-placeholder production secret of at least 32 bytes and 12 distinct characters.");
    }
  } else if (byteLength < 16) {
    throw new Error("SESSION_SECRET must be explicitly configured with at least 16 bytes outside production.");
  }

  return secret;
}
