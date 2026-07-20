# Database Testing

Lighthouse uses PostgreSQL for database-backed privacy verification. The test
database must be isolated from development and production data.

## Disposable PostgreSQL

Default local test database:

```bash
postgres://lighthouse_test:lighthouse_test_password@127.0.0.1:55432/lighthouse_test
```

Commands:

```bash
pnpm run db:test:up
pnpm run db:test:migrate
pnpm run db:test:reset
pnpm run db:test:down
pnpm run test:integration
pnpm run test:e2e
```

`db:test:up` starts a Docker container named `lighthouse-postgres-test` using
`postgres:16-alpine`. `db:test:reset` drops and recreates the `public` schema,
then applies the ordered, reviewable SQL migration files under
`lib/db/migrations`.

The reset and migrate scripts refuse to run unless the resolved database host
is local and the database name contains `test`. To intentionally use a different
isolated test database, set `TEST_DATABASE_URL`. Avoid setting
`ALLOW_NON_TEST_DATABASE=true` except in controlled CI where the database is
already disposable.

When `TEST_DATABASE_URL` points at the default Docker database on port `55432`,
the script uses `docker exec ... psql` inside the container. When it points at
another local test database, such as the GitHub Actions PostgreSQL service on
port `5432`, the runner must have the `psql` client installed.

## Migration Contract

The repository's test and CI migration convention is ordered SQL under
`lib/db/migrations`. Integration tests verify the expected tables, indexes,
unique Passport ID index, nullability, session table, and the current
service-managed lifecycle model for Library records, grants, and audit events.

Do not commit `.env`, database volumes, Docker state, or generated Playwright
artifacts. Use `.env.example` for placeholders only.

## Linux Verification

The GitHub Actions workflow `.github/workflows/lighthouse-privacy.yml` runs the
clean Linux proof:

```bash
pnpm install --frozen-lockfile
pnpm run db:test:migrate
pnpm run typecheck
pnpm run test:library-policy
pnpm run test:integration
pnpm run test:e2e
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/family-app run build
pnpm run build
```
