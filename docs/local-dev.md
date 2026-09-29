# Local development

Everything runs locally without external accounts (PRD §13).

## Prerequisites

- Node 24 (`.nvmrc`) and pnpm 12.6 (via corepack: `corepack enable`)
- Docker (Compose v2), also required by the integration tests (Testcontainers)

## First-time setup

```
pnpm install
cp .env.example .env        # optional for now: the db commands default to the compose database
docker compose up -d --wait
pnpm db:migrate
```

## Services (`docker-compose.yml`)

| Service | Host port | Notes |
| --- | --- | --- |
| `postgres` (18) | 5432 | user, password, and database are all `reprint`. `docker/postgres/init.sql` enables `pg_trgm`, `unaccent`, and `citext` |
| `redis` (7) | 6379 | |
| `mailpit` | 1025 (SMTP), 8025 (UI) | Catches all outgoing email: http://localhost:8025 |

`docker compose down` stops them and keeps data; `docker compose down -v` also wipes the volumes.

## Database (`packages/db`)

| Command | What it does |
| --- | --- |
| `pnpm db:generate` | Generates a migration from schema changes in `packages/db/src/schema/` (`drizzle-kit generate`). Commit the SQL and `meta/` files. Never edit an applied migration |
| `pnpm db:migrate` | Builds the package and applies pending migrations to `DATABASE_URL_DIRECT` or `DATABASE_URL` (defaults to the compose database outside production) |
| `pnpm db:check` | Fails if the schema differs from the committed migrations, or the migration history is inconsistent. Needs no database. Runs in CI as `db-check` |
| `pnpm test:integration` | Runs `*.integration.test.ts` files. They start their own Postgres 18 container with Testcontainers, so they never touch the compose database |

The first migration (`0000_extensions`) repeats the extensions from `init.sql` with `IF NOT EXISTS`, so managed databases work too.

Conventions enforced by `packages/db/src/schema/conventions.integration.test.ts`: every foreign key has an index, and no column is `timestamp` without time zone. Use the `uuidv7Pk()` and `timestamps()` helpers from `packages/db/src/schema/helpers.ts` for new tables.

## API integration tests (`apps/api`)

`pnpm test:integration` also runs `apps/api/src/**/*.integration.test.ts`. Each file calls `startTestStack()` (`apps/api/src/testing/stack.ts`), which starts its own Postgres 18 and Redis 7 containers and runs the migrations. Call `stack.reset()` in `beforeEach` to empty every table and flush Redis; `stack.stopRedis()` simulates a Redis outage. `GET /v1/ready` checks Postgres and Redis and returns 503 Problem Details when either is unreachable.

