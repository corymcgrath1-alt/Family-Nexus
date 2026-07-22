import type { ConnectorProviderAdapter } from "@workspace/knowledge-model";

import { fakeGoogleCalendarProvider } from "./fake-google-calendar-provider";
import { GoogleCalendarProvider, type GoogleCalendarEvent, type NormalizedCalendarEvent } from "./google-calendar-provider";

export type GoogleProviderAdapter = ConnectorProviderAdapter<GoogleCalendarEvent, NormalizedCalendarEvent>;

export function connectorProviderMode(): "google" | "fake" {
  const mode = process.env.CONNECTOR_PROVIDER_MODE ?? "google";
  if (mode !== "google" && mode !== "fake") throw new Error("CONNECTOR_PROVIDER_MODE must be google or fake.");
  if (mode === "fake" && process.env.NODE_ENV === "production") {
    throw new Error("The fake connector provider cannot run in production.");
  }
  return mode;
}

export function getGoogleCalendarProvider(): GoogleProviderAdapter {
  return connectorProviderMode() === "fake" ? fakeGoogleCalendarProvider : new GoogleCalendarProvider();
}

export function googleOauthRedirectUri(origin?: string): string {
  if (connectorProviderMode() === "fake") {
    if (!origin) throw new Error("Fake provider OAuth requires the current API origin.");
    return `${origin}/api/connectors/google-calendar/oauth/callback`;
  }
  const configured = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!configured) throw new Error("GOOGLE_OAUTH_REDIRECT_URI is required.");
  return configured;
}
