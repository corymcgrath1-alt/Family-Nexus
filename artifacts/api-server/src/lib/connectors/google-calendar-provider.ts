import { ConnectorError, type ConnectorProviderAdapter, type ConnectorProviderPage, type ConnectorProviderResource, type ConnectorTokenSet } from "@workspace/knowledge-model";
import { createHash } from "node:crypto";
import { z } from "zod/v4";

import { GOOGLE_CALENDAR_SCOPES, googleCalendarDefinition } from "./connector-definition";

const dateTimeSchema = z.object({
  date: z.string().optional(),
  dateTime: z.string().datetime({ offset: true }).optional(),
  timeZone: z.string().max(200).optional(),
}).strict().refine((value) => Boolean(value.date || value.dateTime), "Calendar time requires date or dateTime.");

const googleEventSchema = z.object({
  id: z.string().min(1).max(1024),
  etag: z.string().max(1024).optional(),
  status: z.enum(["confirmed", "tentative", "cancelled"]).default("confirmed"),
  summary: z.string().max(2000).optional(),
  description: z.string().max(12000).optional(),
  location: z.string().max(2000).optional(),
  start: dateTimeSchema.optional(),
  end: dateTimeSchema.optional(),
  recurrence: z.array(z.string().max(2000)).max(20).optional(),
  recurringEventId: z.string().max(1024).optional(),
  originalStartTime: dateTimeSchema.optional(),
  organizer: z.object({
    email: z.string().email().max(320).optional(),
    displayName: z.string().max(500).optional(),
    self: z.boolean().optional(),
  }).passthrough().optional(),
  attendees: z.array(z.object({
    email: z.string().email().max(320).optional(),
    displayName: z.string().max(500).optional(),
    responseStatus: z.enum(["needsAction", "declined", "tentative", "accepted"]).optional(),
    self: z.boolean().optional(),
  }).passthrough()).max(100).optional(),
  created: z.string().datetime({ offset: true }).optional(),
  updated: z.string().datetime({ offset: true }).optional(),
  hangoutLink: z.string().url().max(2000).optional(),
  visibility: z.enum(["default", "public", "private", "confidential"]).optional(),
}).passthrough();

export type GoogleCalendarEvent = z.infer<typeof googleEventSchema>;

export const normalizedCalendarEventSchema = z.object({
  externalEventId: z.string().min(1).max(1024),
  calendarId: z.string().min(1).max(1024),
  externalVersion: z.string().max(1024).nullable(),
  title: z.string().max(160),
  description: z.string().max(12000).nullable(),
  location: z.string().max(2000).nullable(),
  start: z.string().nullable(),
  end: z.string().nullable(),
  allDay: z.boolean(),
  timezone: z.string().max(200).nullable(),
  recurrence: z.array(z.string().max(2000)).max(20),
  recurringEventId: z.string().max(1024).nullable(),
  originalStartTime: z.string().nullable(),
  eventStatus: z.enum(["confirmed", "tentative", "cancelled"]),
  organizer: z.object({ email: z.string().email().max(320).nullable(), displayName: z.string().max(500).nullable(), self: z.boolean() }).nullable(),
  attendees: z.array(z.object({
    email: z.string().email().max(320).nullable(),
    displayName: z.string().max(500).nullable(),
    responseStatus: z.enum(["needsAction", "declined", "tentative", "accepted"]).nullable(),
    self: z.boolean(),
  }).strict()).max(100),
  providerCreatedAt: z.string().nullable(),
  providerUpdatedAt: z.string().nullable(),
  conferenceLink: z.string().url().max(2000).nullable(),
  providerVisibility: z.enum(["default", "public", "private", "confidential"]),
  sourceDeleted: z.boolean(),
}).strict();

export type NormalizedCalendarEvent = z.infer<typeof normalizedCalendarEventSchema>;

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().int().positive().default(3600),
  scope: z.string().default(""),
  token_type: z.string().default("Bearer"),
}).passthrough();

const accountSchema = z.object({
  sub: z.string().min(1).max(255),
  email: z.string().email().max(320),
  email_verified: z.boolean().optional(),
}).passthrough();

const calendarListPageSchema = z.object({
  nextPageToken: z.string().optional(),
  items: z.array(z.object({
    id: z.string().min(1).max(1024),
    summary: z.string().max(1000),
    timeZone: z.string().max(200).optional(),
    primary: z.boolean().optional(),
    accessRole: z.string().max(100).optional(),
  }).passthrough()).default([]),
}).passthrough();

const eventListPageSchema = z.object({
  nextPageToken: z.string().optional(),
  nextSyncToken: z.string().optional(),
  items: z.array(googleEventSchema).default([]),
}).passthrough();

function requiredConfiguration() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google OAuth requires GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REDIRECT_URI.");
  }
  return { clientId, clientSecret, redirectUri };
}

async function providerJson<T>(url: string, schema: z.ZodType<T>, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new ConnectorError("transient_network_failure", "retryable", "Google Calendar is temporarily unreachable.");
  }
  if (response.status === 401) throw new ConnectorError("invalid_credentials", "reconnect_required", "Google authorization is no longer valid.");
  if (response.status === 403) throw new ConnectorError("permission_lost", "reconnect_required", "Google Calendar permission is no longer available.");
  if (response.status === 410) throw new ConnectorError("cursor_invalidated", "permanent_resource", "Google Calendar requested a bounded resynchronization.");
  if (response.status === 429) {
    const retrySeconds = Number(response.headers.get("retry-after") ?? "1");
    throw new ConnectorError("rate_limited", "retryable", "Google Calendar rate limit reached.", Math.max(1, retrySeconds) * 1000);
  }
  if (response.status >= 500) throw new ConnectorError("provider_unavailable", "retryable", "Google Calendar is temporarily unavailable.");
  if (!response.ok) throw new ConnectorError("malformed_provider_response", "permanent_connection", "Google Calendar rejected the request.");
  try {
    return schema.parse(await response.json());
  } catch {
    throw new ConnectorError("malformed_provider_response", "permanent_connection", "Google Calendar returned an unsupported response.");
  }
}

function bearer(tokens: ConnectorTokenSet): Record<string, string> {
  return { authorization: `Bearer ${tokens.accessToken}`, accept: "application/json" };
}

export class GoogleCalendarProvider implements ConnectorProviderAdapter<GoogleCalendarEvent, NormalizedCalendarEvent> {
  readonly definition = googleCalendarDefinition;

  buildAuthorizationUrl(request: { state: string; redirectUri: string; codeChallenge: string; scopes: readonly string[] }): string {
    const { clientId } = requiredConfiguration();
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: request.redirectUri,
      response_type: "code",
      scope: request.scopes.join(" "),
      state: request.state,
      code_challenge: request.codeChallenge,
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent select_account",
      include_granted_scopes: "false",
    }).toString();
    return url.toString();
  }

  async exchangeAuthorizationCode(input: { code: string; redirectUri: string; codeVerifier: string }): Promise<ConnectorTokenSet> {
    const { clientId, clientSecret } = requiredConfiguration();
    const data = await providerJson("https://oauth2.googleapis.com/token", tokenResponseSchema, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        code: input.code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: input.redirectUri,
        grant_type: "authorization_code",
        code_verifier: input.codeVerifier,
      }),
    });
    return parseTokenResponse(data, null);
  }

  async refreshCredentials(tokens: ConnectorTokenSet): Promise<ConnectorTokenSet> {
    if (!tokens.refreshToken) throw new ConnectorError("refresh_failed", "reconnect_required", "Reconnect Google Calendar to continue.");
    const { clientId, clientSecret } = requiredConfiguration();
    const data = await providerJson("https://oauth2.googleapis.com/token", tokenResponseSchema, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokens.refreshToken,
        grant_type: "refresh_token",
      }),
    });
    return parseTokenResponse(data, tokens.refreshToken);
  }

  async resolveAccount(tokens: ConnectorTokenSet) {
    const account = await providerJson("https://openidconnect.googleapis.com/v1/userinfo", accountSchema, { headers: bearer(tokens) });
    return { stableId: account.sub, displayLabel: account.email };
  }

  async discoverResources(tokens: ConnectorTokenSet): Promise<ConnectorProviderResource[]> {
    const resources: ConnectorProviderResource[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 20; page += 1) {
      const url = new URL("https://www.googleapis.com/calendar/v3/users/me/calendarList");
      url.searchParams.set("maxResults", "250");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const result = await providerJson(url.toString(), calendarListPageSchema, { headers: bearer(tokens) });
      for (const calendar of result.items) {
        resources.push({
          stableId: calendar.id,
          resourceType: "calendar",
          displayName: calendar.summary,
          metadata: {
            timeZone: calendar.timeZone ?? null,
            primary: calendar.primary ?? false,
            accessRole: calendar.accessRole ?? null,
          },
        });
      }
      pageToken = result.nextPageToken;
      if (!pageToken) break;
    }
    return resources;
  }

  async listSourceObjects(input: {
    tokens: ConnectorTokenSet;
    resource: ConnectorProviderResource;
    pageToken: string | null;
    cursor: string | null;
    backfillStart: string;
    backfillEnd: string;
  }): Promise<ConnectorProviderPage<GoogleCalendarEvent>> {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.resource.stableId)}/events`);
    url.searchParams.set("maxResults", "250");
    url.searchParams.set("showDeleted", "true");
    url.searchParams.set("singleEvents", "false");
    if (input.pageToken) url.searchParams.set("pageToken", input.pageToken);
    if (input.cursor) url.searchParams.set("syncToken", input.cursor);
    else {
      url.searchParams.set("timeMin", input.backfillStart);
      url.searchParams.set("timeMax", input.backfillEnd);
    }
    const page = await providerJson(url.toString(), eventListPageSchema, { headers: bearer(input.tokens) });
    return { items: page.items, nextPageToken: page.nextPageToken ?? null, nextCursor: page.nextSyncToken ?? null };
  }

  normalizeSourceObject(input: GoogleCalendarEvent, resource: ConnectorProviderResource): NormalizedCalendarEvent {
    return normalizeGoogleCalendarEvent(input, resource.stableId);
  }

  async revoke(tokens: ConnectorTokenSet): Promise<void> {
    const token = tokens.refreshToken ?? tokens.accessToken;
    let response: Response;
    try {
      response = await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
      });
    } catch {
      throw new ConnectorError("transient_network_failure", "retryable", "Google revocation could not be confirmed.");
    }
    if (!response.ok && response.status !== 400) {
      throw new ConnectorError("provider_unavailable", "retryable", "Google revocation could not be confirmed.");
    }
  }
}

function parseTokenResponse(data: z.infer<typeof tokenResponseSchema>, existingRefreshToken: string | null): ConnectorTokenSet {
  const scopes = data.scope.split(/\s+/).filter(Boolean);
  const missingScopes = GOOGLE_CALENDAR_SCOPES.filter((scope) => !scopes.includes(scope));
  if (missingScopes.length > 0) throw new ConnectorError("missing_scope", "reconnect_required", "Required Google Calendar permissions were not granted.");
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? existingRefreshToken,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    scopes,
    tokenType: "Bearer",
  };
}

function dateValue(value: z.infer<typeof dateTimeSchema> | undefined): string | null {
  return value?.dateTime ?? value?.date ?? null;
}

export function normalizeGoogleCalendarEvent(raw: unknown, calendarId: string): NormalizedCalendarEvent {
  const event = googleEventSchema.parse(raw);
  const allDay = Boolean(event.start?.date && !event.start.dateTime);
  return normalizedCalendarEventSchema.parse({
    externalEventId: event.id,
    calendarId,
    externalVersion: event.etag ?? null,
    title: (event.summary ?? (event.status === "cancelled" ? "Cancelled event" : "Untitled event")).slice(0, 160),
    description: event.description ?? null,
    location: event.location ?? null,
    start: dateValue(event.start),
    end: dateValue(event.end),
    allDay,
    timezone: event.start?.timeZone ?? event.end?.timeZone ?? null,
    recurrence: event.recurrence ?? [],
    recurringEventId: event.recurringEventId ?? null,
    originalStartTime: dateValue(event.originalStartTime),
    eventStatus: event.status,
    organizer: event.organizer ? {
      email: event.organizer.email ?? null,
      displayName: event.organizer.displayName ?? null,
      self: event.organizer.self ?? false,
    } : null,
    attendees: (event.attendees ?? []).map((attendee) => ({
      email: attendee.email ?? null,
      displayName: attendee.displayName ?? null,
      responseStatus: attendee.responseStatus ?? null,
      self: attendee.self ?? false,
    })),
    providerCreatedAt: event.created ?? null,
    providerUpdatedAt: event.updated ?? null,
    conferenceLink: event.hangoutLink ?? null,
    providerVisibility: event.visibility ?? "default",
    sourceDeleted: event.status === "cancelled",
  });
}

export function checksumNormalizedEvent(event: NormalizedCalendarEvent): string {
  const stable = JSON.stringify(sortJsonValue(event));
  return createHash("sha256").update(stable).digest("hex");
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortJsonValue(nested)]),
    );
  }
  return value;
}
