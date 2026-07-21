import { z } from "zod/v4";

export const CONNECTOR_CATALOG_VERSION = "connector-catalog.v1" as const;

export const connectorStatuses = [
  "available",
  "deferred",
  "unsupported",
  "prohibited",
] as const;
export const collectionModes = [
  "manual-upload",
  "live-oauth-api",
  "periodic-api",
  "user-authorized-platform-collector",
  "data-portability-export",
  "local-only",
  "unsupported",
  "prohibited",
] as const;
export const connectorDataCategories = [
  "family-library-records",
  "documents",
  "household-records",
  "app-usage",
  "screen-time",
  "health-data",
  "google-portability-exports",
  "social-media-history",
  "device-telemetry",
  "device-or-app-behavior",
] as const;
export const connectorAllowedPurposes = [
  "remember",
  "search",
  "user-directed-import",
  "user-directed-export",
  "personal-insight",
  "household-coordination",
] as const;
export const termsReviewStatuses = [
  "reviewed",
  "review-required",
  "unsupported",
  "prohibited",
] as const;
export const connectorSensitivityClasses = [
  "standard",
  "personal",
  "sensitive",
  "restricted",
] as const;

export type ConnectorStatus = (typeof connectorStatuses)[number];
export type CollectionMode = (typeof collectionModes)[number];
export type ConnectorDataCategory = (typeof connectorDataCategories)[number];
export type ConnectorAllowedPurpose = (typeof connectorAllowedPurposes)[number];
export type TermsReviewStatus = (typeof termsReviewStatuses)[number];
export type ConnectorSensitivityClass =
  (typeof connectorSensitivityClasses)[number];

const connectorDefinitionSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(80),
    provider: z.string().trim().min(1).max(120),
    displayName: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(500),
    dataCategories: z.array(z.enum(connectorDataCategories)).min(1),
    collectionMode: z.enum(collectionModes),
    status: z.enum(connectorStatuses),
    requiredScopes: z.array(z.string().trim().min(1).max(160)),
    authorizationRequirements: z.array(z.string().trim().min(1).max(300)),
    allowedPurposes: z.array(z.enum(connectorAllowedPurposes)).min(1),
    prohibitedUses: z.array(z.string().trim().min(1).max(300)).min(1),
    sensitivity: z.enum(connectorSensitivityClasses),
    refreshLimitations: z.string().trim().min(1).max(300),
    regionalPlatformLimitations: z
      .array(z.string().trim().min(1).max(300))
      .min(1),
    termsReviewStatus: z.enum(termsReviewStatuses),
    importSupport: z.boolean(),
    exportSupport: z.boolean(),
    unavailableReason: z.string().trim().min(1).max(500).nullable(),
    canCollectAnotherAdultData: z.literal(false),
  })
  .strict();

export type ConnectorDefinition = Readonly<
  z.infer<typeof connectorDefinitionSchema>
>;

export class ConnectorPolicyError extends Error {
  constructor(
    readonly code:
      | "unknown-connector"
      | "unknown-data-category"
      | "unknown-purpose"
      | "connector-unavailable"
      | "combination-not-registered"
      | "other-adult-collection-prohibited"
      | "import-not-supported",
    message: string,
  ) {
    super(message);
    this.name = "ConnectorPolicyError";
  }
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

export function createConnectorCatalog(
  entries: readonly unknown[],
): readonly ConnectorDefinition[] {
  const parsed = entries.map((entry) => connectorDefinitionSchema.parse(entry));
  const ids = new Set<string>();
  for (const entry of parsed) {
    if (ids.has(entry.id)) {
      throw new Error(`Duplicate connector ID: ${entry.id}`);
    }
    ids.add(entry.id);

    if (entry.status === "available" && entry.unavailableReason !== null) {
      throw new Error(
        `Available connector ${entry.id} cannot have an unavailable reason.`,
      );
    }
    if (entry.status !== "available" && !entry.unavailableReason) {
      throw new Error(
        `Unavailable connector ${entry.id} must explain why it is unavailable.`,
      );
    }
    if (entry.status === "prohibited" && entry.requiredScopes.length > 0) {
      throw new Error(`Prohibited connector ${entry.id} cannot expose scopes.`);
    }
  }

  return deepFreeze(
    parsed.sort((left, right) => left.id.localeCompare(right.id)),
  );
}

const catalogEntries = [
  {
    id: "manual-family-library",
    provider: "Lighthouse",
    displayName: "Manual Family Library",
    description:
      "User-directed entry and JSON transfer of individual Family Library records.",
    dataCategories: [
      "family-library-records",
      "documents",
      "household-records",
    ],
    collectionMode: "manual-upload",
    status: "available",
    requiredScopes: [],
    authorizationRequirements: [
      "The signed-in adult supplies and confirms each record directly.",
    ],
    allowedPurposes: [
      "remember",
      "search",
      "user-directed-import",
      "user-directed-export",
    ],
    prohibitedUses: [
      "Automatic sharing",
      "Credential ingestion",
      "Identity-document ingestion",
      "Unreviewed medical-data ingestion",
    ],
    sensitivity: "personal",
    refreshLimitations:
      "No synchronization or automatic refresh; each import is an explicit one-time action.",
    regionalPlatformLimitations: [
      "Available only in the Lighthouse Family Library web workflow.",
    ],
    termsReviewStatus: "reviewed",
    importSupport: true,
    exportSupport: true,
    unavailableReason: null,
    canCollectAnotherAdultData: false,
  },
  {
    id: "apple-screen-time",
    provider: "Apple",
    displayName: "Apple Screen Time",
    description:
      "Potential device-user-authorized screen-time and application-usage collection.",
    dataCategories: ["app-usage", "screen-time"],
    collectionMode: "user-authorized-platform-collector",
    status: "deferred",
    requiredScopes: [
      "Apple device-user authorization",
      "Required Apple entitlements",
    ],
    authorizationRequirements: [
      "Authorization must be granted by the user of the Apple device.",
    ],
    allowedPurposes: ["personal-insight"],
    prohibitedUses: [
      "Monitoring another adult",
      "Behavioral scoring",
      "Circumventing Apple controls",
    ],
    sensitivity: "sensitive",
    refreshLimitations:
      "No collection is implemented; future refresh behavior depends on Apple platform constraints.",
    regionalPlatformLimitations: [
      "Apple platforms only",
      "Subject to entitlement availability and platform review",
    ],
    termsReviewStatus: "review-required",
    importSupport: false,
    exportSupport: false,
    unavailableReason:
      "Deferred until device-user authorization, Apple entitlements, and platform review are complete.",
    canCollectAnotherAdultData: false,
  },
  {
    id: "android-usage-stats",
    provider: "Android",
    displayName: "Android Usage Stats",
    description:
      "Potential device-user-authorized application-usage collection from Android settings.",
    dataCategories: ["app-usage"],
    collectionMode: "user-authorized-platform-collector",
    status: "deferred",
    requiredScopes: [
      "Usage access granted by the Android device user in system settings",
    ],
    authorizationRequirements: [
      "Authorization must be granted by the user of the Android device.",
    ],
    allowedPurposes: ["personal-insight"],
    prohibitedUses: [
      "Monitoring another adult",
      "Behavioral scoring",
      "Circumventing Android controls",
    ],
    sensitivity: "sensitive",
    refreshLimitations:
      "No collection is implemented; future refresh behavior depends on Android platform constraints.",
    regionalPlatformLimitations: [
      "Android devices with supported usage-access controls only",
    ],
    termsReviewStatus: "review-required",
    importSupport: false,
    exportSupport: false,
    unavailableReason:
      "Deferred until device-user authorization and Android platform review are complete.",
    canCollectAnotherAdultData: false,
  },
  {
    id: "apple-healthkit",
    provider: "Apple",
    displayName: "Apple HealthKit",
    description:
      "Potential fine-grained, per-data-type access to user-authorized HealthKit data.",
    dataCategories: ["health-data"],
    collectionMode: "user-authorized-platform-collector",
    status: "deferred",
    requiredScopes: [
      "Fine-grained HealthKit authorization for each requested data type",
    ],
    authorizationRequirements: [
      "The data subject must authorize each data type on their own device.",
    ],
    allowedPurposes: ["personal-insight"],
    prohibitedUses: [
      "Medical or diagnostic claims",
      "Other-adult access",
      "Consequential health decisions",
    ],
    sensitivity: "restricted",
    refreshLimitations: "No health ingestion or refresh is implemented.",
    regionalPlatformLimitations: [
      "Apple platforms only",
      "Requires health-data legal, safety, and platform review",
    ],
    termsReviewStatus: "review-required",
    importSupport: false,
    exportSupport: false,
    unavailableReason:
      "Deferred pending health-data, legal, safety, and platform authorization review.",
    canCollectAnotherAdultData: false,
  },
  {
    id: "google-data-portability",
    provider: "Google",
    displayName: "Google Data Portability",
    description:
      "Potential user-directed imports limited to supported Google portability scopes and exports.",
    dataCategories: ["google-portability-exports"],
    collectionMode: "data-portability-export",
    status: "deferred",
    requiredScopes: [
      "Provider-supported portability scope selected by the account owner",
    ],
    authorizationRequirements: [
      "The Google account owner must initiate and authorize a supported export.",
    ],
    allowedPurposes: ["user-directed-import", "personal-insight"],
    prohibitedUses: [
      "Claiming universal Google-account access",
      "Credential collection",
      "Other-adult account access",
    ],
    sensitivity: "sensitive",
    refreshLimitations:
      "Portability exports are bounded snapshots, not universal live synchronization.",
    regionalPlatformLimitations: [
      "Limited to scopes, exports, regions, and accounts supported by Google",
    ],
    termsReviewStatus: "review-required",
    importSupport: false,
    exportSupport: false,
    unavailableReason:
      "Deferred until supported portability scopes, terms, and retention behavior are reviewed.",
    canCollectAnotherAdultData: false,
  },
  {
    id: "social-media-portability",
    provider: "Social and media platforms",
    displayName: "Social Media Portability",
    description:
      "Potential user-directed use of provider-supported account portability exports.",
    dataCategories: ["social-media-history"],
    collectionMode: "unsupported",
    status: "unsupported",
    requiredScopes: [],
    authorizationRequirements: [
      "Any future path would require an account-owner export and provider-specific review.",
    ],
    allowedPurposes: ["user-directed-import", "personal-insight"],
    prohibitedUses: [
      "Scraping",
      "Credential collection",
      "Claiming complete personal histories",
      "Other-adult account access",
    ],
    sensitivity: "sensitive",
    refreshLimitations:
      "Many providers do not expose complete personal histories or stable portability interfaces.",
    regionalPlatformLimitations: [
      "Provider, account, export, and region support varies and may be unavailable",
    ],
    termsReviewStatus: "unsupported",
    importSupport: false,
    exportSupport: false,
    unavailableReason:
      "Unsupported because complete, stable, terms-reviewed personal-history access is not generally available.",
    canCollectAnotherAdultData: false,
  },
  {
    id: "adult-device-mdm",
    provider: "Device management platforms",
    displayName: "Adult Device Management",
    description:
      "Monitoring or management of another adult's device through MDM.",
    dataCategories: ["device-telemetry"],
    collectionMode: "prohibited",
    status: "prohibited",
    requiredScopes: [],
    authorizationRequirements: [],
    allowedPurposes: ["personal-insight"],
    prohibitedUses: [
      "Monitoring another adult",
      "Covert surveillance",
      "Device control",
    ],
    sensitivity: "restricted",
    refreshLimitations:
      "No collection, refresh, activation, or connection path exists.",
    regionalPlatformLimitations: [
      "Prohibited on every platform and in every region",
    ],
    termsReviewStatus: "prohibited",
    importSupport: false,
    exportSupport: false,
    unavailableReason:
      "Lighthouse will not monitor another adult through mobile device management.",
    canCollectAnotherAdultData: false,
  },
  {
    id: "accessibility-scraping",
    provider: "Device accessibility and scraping interfaces",
    displayName: "Accessibility Scraping",
    description:
      "Collection that misuses accessibility interfaces or scraping to observe device or application behavior.",
    dataCategories: ["device-or-app-behavior"],
    collectionMode: "prohibited",
    status: "prohibited",
    requiredScopes: [],
    authorizationRequirements: [],
    allowedPurposes: ["personal-insight"],
    prohibitedUses: [
      "Bypassing platform controls",
      "Violating provider terms",
      "Monitoring another adult",
      "Covert surveillance",
    ],
    sensitivity: "restricted",
    refreshLimitations:
      "No collection, refresh, activation, or connection path exists.",
    regionalPlatformLimitations: [
      "Prohibited on every platform and in every region",
    ],
    termsReviewStatus: "prohibited",
    importSupport: false,
    exportSupport: false,
    unavailableReason:
      "Lighthouse will not bypass platform controls or terms through accessibility misuse or scraping.",
    canCollectAnotherAdultData: false,
  },
] as const;

export const connectorCatalog = createConnectorCatalog(catalogEntries);

const connectorById = new Map(
  connectorCatalog.map((connector) => [connector.id, connector]),
);

export function getConnector(connectorId: string): ConnectorDefinition {
  const connector = connectorById.get(connectorId);
  if (!connector) {
    throw new ConnectorPolicyError(
      "unknown-connector",
      "Connector is not registered.",
    );
  }
  return connector;
}

export function assertKnownDataCategories(
  categories: readonly string[],
): asserts categories is readonly ConnectorDataCategory[] {
  for (const category of categories) {
    if (!connectorDataCategories.includes(category as ConnectorDataCategory)) {
      throw new ConnectorPolicyError(
        "unknown-data-category",
        "Data category is not registered.",
      );
    }
  }
}

export function assertKnownPurposes(
  purposes: readonly string[],
): asserts purposes is readonly ConnectorAllowedPurpose[] {
  for (const purpose of purposes) {
    if (
      !connectorAllowedPurposes.includes(purpose as ConnectorAllowedPurpose)
    ) {
      throw new ConnectorPolicyError(
        "unknown-purpose",
        "Purpose is not registered.",
      );
    }
  }
}

export function assertConnectorActivationAllowed(input: {
  connectorId: string;
  dataCategories: readonly string[];
  purposes: readonly string[];
  requestsAnotherAdultData?: boolean;
}): ConnectorDefinition {
  assertKnownDataCategories(input.dataCategories);
  assertKnownPurposes(input.purposes);
  const connector = getConnector(input.connectorId);

  if (input.requestsAnotherAdultData || connector.canCollectAnotherAdultData) {
    throw new ConnectorPolicyError(
      "other-adult-collection-prohibited",
      "A connector cannot authorize collection from another adult.",
    );
  }
  if (connector.status !== "available") {
    throw new ConnectorPolicyError(
      "connector-unavailable",
      "Connector is not available for activation.",
    );
  }
  if (
    input.dataCategories.some(
      (category) =>
        !connector.dataCategories.includes(category as ConnectorDataCategory),
    ) ||
    input.purposes.some(
      (purpose) =>
        !connector.allowedPurposes.includes(purpose as ConnectorAllowedPurpose),
    )
  ) {
    throw new ConnectorPolicyError(
      "combination-not-registered",
      "Connector capability combination is not registered.",
    );
  }

  return connector;
}

export function assertConnectorImportAllowed(
  connectorId: string,
): ConnectorDefinition {
  const connector = getConnector(connectorId);
  assertConnectorActivationAllowed({
    connectorId,
    dataCategories: ["family-library-records"],
    purposes: ["user-directed-import"],
  });
  if (
    !connector.importSupport ||
    connector.collectionMode !== "manual-upload"
  ) {
    throw new ConnectorPolicyError(
      "import-not-supported",
      "Connector does not support manual Library import.",
    );
  }
  return connector;
}
