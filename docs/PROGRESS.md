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
