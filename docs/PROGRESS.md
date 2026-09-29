# Progress log

Append-only. Every loop iteration adds one entry at the **bottom** when its PR merges (and the owner may add entries too). Never edit or delete earlier entries; correct them with a new one. The next iteration reads the last 40 lines, so put anything it must know here: half-finished work, gotchas, new tasks you added, deferred items.

Entry format:

```
### <YYYY-MM-DD> · <task id> · <PR #>
- What changed (2–4 lines total).
- Anything the next iteration should know (or "Nothing to hand off").
```

---

### 2026-09-28 · BOOTSTRAP · #1
- Added the build loop (`scripts/ralph/`), `.claude/settings.json`, `CLAUDE.md`, milestone briefs, `docs/TASKS.md`, `docs/DECISIONS.md`, `.env.example`, `.gitignore`, and `PRD.md` (a Markdown transcription of the PRD PDF).
- No application code yet. The first loop task is M1-T01 (scaffold). Defaults for owner questions are in `docs/DECISIONS.md` (Q1–Q15).

### 2026-09-28 · M1-T01 · #2
- Scaffolded the pnpm 12.6 + Turborepo 2.11 monorepo: `apps/{api,web}`, `packages/{shared,db,email,ui,config}` with placeholder sources, one Vitest smoke test each, shared tsconfig bases and Biome config in `packages/config` (D-053). Root scripts: `build`, `typecheck`, `test:unit`, `lint`, `format`.
- Next iteration: use Node 24 (`nvm use`; the machine default may be older) and pnpm via corepack. `apps/web` is a plain `tsc` placeholder under `app/` until M1-T11 swaps in React Router; `apps/api/src/server.ts` is a placeholder until M1-T07. `pnpm check` doesn't exist yet (M1-T02).

### 2026-09-29 · M1-T02 · #3
- Added `.github/workflows/ci.yml` (parallel jobs `lint`, `typecheck`, `unit`, `build`, `gitleaks`, `audit`; shared `.github/actions/setup`), `scripts/gitleaks.sh`, `docs/ci.md` (required-check list), D-054, and root scripts `check`, `secrets:scan`, `audit:deps`.
- Next iteration: M1-T03 is HUMAN (branch protection; required checks are the six job names in `docs/ci.md`). Tasks that add CI steps (db:check, integration, openapi, e2e) must add a job to `ci.yml`, a step to `pnpm check`, and a row in `docs/ci.md`. `pnpm secrets:scan` needs Docker running (or a local gitleaks). The shell's default Node is 22: prepend `~/.nvm/versions/node/v24.19.0/bin` to PATH and use `corepack pnpm`.

### 2026-09-29 · M1-T03 (HUMAN) · #4
- Recorded owner steps for branch protection in `docs/BLOCKERS.md`; no code changed. M1-T03 stays `[ ]` until the owner marks it `[x]`.
- Next iteration: if M1-T03 is still `[ ]`, the loop stops with HUMAN_NEEDED again (don't add a duplicate blocker entry). Once resolved, the next task is M1-T04 (docker-compose).

### 2026-09-29 · M1-T03 (skipped) · owner/merge-gate
- Branch protection isn't enforced on this private free-plan repo, so M1-T03 is `[~]`. Added `scripts/ralph/merge-pr.sh` (D-055): the only way the loop merges; it checks every required job in `docs/ci.md` passed on the PR head, then squash-merges.
- Next iteration: merge with `scripts/ralph/merge-pr.sh <PR>` (`gh pr merge` is denied). Tasks that add a CI job must add its row to the `docs/ci.md` Required checks table, or the gate won't require it. Next task is M1-T04 (docker-compose).

### 2026-09-29 · M1-T04 · PR pending
- Added `docker-compose.yml` (postgres 18, redis 7, mailpit, all with healthchecks), `docker/postgres/init.sql` (pg_trgm, unaccent, citext), `docs/local-dev.md`, and D-056. `.env.example` already matched the ports, so it is unchanged.
- Next iteration: M1-T05 (Drizzle). The Postgres 18 volume mounts at `/var/lib/postgresql`. The first migration must enable the three extensions with `IF NOT EXISTS`. Needs Docker running.

### 2026-09-29 · M1-T05 · PR pending
- `packages/db`: Drizzle + postgres.js client (`createDb`, UTC session), `newId()` (UUIDv7), `uuidv7Pk()`/`timestamps()` helpers, migrator, `0000_extensions` migration, `db:generate|migrate|check` scripts, and `@reprint/db/testing` (`startTestDatabase()` with Testcontainers Postgres 18, `findConventionViolations()`). Root `db:*` and `test:integration` scripts; new CI jobs `db-check` and `integration` (in `docs/ci.md` and `pnpm check`). D-057 records the choices. Added `docs/local-dev.md`, which the M1-T04 PR listed but never committed.
- Next iteration: add tables under `packages/db/src/schema/` (re-export from `schema/index.ts`), then `pnpm db:generate`. Put `*.integration.test.ts` files next to the code; M1-T08 adds Redis to the harness. Node 24 is at `~/.nvm/versions/node/v24.19.0/bin`. `pnpm check` now needs Docker for integration tests and gitleaks.

### 2026-09-29 · M1-T06 · #8
- `packages/shared`: Zod schemas for Problem Details, page and cursor pagination (with `pageOf`/`cursorPageOf` envelopes), UUIDv7 `idSchema`, and permission name constants with `hasPermission`. Added `zod` and `@vitest/coverage-v8`; the 90% line gate is in `packages/shared/vitest.config.ts` and runs in `test:unit`. D-058 records the choices.
- Next iteration: M1-T07 (API skeleton) should build its error helper on `problemDetailsSchema` and its env/query schemas on this package. Rebuild shared (`pnpm build`) before api typechecks against it.

### 2026-09-29 · M1-T07 · PR pending
- `apps/api`: Fastify 5 app (`buildApp(env)` in `src/app.ts`, entry `src/server.ts`), Zod env loader (`src/config/env.ts`), Problem Details error/404 handling (`src/errors.ts`, `src/plugins/error-handler.ts`), Origin check, CORS, helmet defaults, pino with `reqId`, and `GET /v1/health`. Routes are Zod-typed via `fastify-type-provider-zod`; new routes go in `src/modules/<area>/routes.ts` and register in `app.ts`. D-059 records the choices. Added `HOST` to `.env.example`.
- Next iteration: M1-T08 adds Redis to the test harness and `/v1/ready`; add `DATABASE_URL`/`REDIS_URL` to the env schema then. Throw `HttpProblem` from handlers for errors. The API needs `.env` (or `WEB_ORIGINS` set) to start.

### 2026-09-29 · M1-T08 · PR pending
- `apps/api`: `GET /v1/ready` (Postgres + Redis checks in parallel, 2 s timeout, 503 Problem Details when a dependency is down), `startTestStack()` integration harness (Postgres 18 + Redis 7 Testcontainers, `reset()` for isolation), `test:integration` script and config, `ioredis` and `@reprint/db` dependencies. `truncateAllTables()` added to `@reprint/db/testing`. `DATABASE_URL` and `REDIS_URL` are now required env vars. D-060 records the choices. The `integration` CI job and `pnpm check` step already existed from M1-T05, so no CI change.
- Next iteration: M1-T09 adds the queue check by appending to `readinessChecks` in `server.ts`. Use `startTestStack()` for new API integration tests, and `.env` needs `DATABASE_URL` and `REDIS_URL` to run the API locally (both are in `.env.example`).

### 2026-09-29 · M1-T09 · PR pending
- `apps/api`: BullMQ worker (`src/worker.ts` → `dist/worker.js`, graceful SIGTERM), typed job registry (`src/jobs/registry.ts`, with `system.heartbeat` scheduled every 60 s), `createJobQueue()` (typed `enqueue`, `syncSchedules`), `/v1/ready` now reports `queue`, and root `pnpm dev` runs API and worker together. `src/jobs/README.md` explains how to add a job. D-061 records the choices.
- Next iteration: add jobs by editing `registry.ts` only. Integration tests that stop Redis must not close BullMQ clients afterwards (close hangs); keep those cases in their own file. `test:integration` now builds the package first because the worker test spawns `dist/worker.js`. `pnpm audit` reports 1 moderate finding (below the `high` gate).


### 2026-09-29 · M1-T10 · PR pending
- `apps/api`: OpenAPI 3.1 from the Zod route schemas (`src/plugins/openapi.ts`), `/v1/docs` served only outside production (404 Problem Details in production), `src/scripts/openapi.ts` writing `apps/api/openapi.json` during `pnpm build`, and `pnpm openapi:check` (Turbo task; a step in the CI `build` job and in `pnpm check`). Biome ignores the generated file. D-062 records the choices.
- Next iteration: after adding or changing any route or schema, run `pnpm build` and commit the updated `apps/api/openapi.json`, or CI fails. Error responses (Problem Details) are not yet declared per route in the spec; add a shared `problemDetailsSchema` response when the first real routes land (M2).

### 2026-09-29 · M1-T11 · PR pending
- `apps/web`: React Router 8 SSR skeleton (root layout + error boundary, home route with the `Button`, `app/copy/`, server API client `app/lib/api.server.ts` forwarding `cookie` and `x-request-id`). `packages/ui`: `Button` and `cn`. Root `pnpm dev` now runs shared/ui builds, then api, worker, and web. D-063 records the choices.
- Next iteration: M1-T12 builds the theme tokens, app shell, and copy guard on top of `app.css` and `app/copy/`. Web unit tests need `@reprint/ui` built (Turbo handles it via `^build`). Loaders should call `apiClientFor(request)`.

### 2026-09-29 · M1-T12 · PR pending
- `docs/DESIGN.md` (grid, breakpoints, type and spacing scales, colour tokens with contrast table, component inventory, page templates). `packages/ui/src/theme.css` holds the tokens (imported by `apps/web/app/app.css`), and `Button` uses them. `AppShell`/`SiteHeader`/`SiteFooter` in `apps/web/app/components/shell/` wrap the root `Layout`; copy is in `copy.shell`. Tests: token contrast, shell component test, inline-string guard. D-064 records the choices.
- Next iteration: pages must not render their own `<main>` (the shell owns it). Header search and account slots are empty until M3-T16 and M2-T10. Footer legal links 404 until M8. Layout is not verified in a real browser until the Playwright harness (M1-T13).

### 2026-09-29 · M1-T13 · PR pending
- `e2e/` workspace package: Playwright config with `chromium`, `webkit`, and `mobile` (Pixel 7) projects; `webServer` starts the built API and web app on `www.reprint.localhost:5173` / `api.reprint.localhost:3000` (works in all three, so no `localhost` fallback); `expectNoA11yViolations(page)` in `e2e/support/a11y.ts` (fails on serious/critical, checked against a bad page); `specs/smoke.spec.ts` for `/`. Root `pnpm test:e2e`, new required CI job `e2e` (in `docs/ci.md`), D-065.
- Next iteration: `pnpm build` and `docker compose up -d --wait` must run before `pnpm test:e2e`. New specs go in `e2e/specs/` and call `expectNoA11yViolations`. `e2e` is not in `pnpm check`. If a spec needs new API env vars, add them to `stackEnv` in `e2e/playwright.config.ts`.

### 2026-09-29 · M1-T14 · PR pending
- API: helmet with HSTS preload, strict referrer policy, and `default-src 'none'` CSP (integration test on `/v1/ready` and a 404). Web: `app/entry.server.tsx` sets a per-request nonce CSP and baseline headers (`app/lib/csp.server.ts`); `apps/web/netlify.toml` sets the baseline headers for everything Netlify serves. New e2e test checks the CSP and that the client router hydrates with no CSP violations. D-066 records the choices.
- Next iteration: any new inline `<script>` or `<style>` in the web app needs the nonce (or must move to a file). Third-party origins (Sentry in M1-T15) must be added to `connect-src` in `csp.server.ts`. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`) or pnpm fails to start.
