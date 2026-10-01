# CI

`.github/workflows/ci.yml` runs on every pull request and on every push to `main` (PRD §12, pipeline steps 1–4). Each job installs with `pnpm install --frozen-lockfile` through the shared `.github/actions/setup` action (Node from `.nvmrc`, pnpm from `packageManager`).

## Required checks

These job names are stable. `scripts/ralph/merge-pr.sh` reads this table and refuses to merge a PR unless every job listed here passed on its head commit (D-055; the repo has no server-side branch protection). Keep the table format: each required job is a row starting with its name in backticks. Renaming a job means updating this table in the same PR.

| Job | What it runs | Local equivalent |
| --- | --- | --- |
| `lint` | Biome lint and format check (`biome ci .`), then the Source vocabulary check (`scripts/check-vocabulary.sh`) | `pnpm lint` and `pnpm vocabulary:check` |
| `typecheck` | `tsc` in every workspace package via Turbo | `pnpm typecheck` |
| `db-check` | Migration drift check: the Drizzle schema must match the committed migrations (`drizzle-kit check` plus a scratch `generate`) | `pnpm db:check` |
| `unit` | Vitest unit tests in every workspace package via Turbo | `pnpm test:unit` |
| `integration` | Vitest + Testcontainers tests (Postgres 18 and Redis 7) via Turbo; needs Docker | `pnpm test:integration` |
| `build` | Builds every workspace package via Turbo, then fails if `apps/api/openapi.json` is stale (`openapi:check`) | `pnpm build && pnpm openapi:check` |
| `gitleaks` | Gitleaks secret scan of the full git history | `pnpm secrets:scan` |
| `audit` | `pnpm audit --audit-level high` (fails on high and critical) | `pnpm audit:deps` |
| `e2e` | Playwright + axe in Chromium, WebKit, and a mobile viewport against the built apps and the Docker services (`docker compose up -d --wait`, `SOURCE_MODE=stub`, database migrated after the build). Uploads the Playwright report as an artifact | `pnpm build && pnpm db:migrate && pnpm test:e2e` |

Later tasks add jobs here as their commands appear. Each one must also be added to this table (and to `pnpm check`, except `e2e`, which needs the Docker services and browsers and runs on its own).

## Deploy workflow

`.github/workflows/deploy-staging.yml` deploys `main` to staging after merge. It is not a required PR check and is not in the table above. See `docs/deploy.md`.

## Where CI runs

All jobs run on GitHub-hosted `ubuntu-latest` runners (D-119). The repo is public while the app is being built, so these minutes are free. If the repo goes private again and minutes run short, switch to the self-hosted runner described in `docs/ci-runner.md` (D-113). Never use a self-hosted runner while the repo is public.

## `pnpm check`

`pnpm check` runs every CI job except `e2e` locally, in order, and stops at the first failure. The integration tests need Docker running (Testcontainers), and so does the secret scan unless a local `gitleaks` binary is installed.

## Turborepo remote cache

Set the repository secret `TURBO_TOKEN` and the variable (or secret) `TURBO_TEAM` to enable the Vercel remote cache. Without them the values are empty and Turbo falls back to its local cache; CI still passes.

## End-to-end tests (`e2e/`)

`pnpm test:e2e` runs `e2e/specs/*.spec.ts` in three Playwright projects (`chromium`, `webkit`, and `mobile`, a Pixel 7 viewport). Playwright's `webServer` starts the built API (`apps/api/dist/server.js`, port 3000) and web app (`react-router-serve`, port 5173) with `SOURCE_MODE=stub`, so run `docker compose up -d --wait`, `pnpm build`, and `pnpm db:migrate` first. The stack runs the job worker in-process and sends email to Mailpit, and specs give each browser its own client IP (D-083). Locally it reuses servers that are already running (for example `pnpm dev`); in CI it always starts its own. Install browsers once with `pnpm --filter e2e install:browsers`.

Tests visit `http://www.reprint.localhost:5173` (D-013). Override the origins with `E2E_WEB_ORIGIN` and `E2E_API_ORIGIN`. Every spec that visits a page calls `expectNoA11yViolations(page)` from `e2e/support/a11y.ts`, which fails on serious or critical axe issues (PRD §12).
