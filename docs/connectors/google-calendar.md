# Google Calendar Connector

## Capabilities

Google Calendar supports account identification, calendar discovery, explicit calendar selection, read-only event import, bounded initial backfill, incremental synchronization, scheduled/manual execution, pause/resume, account disconnect, and local retention choices. Calendar writes, attachment access, Drive traversal, Gmail, Contacts, and provider-side event deletion are absent.

## Scopes

- `openid`: obtain Google's stable `sub` account identifier.
- `email`: show the connected account label to its owner.
- `https://www.googleapis.com/auth/calendar.calendarlist.readonly`: list available calendars.
- `https://www.googleapis.com/auth/calendar.events.readonly`: read events from selected calendars.

Email is never used as the stable account key. The Calendar API lists these read scopes in its [CalendarList list](https://developers.google.com/calendar/api/v3/reference/calendarList/list) and [Events list](https://developers.google.com/calendar/api/v3/reference/events/list) references.

## Backfill and Recurrence

The default initial window is 365 days in the past through 365 days in the future. It is configurable up to 3,650 days in either direction. The UI discloses the default before consent.

Requests use `singleEvents=false` and preserve recurring masters, recurrence rules, recurring-event IDs, original start times, and modified/cancelled exceptions as separate provider objects. All-day end dates remain provider-exclusive. Incremental requests use the stored sync token and include provider tombstones. Cursor recovery repeats only the bounded window.

## Normalized Fields

The normalizer retains event/calendar IDs in owner-only source storage; title, description, location, start/end, all-day state, timezone, recurrence, status, organizer, bounded attendees and responses, provider creation/update times, conference link, provider visibility, and deletion state. It does not fetch attachments, follow links, parse descriptions into facts, infer relationships, or treat attendees as Lighthouse users.

## Live Setup

Create a Google web OAuth client, enable Calendar API, and register the exact `GOOGLE_OAUTH_REDIRECT_URI`. Configure the variables documented in `.env.example`, use HTTPS outside loopback development, and complete Google's own consent/verification requirements. Live credentials are optional and never required by CI.
