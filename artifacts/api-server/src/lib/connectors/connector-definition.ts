import { createRuntimeConnectorRegistry } from "@workspace/knowledge-model";

export const GOOGLE_CALENDAR_CONNECTOR_KEY = "google.calendar";
export const GOOGLE_CALENDAR_CONSENT_PURPOSE = "Import selected calendar events into my private Lighthouse records.";
export const GOOGLE_CALENDAR_CONSENT_TEXT_VERSION = "google-calendar-consent.v1";
export const GOOGLE_CALENDAR_CONNECTOR_VERSION = "1.0.0";
export const GOOGLE_CALENDAR_SCOPES = Object.freeze([
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events.readonly",
] as const);

export const connectorRegistry = createRuntimeConnectorRegistry([
  {
    connectorKey: GOOGLE_CALENDAR_CONNECTOR_KEY,
    displayName: "Google Calendar",
    provider: "Google",
    category: "calendar",
    version: GOOGLE_CALENDAR_CONNECTOR_VERSION,
    status: "available",
    authenticationModes: ["oauth2"],
    capabilities: [
      "resource_discovery",
      "historical_import",
      "incremental_sync",
      "scheduled_sync",
      "manual_sync",
      "read",
      "local_deletion",
      "account_disconnect",
      "selective_resource_sync",
      "identity_data",
    ],
    sourceObjectTypes: ["calendar_event"],
    targetEntityTypes: ["calendar_event"],
    syncModes: ["initial", "manual", "scheduled", "incremental"],
    minimumRequiredScopes: GOOGLE_CALENDAR_SCOPES,
    optionalScopes: [],
    sensitivity: "sensitive",
    documentation: {
      summary: "Import events from calendars you explicitly select.",
      privacySummary: "Imported events are private to your Lighthouse Passport unless you share them later.",
      permissionsSummary: "Read-only calendar list, event access, and stable Google account identification.",
      backfillSummary: "Lighthouse shows the effective bounded import window before consent.",
    },
  },
]);

export const googleCalendarDefinition = connectorRegistry.requireAvailable(GOOGLE_CALENDAR_CONNECTOR_KEY);
