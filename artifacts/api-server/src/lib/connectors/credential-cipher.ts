import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod/v4";

const keyringSchema = z.record(z.string().min(1).max(100), z.string().min(1));

export type EncryptedConnectorSecret = {
  encryptedPayload: Buffer;
  encryptionNonce: Buffer;
  authenticationTag: Buffer;
  encryptionKeyVersion: string;
};

type Keyring = {
  activeVersion: string;
  keys: Map<string, Buffer>;
};

function loadKeyring(environment: NodeJS.ProcessEnv = process.env): Keyring {
  const activeVersion = environment.CONNECTOR_ACTIVE_KEY_VERSION;
  const rawKeyring = environment.CONNECTOR_CREDENTIAL_KEYS_JSON;
  if (!activeVersion || !rawKeyring) {
    throw new Error("CONNECTOR_ACTIVE_KEY_VERSION and CONNECTOR_CREDENTIAL_KEYS_JSON are required for connector secrets.");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawKeyring);
  } catch {
    throw new Error("CONNECTOR_CREDENTIAL_KEYS_JSON must be valid JSON.");
  }

  const parsed = keyringSchema.parse(parsedJson);
  const keys = new Map<string, Buffer>();
  for (const [version, encoded] of Object.entries(parsed)) {
    const key = Buffer.from(encoded, "base64");
    if (key.length !== 32) throw new Error(`Connector credential key ${version} must decode to exactly 32 bytes.`);
    keys.set(version, key);
  }
  if (!keys.has(activeVersion)) throw new Error("CONNECTOR_ACTIVE_KEY_VERSION is absent from the configured keyring.");
  return { activeVersion, keys };
}

function additionalData(purpose: string, version: string): Buffer {
  return Buffer.from(`lighthouse.connector:${purpose}:${version}`, "utf8");
}

export function encryptConnectorSecret(
  plaintext: string | Buffer,
  purpose: string,
  environment: NodeJS.ProcessEnv = process.env,
): EncryptedConnectorSecret {
  const keyring = loadKeyring(environment);
  const key = keyring.keys.get(keyring.activeVersion)!;
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(additionalData(purpose, keyring.activeVersion));
  const encryptedPayload = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    encryptedPayload,
    encryptionNonce: nonce,
    authenticationTag: cipher.getAuthTag(),
    encryptionKeyVersion: keyring.activeVersion,
  };
}

export function decryptConnectorSecret(
  encrypted: EncryptedConnectorSecret,
  purpose: string,
  environment: NodeJS.ProcessEnv = process.env,
): Buffer {
  const keyring = loadKeyring(environment);
  const key = keyring.keys.get(encrypted.encryptionKeyVersion);
  if (!key) throw new Error("Connector credential key version is unavailable.");
  const decipher = createDecipheriv("aes-256-gcm", key, encrypted.encryptionNonce);
  decipher.setAAD(additionalData(purpose, encrypted.encryptionKeyVersion));
  decipher.setAuthTag(encrypted.authenticationTag);
  return Buffer.concat([decipher.update(encrypted.encryptedPayload), decipher.final()]);
}

export function encryptConnectorJson(value: unknown, purpose: string): EncryptedConnectorSecret {
  return encryptConnectorSecret(JSON.stringify(value), purpose);
}

export function decryptConnectorJson<T>(encrypted: EncryptedConnectorSecret, purpose: string, schema: z.ZodType<T>): T {
  const plaintext = decryptConnectorSecret(encrypted, purpose).toString("utf8");
  return schema.parse(JSON.parse(plaintext));
}
