# Database Testing

Lighthouse uses PostgreSQL for database-backed privacy verification. The test
database must be isolated from development and production data.

## Disposable PostgreSQL

Default local test connections:

```bash
TEST_DATABASE_MIGRATION_URL=postgres://lighthouse_test:lighthouse_test_password@127.0.0.1:55432/lighthouse_test
TEST_DATABASE_URL=postgres://lighthouse_test_app:lighthouse_test_app_password@127.0.0.1:55432/lighthouse_test
TEST_CONNECTOR_WORKER_DATABASE_URL=postgres://lighthouse_test_worker:lighthouse_test_worker_password@127.0.0.1:55432/lighthouse_test
CONNECTOR_WORKER_DATABASE_URL=postgres://lighthouse_test_worker:lighthouse_test_worker_password@127.0.0.1:55432/lighthouse_test
```

The migration URL owns schema setup and deterministic fixtures. The runtime URL
is the only connection supplied to the API and request-level tests. The runtime
login is neither a superuser nor a table owner, has no `BYPASSRLS`, and inherits
only the privileges granted to the non-login `lighthouse_runtime` role.

Commands:

```bash
pnpm run db:test:up
pnpm run db:test:migrate
pnpm run db:test:reset
pnpm run db:test:down
pnpm run test:integration
pnpm run test:e2e
pnpm run test:knowledge-model
```

`db:test:up` starts a Docker container named `lighthouse-postgres-test` using
`postgres:16-alpine`. `db:test:reset` drops and recreates the `public` schema,
applies the ordered, reviewable SQL migration files under `lib/db/migrations`,
and provisions the restricted test runtime login without storing its password
in a migration. It also provisions a distinct connector worker login that can
claim one due connection but must re-enter the same actor-scoped RLS path.

The reset and migrate scripts validate both URLs and refuse to run unless the
resolved database host is local and the database name contains `test`. The
runtime and migration usernames must differ. To intentionally use another
isolated test database, set both test URLs. Avoid setting
`ALLOW_NON_TEST_DATABASE=true` except in controlled CI where the database is
already disposable.

When `TEST_DATABASE_MIGRATION_URL` points at the default Docker database on port
`55432`, the script uses `docker exec ... psql` inside the container. When it
points at another local test database, such as the GitHub Actions PostgreSQL
service on port `5432`, the runner must have the `psql` client installed.
This same custom-URL path supports an isolated native PostgreSQL installation;
all three URLs must target the same local database with distinct migration,
runtime, and worker usernames.

## Runtime Row-Level Security

Migration `0002_lighthouse_runtime_rls.sql` protects these Lighthouse-owned
tables:

- `library_items`
- `personal_vaults`
- `data_sources`
- `data_records`
- `consent_grants`
- `sharing_grants`
- `audit_events`
- `signal_observations`
- `shared_spaces`

`library_items` preserves the established owner, household, and active
record-level read-grant behavior. Mutations remain owner-only. The foundational
person-owned tables are owner-only because no broader product sharing workflow
exists for them yet. `shared_spaces` is household-readable and creator-writable.
`audit_events` exposes only owner or household-record history and permits event
writes only by the current actor for a visible Library item.

The API sets `lighthouse.actor_user_id` and
`lighthouse.actor_household_id` with transaction-local PostgreSQL settings for
each authenticated Library request. Missing or malformed actor context fails
closed. Pool connections do not retain actor state after the transaction.

`signal_definitions` remains global reference metadata and is runtime-readable
but not runtime-writable. The legacy Together and Family Nexus tables are not
RLS-protected in this focused slice; their existing API authorization remains in
place and they require a separate migration and policy review before conversion.
Future tables receive no runtime privileges by default and must be granted
deliberately in a reviewed migration.

Migration `0003_family_knowledge_graph.sql` adds the graph tables described in
`docs/architecture/knowledge-graph.md`. The restricted runtime role can read
the immutable entity and relationship type registries but cannot mutate them.
All actor-owned graph tables use fail-closed RLS. Entity sharing is
record-specific; relationship reads require both endpoints; sources,
source-link evidence, versions, graph audit events, and Passports remain
owner-only. Typed extensions maintain owner-only snapshots in
`knowledge_extension_versions`. Runtime roles cannot physically delete graph
rows.

`pnpm run test:knowledge-model` validates the shared registries, normalization
bounds, connector mappings, Observation/Passport boundaries, and unified search
contract. `pnpm run test:integration` runs the Library, graph, and connector
suites in separate processes with a clean migration before each.

Migration `0004_connector_platform.sql` protects actor-owned connections,
consents, resource selections, checkpoints, sync runs, normalized source
objects, source mappings, OAuth state, and connector audit events with the same
fail-closed actor context. The general runtime role has no direct credential
table privilege. Owner-checking security-definer functions provide the narrow
credential read/write/delete path. The non-login `lighthouse_connector_worker`
role can only claim one due connection and apply bounded operational retention;
the worker then re-enters the normal actor-scoped runtime path.

## Migration Contract

The repository's test and CI migration convention is ordered SQL under
`lib/db/migrations`. Integration tests verify the expected tables, indexes,
unique Passport ID index, nullability, session table, RLS enablement, restricted
runtime authority, missing-context denial, owner isolation, household behavior,
and the current service-managed lifecycle model for Library records, grants,
and audit events.

Do not commit `.env`, database volumes, Docker state, or generated Playwright
artifacts. Use `.env.example` for placeholders only.

## Local Application Smoke Test

After migrating the disposable database, start the built API with the
restricted runtime URL in one shell:

```bash
pnpm --filter @workspace/api-server run build
DATABASE_URL="$TEST_DATABASE_URL" \
  NODE_ENV=development \
  PORT=5000 \
  SESSION_SECRET=replace-with-a-local-random-secret \
  pnpm --filter @workspace/api-server run start
```

Start the app and its API proxy in a second shell:

```bash
PORT=5173 \
  BASE_PATH=/ \
  API_PROXY_TARGET=http://127.0.0.1:5000 \
  pnpm --filter @workspace/family-app run dev
```

Open `http://127.0.0.1:5173/`. The API health check is available at
`http://127.0.0.1:5000/api/healthz`. Keep `DATABASE_MIGRATION_URL` out of the
API process; only controlled migration and fixture setup may use it.

Production bundles can be checked independently with:

```bash
pnpm --filter @workspace/api-server run build
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/family-app run build
pnpm run build
```

On Windows PowerShell, use `pnpm.cmd` and set the same values with `$env:NAME`.
The lockfile retains the Windows x64 binaries for esbuild, Rollup, Lightning
CSS, and Tailwind Oxide as transitive optional packages; they are not direct
cross-platform dependencies. A normal `pnpm.cmd install --frozen-lockfile`
selects them for Windows x64, while Linux installs continue to select the
existing Linux x64 packages.

## Linux Verification

The GitHub Actions workflow `.github/workflows/lighthouse-privacy.yml` runs the
clean Linux proof:

```bash
pnpm install --frozen-lockfile
pnpm run db:test:migrate
pnpm run typecheck
pnpm run test:library-policy
pnpm run test:knowledge-model
pnpm run test:connector-platform
pnpm run connector:worker:once
pnpm run test:integration
pnpm run test:e2e
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/family-app run build
pnpm run build
```
