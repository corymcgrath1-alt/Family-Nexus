# System Context

```mermaid
flowchart LR
  user["Adult or dependent user"] --> app["Lighthouse web app"]
  app --> api["Express API"]
  api --> auth["Session auth"]
  api --> policy["Authorization and consent policy"]
  api --> db["PostgreSQL via Drizzle"]
  api --> audit["Audit events"]
  api --> connectors["Connector registry"]
  connectors --> manual["Manual upload or user export"]
  connectors --> oauth["Future OAuth APIs"]
  connectors --> local["Future local/on-device collectors"]
  db --> library["Family Library records"]
  db --> connection["Connection domain"]
  db --> household["Household membership"]
  policy --> library
  policy --> audit
```

## Current Components

- `artifacts/family-app`: frontend shell, auth pages, Today, Family, Library, Together/Connection, and Privacy.
- `artifacts/api-server`: Express routes, session auth, seeded demo data, Library policy enforcement, and redacted Library audit writes.
- `lib/db`: Drizzle schema source, including Passport ID, Family Library, sharing grants, consent/source/record foundations, connector registry, signals, and audit events.
- `lib/api-spec`: OpenAPI source and generated API clients.

## Boundary Rules

- Browser route protection is convenience only; authorization must be enforced in API routes.
- Household membership is not sufficient for adult private data access.
- Search/list and direct fetch must use the same policy.
- Audit summaries must avoid sensitive content.
- External connector availability must be represented as capability metadata, not assumed by UI copy.
