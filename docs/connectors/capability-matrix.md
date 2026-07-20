# Connector Capability Matrix

## Capability Modes

- Live OAuth API
- Periodic API
- User-authorized platform collector
- Data portability export
- Manual upload
- Local-only connector
- Unsupported
- Prohibited

## Current Registry

| Provider or source | Categories | Mode | Status | Notes |
| --- | --- | --- | --- | --- |
| Manual Family Library entry | Knowledge, documents, household records | Manual upload | Implemented foundation | User supplies the record and source text manually. |
| Apple Screen Time | App usage, screen time | User-authorized platform collector | Deferred | Requires Apple authorization/entitlements; does not provide universal access to another adult's phone. |
| Android Usage Stats | App usage | User-authorized platform collector | Deferred | Requires device-user grant in Android Settings. |
| HealthKit | Health data | User-authorized platform collector | Deferred | Fine-grained per-data-type authorization; no other-adult grant. |
| Google Data Portability | Supported Google exports | Data portability export | Deferred | Provides supported scopes/exports, not every piece of live Google data. |
| Social/media platforms | Media and social history | Varies | Deferred or unsupported | Many platforms do not provide full personal-history APIs. |
| MDM against adult devices | Device telemetry | Prohibited | Prohibited | Do not use MDM to monitor adults. |
| Accessibility misuse/scraping | Device or app behavior | Prohibited | Prohibited | Do not bypass platform controls or terms. |

## Required Connector Metadata

Every future connector registration must record provider, data categories, required scopes, collection mode, refresh limits, last successful sync, cursor/checkpoint, revocation status, retention, data owner, allowed purposes, sensitivity, regional/platform limitations, and terms/review status.
