# Brand Rename and Legacy Compatibility

## Working Product Name

- Product name: Lighthouse
- Product descriptor: The Family Intelligence Operating System
- Status: working product name only. Trademark, domain, app-store, and corporate-name clearance have not been completed. Google has a prominent software tool named Lighthouse, so this repository must not claim brand clearance.

## Source of Truth

- Frontend product constants live in `artifacts/family-app/src/lib/brand.ts`.
- Browser metadata lives in `artifacts/family-app/index.html`.
- API contract wording lives in `lib/api-spec/openapi.yaml`.

## Intentionally Retained Legacy Identifiers

- GitHub repository and remote URL remain `Family-Nexus`; renaming the remote repository is a separate infrastructure and governance action.
- Workspace package name `@workspace/family-app` is retained because it is an internal package identifier, not visible product copy.
- Existing API route names such as `/family-members` are retained for client compatibility.
- Database table names such as `households`, `users`, and experience/memory tables are retained to avoid unsafe migration churn.
- Existing deployed URLs and Replit project names are not renamed by this change.

## Compatibility Position

Product-facing copy should say Lighthouse. Internal legacy names can remain only when changing them would affect deployed links, package imports, generated clients, database migrations, OAuth/app signing identities, or remote infrastructure.
