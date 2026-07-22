import { z } from "zod/v4";

import { boundedTextSchema, stableIdentifierSchema } from "./core-contracts";
import { knowledgeEntityTypeSchema } from "./registries";

export const CONNECTOR_CONNECTION_STATES = [
  "pending_authorization",
  "active",
  "syncing",
  "paused",
  "degraded",
  "reconnect_required",
  "revoked",
  "archived",
  "failed",
] as const;

export const CONNECTOR_CAPABILITIES = [
  "resource_discovery",
  "historical_import",
  "incremental_sync",
  "scheduled_sync",
  "provider_notifications",
  "manual_sync",
  "read",
  "write",
  "delete_at_provider",
  "local_deletion",
  "account_disconnect",
  "selective_resource_sync",
  "attachment_access",
  "identity_data",
  "sensitive_health_data",
  "financial_data",
  "precise_location",
] as const;

export const CONNECTOR_ERROR_CATEGORIES = [
  "authorization_denied",
  "missing_scope",
  "invalid_credentials",
  "refresh_failed",
  "reconnect_required",
  "rate_limited",
  "provider_unavailable",
  "malformed_provider_response",
  "unsupported_provider_object",
  "cursor_invalidated",
  "permission_lost",
  "resource_removed",
  "transient_network_failure",
  "internal_persistence_failure",
  "consent_revoked",
  "connection_paused",
] as const;

export const connectorConnectionStateSchema = z.enum(CONNECTOR_CONNECTION_STATES);
export const connectorCapabilitySchema = z.enum(CONNECTOR_CAPABILITIES);
export const connectorErrorCategorySchema = z.enum(CONNECTOR_ERROR_CATEGORIES);

export type ConnectorConnectionState = z.infer<typeof connectorConnectionStateSchema>;
export type ConnectorCapability = z.infer<typeof connectorCapabilitySchema>;
export type ConnectorErrorCategory = z.infer<typeof connectorErrorCategorySchema>;

const transitionMap: Readonly<Record<ConnectorConnectionState, readonly ConnectorConnectionState[]>> = Object.freeze({
  pending_authorization: ["active", "failed", "reconnect_required", "revoked", "archived"],
  active: ["syncing", "paused", "degraded", "reconnect_required", "failed", "revoked", "archived"],
  syncing: ["active", "degraded", "reconnect_required", "failed", "revoked"],
  paused: ["active", "revoked", "archived"],
  degraded: ["active", "syncing", "paused", "reconnect_required", "failed", "revoked"],
  reconnect_required: ["pending_authorization", "revoked", "archived"],
  revoked: ["archived"],
  archived: [],
  failed: ["pending_authorization", "revoked", "archived"],
});

export function canTransitionConnectorState(from: ConnectorConnectionState, to: ConnectorConnectionState): boolean {
  return from === to || transitionMap[from].includes(to);
}

export function assertConnectorStateTransition(from: ConnectorConnectionState, to: ConnectorConnectionState): void {
  if (!canTransitionConnectorState(from, to)) {
    throw new Error(`Unsafe connector state transition from ${from} to ${to}.`);
  }
}

export type ConnectorErrorDisposition = "retryable" | "reconnect_required" | "permanent_resource" | "permanent_connection" | "internal_defect";

export class ConnectorError extends Error {
  readonly name = "ConnectorError";

  constructor(
    readonly category: ConnectorErrorCategory,
    readonly disposition: ConnectorErrorDisposition,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export const connectorRuntimeDefinitionSchema = z.object({
  connectorKey: stableIdentifierSchema,
  displayName: boundedTextSchema,
  provider: boundedTextSchema,
  category: z.enum(["calendar", "communications", "media", "health", "finance", "home", "device", "file_import"]),
  version: z.string().trim().min(1).max(100),
  status: z.enum(["available", "deferred", "unsupported", "prohibited"]),
  authenticationModes: z.array(z.enum(["oauth2", "file_upload", "api_token", "device_permission", "local_bridge"])).min(1),
  capabilities: z.array(connectorCapabilitySchema).min(1),
  sourceObjectTypes: z.array(stableIdentifierSchema).min(1),
  targetEntityTypes: z.array(knowledgeEntityTypeSchema).min(1),
  syncModes: z.array(z.enum(["initial", "manual", "scheduled", "incremental", "notification"])).min(1),
  minimumRequiredScopes: z.array(z.string().trim().min(1)).min(1),
  optionalScopes: z.array(z.string().trim().min(1)),
  sensitivity: z.enum(["standard", "personal", "sensitive", "restricted"]),
  documentation: z.object({
    summary: boundedTextSchema,
    privacySummary: boundedTextSchema,
    permissionsSummary: boundedTextSchema,
    backfillSummary: boundedTextSchema,
  }).strict(),
}).strict().superRefine((definition, context) => {
  if (new Set(definition.capabilities).size !== definition.capabilities.length) {
    context.addIssue({ code: "custom", path: ["capabilities"], message: "Connector capabilities must be unique." });
  }
  if (definition.status !== "available" && definition.capabilities.includes("read")) {
    context.addIssue({ code: "custom", path: ["status"], message: "Unavailable connectors cannot expose runtime read capability." });
  }
});

export type ConnectorRuntimeDefinition = z.infer<typeof connectorRuntimeDefinitionSchema>;

export function createRuntimeConnectorRegistry(definitions: readonly unknown[]) {
  const parsed = definitions.map((definition) => connectorRuntimeDefinitionSchema.parse(definition));
  const byKey = new Map<string, Readonly<ConnectorRuntimeDefinition>>();
  for (const definition of parsed) {
    if (byKey.has(definition.connectorKey)) {
      throw new Error(`Duplicate connector key: ${definition.connectorKey}`);
    }
    byKey.set(definition.connectorKey, Object.freeze(definition));
  }
  return Object.freeze({
    list: () => Object.freeze([...byKey.values()].sort((left, right) => left.connectorKey.localeCompare(right.connectorKey))),
    get: (key: string) => byKey.get(key),
    requireAvailable: (key: string) => {
      const definition = byKey.get(key);
      if (!definition || definition.status !== "available") throw new Error("Connector is not available.");
      return definition;
    },
  });
}

export type ConnectorAuthorizationRequest = {
  state: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: readonly string[];
};

export type ConnectorTokenSet = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
  scopes: string[];
  tokenType: "Bearer";
};

export type ConnectorProviderAccount = {
  stableId: string;
  displayLabel: string;
};

export type ConnectorProviderResource = {
  stableId: string;
  resourceType: "calendar";
  displayName: string;
  metadata: Record<string, string | boolean | null>;
};

export type ConnectorProviderPage<T> = {
  items: T[];
  nextPageToken: string | null;
  nextCursor: string | null;
};

export interface ConnectorProviderAdapter<TProviderObject, TNormalizedObject> {
  readonly definition: ConnectorRuntimeDefinition;
  buildAuthorizationUrl(request: ConnectorAuthorizationRequest): string;
  exchangeAuthorizationCode(input: { code: string; redirectUri: string; codeVerifier: string }): Promise<ConnectorTokenSet>;
  refreshCredentials(tokens: ConnectorTokenSet): Promise<ConnectorTokenSet>;
  resolveAccount(tokens: ConnectorTokenSet): Promise<ConnectorProviderAccount>;
  discoverResources(tokens: ConnectorTokenSet): Promise<ConnectorProviderResource[]>;
  listSourceObjects(input: {
    tokens: ConnectorTokenSet;
    resource: ConnectorProviderResource;
    pageToken: string | null;
    cursor: string | null;
    backfillStart: string;
    backfillEnd: string;
  }): Promise<ConnectorProviderPage<TProviderObject>>;
  normalizeSourceObject(input: TProviderObject, resource: ConnectorProviderResource): TNormalizedObject;
  revoke(tokens: ConnectorTokenSet): Promise<void>;
}
