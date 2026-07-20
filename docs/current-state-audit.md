# Current-State Audit

Date: 2026-07-20

## Repository Intake

- Initial local workspace at `C:\Users\Surface i7\Documents\Lighthouse` contained only an empty `.git` directory with no commits, no remote, and no working files.
- Added `origin` from `https://github.com/corymcgrath1-alt/Family-Nexus.git`, fetched `origin/main`, and created branch `codex/lighthouse-core`.
- Remote history inspected: three commits, latest `8c23d86 Published your App`.
- Initial branch status after checkout was clean.

## Stack Observed

- Package manager: pnpm workspace.
- Runtime: Node.js 24.16.0 available locally.
- Frontend: Vite, React, Wouter, TanStack Query, Tailwind CSS, shadcn-style UI components.
- Backend: Express 5, `express-session`, `connect-pg-simple`, bcryptjs.
- Database: PostgreSQL through Drizzle ORM. Schema source is under `lib/db/src/schema`.
- API contract: OpenAPI source in `lib/api-spec/openapi.yaml`, generated React Query client and Zod schemas under `lib/api-client-react/src/generated` and `lib/api-zod/src/generated`.
- Deployment assumptions: Replit-oriented app with API port 5000 and frontend Vite config requiring `PORT` and `BASE_PATH`.

## Existing Product Shape

- The current app is already partially branded as Lighthouse in visible auth and shell surfaces.
- Existing working domains are Today, Messages, Together/experiences, Household, Vault placeholder, and Privacy.
- Relationship-support features exist mainly under `Together`, messages, invitations, memories, reflections, and planning tasks.
- Persistence is real PostgreSQL for users, households, sessions, messages, invitations, memories, planning tasks, calendar events, profiles, and reflections.
- Authentication is session-based demo auth; no production identity provider is configured in the repository.

## Baseline Checks

- `pnpm install --frozen-lockfile` failed on Windows because the root `preinstall` script calls `sh`, which is not available in this PowerShell environment.
- `pnpm install --frozen-lockfile --ignore-scripts` completed successfully and left only ignored `node_modules` directories.
- Baseline `pnpm run typecheck` failed before edits in `artifacts/api-server/src/routes/family-members.ts` with a Drizzle insert typing error around creating a missing experience profile.
- API startup could not be safely baselined yet because no `DATABASE_URL` is present in the environment.

## Notable Risks

- No migration files were present; current database workflow appears to rely on Drizzle `push`.
- Existing authorization is mostly household-scoped. It does not yet model adult-owned private records, revocation, or per-purpose consent.
- Existing privacy page is candid about lack of end-to-end encryption and document storage, which should be preserved.
- Baseline OpenAPI generated files contained legacy `FamilySpace` description comments derived from the API spec; the Lighthouse rename commit corrected those comments.
