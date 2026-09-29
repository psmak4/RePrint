# CI

`.github/workflows/ci.yml` runs on every pull request and on every push to `main` (PRD §12, pipeline steps 1–4). Each job installs with `pnpm install --frozen-lockfile` through the shared `.github/actions/setup` action (Node from `.nvmrc`, pnpm from `packageManager`).

## Required checks

These job names are stable. `scripts/ralph/merge-pr.sh` reads this table and refuses to merge a PR unless every job listed here passed on its head commit (D-055; the repo has no server-side branch protection). Keep the table format: each required job is a row starting with its name in backticks. Renaming a job means updating this table in the same PR.

| Job | What it runs | Local equivalent |
| --- | --- | --- |
| `lint` | Biome lint and format check (`biome ci .`) | `pnpm lint` |
| `typecheck` | `tsc` in every workspace package via Turbo | `pnpm typecheck` |
| `db-check` | Migration drift check: the Drizzle schema must match the committed migrations (`drizzle-kit check` plus a scratch `generate`) | `pnpm db:check` |
| `unit` | Vitest unit tests in every workspace package via Turbo | `pnpm test:unit` |
| `integration` | Vitest + Testcontainers tests (Postgres 18 and Redis 7) via Turbo; needs Docker | `pnpm test:integration` |
| `build` | Builds every workspace package via Turbo | `pnpm build` |
| `gitleaks` | Gitleaks secret scan of the full git history | `pnpm secrets:scan` |
| `audit` | `pnpm audit --audit-level high` (fails on high and critical) | `pnpm audit:deps` |

Later M1 tasks add jobs here as their commands appear (OpenAPI drift in `build`, `e2e`). Each one must also be added to `pnpm check` and to this table.

## `pnpm check`

`pnpm check` runs every non-e2e CI job locally, in order, and stops at the first failure. The integration tests need Docker running (Testcontainers), and so does the secret scan unless a local `gitleaks` binary is installed.

## Turborepo remote cache

Set the repository secret `TURBO_TOKEN` and the variable (or secret) `TURBO_TEAM` to enable the Vercel remote cache. Without them the values are empty and Turbo falls back to its local cache; CI still passes.
