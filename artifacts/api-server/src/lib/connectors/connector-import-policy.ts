import { createHash } from "node:crypto";

import {
  GOOGLE_CALENDAR_CONNECTOR_KEY,
  GOOGLE_CALENDAR_CONNECTOR_VERSION,
  GOOGLE_CALENDAR_CONSENT_PURPOSE,
  GOOGLE_CALENDAR_CONSENT_TEXT_VERSION,
} from "./connector-definition";

type ConnectorPolicyEnvironment = Record<string, string | undefined>;

export type GoogleCalendarImportPolicy = {
  backfillPastDays: number;
  backfillFutureDays: number;
  purpose: string;
  consentTextVersion: string;
  consentPolicyFingerprint: string;
};

export function googleCalendarImportPolicy(
  environment: ConnectorPolicyEnvironment = process.env,
): GoogleCalendarImportPolicy {
  const material = {
    connectorKey: GOOGLE_CALENDAR_CONNECTOR_KEY,
    connectorVersion: GOOGLE_CALENDAR_CONNECTOR_VERSION,
    purpose: GOOGLE_CALENDAR_CONSENT_PURPOSE,
    consentTextVersion: GOOGLE_CALENDAR_CONSENT_TEXT_VERSION,
    backfillPastDays: boundedDays(environment.CONNECTOR_BACKFILL_PAST_DAYS, 365),
    backfillFutureDays: boundedDays(environment.CONNECTOR_BACKFILL_FUTURE_DAYS, 365),
  };
  return {
    backfillPastDays: material.backfillPastDays,
    backfillFutureDays: material.backfillFutureDays,
    purpose: material.purpose,
    consentTextVersion: material.consentTextVersion,
    consentPolicyFingerprint: sha256(material),
  };
}

export function connectorConsentMaterialVersion(input: {
  connectorVersion: string;
  selectedResourceIds: readonly string[];
  grantedScopes: readonly string[];
  selectedCapabilities: readonly string[];
  consentPolicyFingerprint: string;
}): string {
  return sha256({
    connectorVersion: input.connectorVersion,
    selectedResourceIds: [...input.selectedResourceIds].sort(),
    grantedScopes: [...input.grantedScopes].sort(),
    selectedCapabilities: [...input.selectedCapabilities].sort(),
    consentPolicyFingerprint: input.consentPolicyFingerprint,
  });
}

function boundedDays(raw: string | undefined, fallback: number): number {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 3650) {
    throw new Error("Connector backfill windows must be between 1 and 3650 days.");
  }
  return value;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}
