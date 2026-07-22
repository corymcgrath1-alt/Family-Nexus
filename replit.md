# Lighthouse

The Family Intelligence Operating System.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` - run the API server (port 5000)
- `pnpm run typecheck` - full typecheck across all packages
- `pnpm run build` - typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` - regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` - push DB schema changes (dev only)
- Required env: `DATABASE_URL` - Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/family-app` - Vite/React frontend. Brand constants live in `src/lib/brand.ts`.
- `artifacts/api-server` - Express API and session auth.
- `lib/db/src/schema` - Drizzle schema source.
- `lib/api-spec/openapi.yaml` - OpenAPI source used for generated API/Zod clients.
- `docs/` - repository audit, brand compatibility notes, and architecture records.

## Architecture decisions

- Lighthouse is the working product name pending trademark, domain, app-store, and corporate-name clearance.
- Existing `family-app`, `/family-members`, and remote repository identifiers are retained as legacy compatibility names until a separate migration is planned.
- Current auth is session-based demo auth; production identity must remain gated until a real provider and deployment secret posture are configured.

## Product

Lighthouse helps a household coordinate shared life while preserving adult-owned private space. The current prototype includes Today, household membership, Family Library records and sharing, relationship-support experiences, messages, and privacy visibility.

## User Preferences

- Treat Lighthouse as a consent-native family intelligence operating system, not a couples-only app or surveillance product.
- Preserve existing relationship-support work as one domain rather than deleting it.

## Gotchas

- On Windows PowerShell, the root `preinstall` script calls `sh`; use `pnpm install --frozen-lockfile --ignore-scripts` when Git Bash is unavailable.
- The API requires `DATABASE_URL` even for startup because `@workspace/db` validates it at import time.
- `connect-pg-simple` expects the session table to already exist in bundled builds.

## Pointers

- See `.agents/memory/lighthouse-auth-arch.md` for existing auth/session notes.
- See `docs/brand-rename-and-legacy-compatibility.md` for retained legacy identifiers.
