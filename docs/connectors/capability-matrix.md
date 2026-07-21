# Connector Capability Matrix

## Registry Contract

The server-owned `connector-catalog.v1` registry is immutable application code. It is not user-editable and has no mutable catalog table. Each entry records a stable ID, provider, display metadata, data categories, collection mode, availability, required authorization, allowed purposes, prohibited uses, sensitivity, refresh limitations, regional/platform limitations, terms-review status, import/export support, unavailability reason, and whether collection can involve another adult.

Unknown IDs, categories, purposes, and unregistered capability combinations fail closed. Deferred, unsupported, and prohibited connectors cannot activate. No connector authorizes collection from another adult.

## Current Catalog

| Connector ID               | Provider or source                | Mode                               | Status      | Import/export          | Boundary                                                                                           |
| -------------------------- | --------------------------------- | ---------------------------------- | ----------- | ---------------------- | -------------------------------------------------------------------------------------------------- |
| `manual-family-library`    | Lighthouse                        | Manual upload                      | Available   | JSON import and export | The signed-in adult supplies and confirms one record directly.                                     |
| `apple-screen-time`        | Apple                             | User-authorized platform collector | Deferred    | None                   | Requires device-user authorization and Apple entitlements; never another adult's device.           |
| `android-usage-stats`      | Android                           | User-authorized platform collector | Deferred    | None                   | Requires authorization by the device user in Android settings.                                     |
| `apple-healthkit`          | Apple                             | User-authorized platform collector | Deferred    | None                   | Fine-grained per-data-type authorization; no other-adult path and no medical or diagnostic claims. |
| `google-data-portability`  | Google                            | Data portability export            | Deferred    | None                   | Limited to provider-supported portability scopes and exports; not universal account access.        |
| `social-media-portability` | Social/media platforms            | Unsupported                        | Unsupported | None                   | Many providers do not expose complete, stable personal-history exports.                            |
| `adult-device-mdm`         | Device management platforms       | Prohibited                         | Prohibited  | None                   | Lighthouse will not monitor another adult through MDM.                                             |
| `accessibility-scraping`   | Accessibility/scraping interfaces | Prohibited                         | Prohibited  | None                   | Lighthouse will not bypass platform controls or provider terms.                                    |

## Collection Modes

- `manual-upload`
- `live-oauth-api`
- `periodic-api`
- `user-authorized-platform-collector`
- `data-portability-export`
- `local-only`
- `unsupported`
- `prohibited`

Only `manual-upload` is currently available. A catalog entry is descriptive policy metadata, not proof that a provider capability exists.
