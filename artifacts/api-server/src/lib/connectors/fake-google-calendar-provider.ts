import { ConnectorError, type ConnectorProviderAdapter, type ConnectorProviderResource, type ConnectorTokenSet } from "@workspace/knowledge-model";

import { GOOGLE_CALENDAR_SCOPES, googleCalendarDefinition } from "./connector-definition";
import {
  normalizeGoogleCalendarEvent,
  type GoogleCalendarEvent,
  type NormalizedCalendarEvent,
} from "./google-calendar-provider";

type FakeFailure = "none" | "rate_limit" | "outage" | "permission_loss" | "refresh_failure";
type VersionedEvent = { revision: number; event: GoogleCalendarEvent };

const PERSONAL_CALENDAR = "fake-calendar-personal";
const OTHER_CALENDAR = "fake-calendar-unselected";

function timestamp(day: number, hour: number): string {
  return `2026-07-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00.000Z`;
}

function initialEvents(): VersionedEvent[] {
  return [
    {
      revision: 1,
      event: {
        id: "fake-event-correctable",
        etag: "fake-etag-1",
        status: "confirmed",
        summary: "Provider planning block",
        description: "Synthetic provider description",
        location: "Synthetic Room",
        start: { dateTime: timestamp(23, 14), timeZone: "UTC" },
        end: { dateTime: timestamp(23, 15), timeZone: "UTC" },
        created: timestamp(20, 9),
        updated: timestamp(20, 9),
        organizer: { email: "owner@fake.google.test", displayName: "Calendar Owner", self: true },
        attendees: [{ email: "guest@fake.google.test", responseStatus: "accepted", self: false }],
        visibility: "private",
      },
    },
    {
      revision: 1,
      event: {
        id: "fake-event-delete-me",
        etag: "fake-etag-delete-1",
        status: "confirmed",
        summary: "Provider event to remove",
        start: { date: "2026-07-24" },
        end: { date: "2026-07-25" },
        recurrence: ["RRULE:FREQ=DAILY;COUNT=1"],
        created: timestamp(20, 10),
        updated: timestamp(20, 10),
      },
    },
    {
      revision: 1,
      event: {
        id: "fake-unselected-event",
        etag: "fake-etag-other-1",
        status: "confirmed",
        summary: "UNSELECTED_CALENDAR_PRIVATE_EVENT",
        description: "This must never import unless its calendar is selected.",
        start: { dateTime: timestamp(25, 10), timeZone: "UTC" },
        end: { dateTime: timestamp(25, 11), timeZone: "UTC" },
      },
    },
  ];
}

export class FakeGoogleCalendarProvider implements ConnectorProviderAdapter<GoogleCalendarEvent, NormalizedCalendarEvent> {
  readonly definition = googleCalendarDefinition;
  private revision = 1;
  private events = initialEvents();
  private failure: FakeFailure = "none";
  private invalidateCursor = false;
  private readonly pageTokenQueries = new Map<string, string>();

  reset(): void {
    this.revision = 1;
    this.events = initialEvents();
    this.failure = "none";
    this.invalidateCursor = false;
    this.pageTokenQueries.clear();
  }

  applyScenario(scenario: "incremental_change" | "provider_update" | "cursor_invalidated" | "token_expiry" | "refresh_failure" | "rate_limit" | "outage" | "permission_loss"): void {
    if (scenario === "incremental_change") {
      this.revision += 1;
      this.events.push(
        {
          revision: this.revision,
          event: {
            id: "fake-event-correctable",
            etag: `fake-etag-${this.revision}`,
            status: "confirmed",
            summary: "Provider planning block updated",
            description: "Provider changed this after the initial sync",
            start: { dateTime: timestamp(23, 14), timeZone: "UTC" },
            end: { dateTime: timestamp(23, 16), timeZone: "UTC" },
            updated: timestamp(21, 9),
          },
        },
        {
          revision: this.revision,
          event: {
            id: "fake-event-new",
            etag: `fake-etag-new-${this.revision}`,
            status: "confirmed",
            summary: "Provider new event",
            start: { dateTime: timestamp(26, 9), timeZone: "UTC" },
            end: { dateTime: timestamp(26, 10), timeZone: "UTC" },
            updated: timestamp(21, 10),
          },
        },
        {
          revision: this.revision,
          event: {
            id: "fake-event-delete-me",
            etag: `fake-etag-delete-${this.revision}`,
            status: "cancelled",
            updated: timestamp(21, 11),
          },
        },
      );
      return;
    }
    if (scenario === "provider_update") {
      this.revision += 1;
      this.events.push({
        revision: this.revision,
        event: {
          id: "fake-event-correctable",
          etag: `fake-etag-${this.revision}`,
          status: "confirmed",
          summary: "Provider attempted another overwrite",
          description: "Provider attempted another body overwrite",
          start: { dateTime: timestamp(23, 14), timeZone: "UTC" },
          end: { dateTime: timestamp(23, 17), timeZone: "UTC" },
          updated: timestamp(22, 9),
        },
      });
      return;
    }
    if (scenario === "cursor_invalidated") this.invalidateCursor = true;
    else if (scenario === "token_expiry") this.failure = "none";
    else this.failure = scenario;
  }

  buildAuthorizationUrl(request: { state: string; redirectUri: string; codeChallenge: string }): string {
    const callback = new URL(request.redirectUri);
    const url = new URL("/api/connectors/google-calendar/fake/authorize", callback.origin);
    url.searchParams.set("state", request.state);
    url.searchParams.set("code_challenge", request.codeChallenge);
    return url.toString();
  }

  async exchangeAuthorizationCode(input: { code: string }): Promise<ConnectorTokenSet> {
    if (input.code !== "fake-approved-code" && input.code !== "fake-missing-scope-code") {
      throw new ConnectorError("authorization_denied", "permanent_connection", "Google authorization was not completed.");
    }
    return {
      accessToken: "fake-access-token",
      refreshToken: "fake-refresh-token",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      scopes: input.code === "fake-missing-scope-code" ? GOOGLE_CALENDAR_SCOPES.slice(0, -1) : [...GOOGLE_CALENDAR_SCOPES],
      tokenType: "Bearer",
    };
  }

  async refreshCredentials(tokens: ConnectorTokenSet): Promise<ConnectorTokenSet> {
    if (this.failure === "refresh_failure") {
      throw new ConnectorError("refresh_failed", "reconnect_required", "Reconnect Google Calendar to continue.");
    }
    return { ...tokens, accessToken: "fake-refreshed-access-token", expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() };
  }

  async resolveAccount() {
    return { stableId: "fake-google-subject-a", displayLabel: "owner@fake.google.test" };
  }

  async discoverResources(): Promise<ConnectorProviderResource[]> {
    this.throwConfiguredFailure();
    return [
      { stableId: PERSONAL_CALENDAR, resourceType: "calendar", displayName: "Personal", metadata: { primary: true, timeZone: "UTC", accessRole: "owner" } },
      { stableId: OTHER_CALENDAR, resourceType: "calendar", displayName: "Other calendar", metadata: { primary: false, timeZone: "UTC", accessRole: "reader" } },
    ];
  }

  async listSourceObjects(input: {
    resource: ConnectorProviderResource;
    pageToken: string | null;
    cursor: string | null;
    backfillStart: string;
    backfillEnd: string;
  }) {
    this.throwConfiguredFailure();
    if (this.invalidateCursor && input.cursor) {
      this.invalidateCursor = false;
      throw new ConnectorError("cursor_invalidated", "permanent_resource", "Fake cursor invalidated.");
    }

    const queryKey = JSON.stringify({
      resourceId: input.resource.stableId,
      cursor: input.cursor,
      timeMin: input.cursor ? null : input.backfillStart,
      timeMax: input.cursor ? null : input.backfillEnd,
      maxResults: 250,
      showDeleted: true,
      singleEvents: false,
    });
    if (input.pageToken && this.pageTokenQueries.get(input.pageToken) !== queryKey) {
      throw new ConnectorError("malformed_provider_response", "permanent_resource", "Fake provider rejected a page token used with a different query.");
    }

    const cursorRevision = input.cursor ? Number(input.cursor.replace("fake-cursor-", "")) : 0;
    const latest = new Map<string, VersionedEvent>();
    for (const version of this.events) {
      const calendarId = version.event.id === "fake-unselected-event" ? OTHER_CALENDAR : PERSONAL_CALENDAR;
      if (calendarId !== input.resource.stableId) continue;
      if (input.cursor && version.revision <= cursorRevision) continue;
      const prior = latest.get(version.event.id);
      if (!prior || prior.revision <= version.revision) latest.set(version.event.id, version);
    }
    const values = [...latest.values()].sort((left, right) => left.event.id.localeCompare(right.event.id));
    const pageIndex = input.pageToken ? Number(input.pageToken.replace("fake-page-", "")) : 0;
    const pageSize = 1;
    const items = values.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize).map((value) => value.event);
    const hasMore = (pageIndex + 1) * pageSize < values.length;
    const nextPageToken = hasMore ? `fake-page-${pageIndex + 1}` : null;
    if (nextPageToken) this.pageTokenQueries.set(nextPageToken, queryKey);
    return {
      items,
      nextPageToken,
      nextCursor: hasMore ? null : `fake-cursor-${this.revision}`,
    };
  }

  normalizeSourceObject(input: GoogleCalendarEvent, resource: ConnectorProviderResource): NormalizedCalendarEvent {
    return normalizeGoogleCalendarEvent(input, resource.stableId);
  }

  async revoke(): Promise<void> {
    if (this.failure === "outage") {
      throw new ConnectorError("provider_unavailable", "retryable", "Fake provider unavailable.");
    }
  }

  private throwConfiguredFailure(): void {
    if (this.failure === "rate_limit") throw new ConnectorError("rate_limited", "retryable", "Fake provider rate limit.", 1);
    if (this.failure === "outage") throw new ConnectorError("provider_unavailable", "retryable", "Fake provider outage.");
    if (this.failure === "permission_loss") throw new ConnectorError("permission_lost", "reconnect_required", "Fake provider permission lost.");
  }
}

export const fakeGoogleCalendarProvider = new FakeGoogleCalendarProvider();
