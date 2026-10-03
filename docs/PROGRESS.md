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

### 2026-09-29 · M1-T15 · PR pending
- Sentry (`@sentry/node` in API and worker, `@sentry/react-router` in the web server and browser via new `entry.client.tsx`) starts only when `SENTRY_DSN` / `VITE_SENTRY_DSN` is set. The web app now has a pino logger and a root route `middleware` that stamps `x-request-id` before loaders, logs one line per request (`service: web`), and echoes the ID; the API client forwards it and the API logs it as `reqId`. Redaction paths are `LOG_REDACT_PATHS` in `packages/shared`, used by API, worker, and web. D-067 records the choices.
- Next iteration: Sentry `--import` instrumentation, source map upload, and release markers belong in M1-T18. Use `logger` from `app/lib/logger.server.ts` in web server code. Verified by hand that a built web server echoes and logs a supplied `x-request-id`.

### 2026-09-29 · M1-T16 · PR pending
- `packages/db/src/seed/`: seeded PRNG with deterministic UUIDv7 IDs (`random.id()`), ordered `seedModules` registry (empty until M2-T21), `runSeed` (one transaction) and `resetDatabase` (drop schemas, migrate, seed), and a production/non-local-host guard. Root `pnpm db:seed` and `pnpm db:reset`; `src/seed/README.md` explains how to add a module. Integration test resets twice with a sample module and compares rows and IDs. D-068 records the choices.
- Next iteration: no real tables exist yet, so `db:reset` seeds nothing; M2-T21 adds the first module. Modules must use `random.*` and never `newId()`/`Date.now()`.

### 2026-09-29 · M1-T17 · PR pending
- `renovate.json` (weekly, majors disabled, non-major grouped, Drizzle minors split out, Actions majors allowed) validated with `renovate-config-validator`; `docs/dependencies.md` states the policy; D-069 records the choices.
- Next iteration: M1-T23 (HUMAN) installs the Renovate app. Renovate PRs must pass `merge-pr.sh` like any other. If lint/format covers `renovate.json`, keep it Biome-clean.

### 2026-09-29 · M1-T19/M1-T21/M1-T23 (deferred) · owner/defer-deploy
- Owner deferred staging, preview environments, and Renovate (all `[~]`, D-070). M1-T20 and M1-T22 stay `[ ]` and are ineligible until M1-T19 is un-skipped; that is expected, not a blocker.
- Next iteration: when building M1-T18, keep `render.yaml` and the deploy workflow as specified, and also support running the worker in the API process behind an env flag (for free-tier staging, D-070). Don't create blocker entries for the deferred tasks.

### 2026-09-29 · M1-T18 · PR pending
- `render.yaml` (API ×2 with pre-deploy migrate, worker, Key Value, Virginia), `apps/web/netlify.toml` build config plus the Netlify adapter (enabled only when `NETLIFY` is set), `.github/workflows/deploy-staging.yml` (migrate, deploy API/worker/web, smoke; skips with a notice without secrets), `docs/deploy.md` (every secret and variable, rollback), and the `WORKER_IN_PROCESS` flag for free-tier staging. D-071 records the choices.
- Next iteration: the deploy workflow and `render.yaml` were validated by unit tests and review only; nothing has run against real Render or Netlify (staging is deferred, D-070). Sentry source map upload and release markers are still not wired (M8). Render's pre-deploy command needs a paid plan.


### 2026-09-29 · M1-T24 · PR pending
- M1 verification from a fresh clone (`/tmp` clone of `main`): `pnpm install --frozen-lockfile`, `docker compose up -d --wait`, `pnpm db:reset`, `pnpm check` (exit 0; audit reports 1 moderate, below the high threshold), and `pnpm test:e2e` (6 passed in chromium, webkit, mobile) all pass. `pnpm dev` served `/v1/health` 200, `/v1/ready` 200, SSR HTML on :5173, and a foreign-Origin POST got 403. Only gap: the CLAUDE.md command table listed `seed:admin`, which M2-T21 creates; the table now says so. All other listed commands exist in `package.json`.
- Deferred (D-070): M1-T20 and M1-T22 (staging auto-deploy and preview e2e) stay `[ ]` until M1-T19/M1-T21 are un-skipped; the staging deploy workflow itself is validated by tests only.
- Next iteration: M2-T01 is next. M1 is complete apart from the deferred deploy items.

### 2026-09-29 · M2-T01 · PR #23
- Accounts schema in `packages/db/src/schema/accounts.ts` (`users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `sessions`, `auth_tokens`, `notifications`; migration `0001_accounts.sql`) and a data migration `0002_seed_roles.sql` with the PRD §4 grants. `packages/shared` gained `ROLES`, `ROLE_PERMISSIONS`, `MODERATOR_PERMISSIONS`, `USER_STATUSES`, and `AUTH_TOKEN_PURPOSES`. Integration test compares seeded grants to the shared constants. D-072 records the choices.
- Next iteration: `truncateAllTables` now skips the seeded role tables. `users.avatar_id` is added by M2-T16. `library_public` defaults to true (flagged in D-072). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-29 · M2-T02 · PR pending
- `apps/api/src/modules/auth/`: `tokens.ts` (256-bit token, SHA-256), `session-cookie.ts` (`rp_session` attributes), `session-plugin.ts` (`request.auth`, sliding renewal per D-027, `app.sessions.start/end`), and `guards.ts` (`requireAuth`, `requireVerified`, `requirePermission`). `buildApp` takes `database` and registers `@fastify/cookie`; env gains `SESSION_TTL_DAYS`, `COOKIE_DOMAIN`, `COOKIE_SECURE`. `createTestUser` in `src/testing/users.ts` makes users for integration tests. D-073 records the choices.
- Next iteration: routes use `preHandler: [requireVerified]` or `requirePermission(PERMISSIONS.x)`; login/register call `app.sessions.start(request, reply, userId)`. Guarded routes must be registered on the app that received `database`. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).


### 2026-09-29 · M2-T03 · PR pending
- `apps/api/src/modules/rate-limit/`: `policies.ts` (PRD §11 table by name), `limiter.ts` (Redis fixed window, Lua), `plugin.ts` (`app.rateLimits.consume`, global anonymous-read and authenticated-write limits, `rateLimit(policy, subjectOf?)` preHandler). `buildApp` takes `redis` (passed by `server.ts`). `HttpProblem` gained `headers` (used for `Retry-After`). D-074 records the choices.
- Next iteration: routes use `preHandler: [rateLimit('loginIp'), rateLimit('loginAccount', (r) => r.body.email)]`; login should count only when it makes sense per M2-T08 (11th attempt blocked). Tests that build the app for rate-limited routes must pass `redis`. Global limits apply to all routes, so a test making over 300 anonymous GETs from one IP needs `remoteAddress` variation. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-29 · M2-T04 · PR pending
- `packages/email`: `BaseLayout`, the `verify-email` template, the `emailTemplates` registry, and `renderEmail` (HTML and text, snapshot-tested). API: `email/mailer.ts` (SMTP via nodemailer or Resend, chosen by `EMAIL_TRANSPORT`, validated in `config/env.ts` for both API and worker), the `email.send` job with retries, and `testing/mailer.ts` (`recordingMailer`). An integration test runs a worker against a Mailpit container and reads the message back. D-075 records the choices.
- Next iteration: to send an email, enqueue `email.send` (see `jobs/README.md`); add a template by registering it in `packages/email/src/templates.ts` and adding a case to `emailSendPayload` in `jobs/registry.ts`. `JobContext` now has `mailer`, so `startWorker` needs one. Rebuild `@reprint/email` (`pnpm build`) after changing it before typechecking the API. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-29 · M2-T05 · PR pending
- `POST /v1/auth/register` in `apps/api/src/modules/auth/register.ts`, with `password.ts` (Argon2id), `breached-password.ts` (HIBP range API, fails open), shared `auth.ts` schemas, an `email-already-registered` template and job case, and env `HIBP_MODE` (default `live`) and `WEB_URL`. `buildApp` takes `jobs` (the queue's `enqueue`); the route is registered without db/jobs only for OpenAPI generation. D-076 records the choices.
- Next iteration: the account exists but is unverified and signed in; the verify link is `<WEB_URL>/verify-email?token=<raw token>` and the token row is `auth_tokens` with purpose `verify_email` (M2-T07 consumes it). Login (M2-T08) can use `verifyPassword`. Tests that build the app with `database` should also pass `jobs` for the auth routes. Rebuild `@reprint/shared` and `@reprint/email` before typechecking the API. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-29 · M2-T06 · PR pending
- `PUBLIC_SIGNUPS` (default closed) and `SIGNUP_INVITE_CODES` in the API env; register takes optional `inviteCode` and returns 403 without a listed code while closed. `GET /v1/auth/session` now exists and returns `{ signupsOpen }` (shared `sessionResponseSchema`). D-077 records the choices.
- Next iteration: M2-T07 should extend the same `/auth/session` route (in `modules/auth/register.ts`, or move it to its own file) with `viewer` and keep `signupsOpen`. Tests that register must set `PUBLIC_SIGNUPS: 'true'` or pass a code. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-29 · M2-T07 · PR pending
- `modules/auth/verification.ts`: `POST /v1/auth/verify-email` (atomic single-use token, 24 h) and `POST /v1/auth/resend-verification` (3/hour per email, identical reply, newest link wins). `GET /v1/auth/session` now returns `{ signupsOpen, viewer }` with the shared `viewerSchema`. D-078 records the choices.
- Next iteration: M2-T08 login can call `app.sessions.start`; the web banner (M2-T11) calls resend with an empty body when signed in. The viewer has no email field by design. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-29 · M2-T08 · PR pending
- `modules/auth/login.ts`: `POST /v1/auth/login` (per-IP and per-account limits, decoy hash for unknown emails, generic 401, suspended message per D-047, deleted accounts generic), `/logout` and `/logout-all`. Shared `loginRequestSchema`, `loginResponseSchema`, `logoutResponseSchema`. D-079 records the choices.
- Next iteration: M2-T09 reset must end all sessions with `delete from sessions where user_id`, as `/logout-all` does. The web login form (M2-T10) posts `{ email, password }` and shows the 401/403/429 Problem Details `title`. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-29 · M2-T09 · PR pending
- `modules/auth/password-reset.ts`: `POST /v1/auth/forgot-password` and `/reset-password` (shared `forgotPassword*` and `resetPassword*` schemas), plus `password-reset` and `password-changed` email templates and job cases. D-080 records the choices.
- Next iteration: the reset link is `<WEB_URL>/reset-password?token=<raw token>` and the changed email links to `<WEB_URL>/forgot-password`; the web pages (M2-T10 and later) must exist at those paths. Reset does not sign the Member in. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-29 · M2-T10 · PR pending
- Web `/login`, `/register`, `/logout` routes (`apps/web/app/routes/`), `components/auth/` (`AuthForm` on React Hook Form + shared Zod schemas, `LoginPage`, `RegisterPage`), `components/shell/account-menu.tsx` in the header, `lib/auth.server.ts` (session loader, Problem Details to form errors, cookie pass-through). The root loader reads `/v1/auth/session`. `packages/ui` gained `Input` and `Label`. The API client forwards `Origin` and `x-forwarded-for`. Added `react-hook-form`, `@hookform/resolvers`, `zod` to `apps/web` (all in the PRD §8 stack). D-081 records the choices.
- Next iteration: M2-T11 needs `/verify-email`, `/forgot-password`, `/reset-password` routes (email links already point there) and the unverified banner; reuse `AuthForm` and `postToApi`/`failed`/`forwardCookies`. Rebuild `@reprint/ui` (`pnpm build`) before typechecking the web app. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).
- Verified by a throwaway Playwright run (not committed; chromium): register with the UI, account menu, log out, wrong-password alert, then log in all work through SSR and the cookie pass-through. Notes for M2-T12: the e2e stack env needs `PUBLIC_SIGNUPS=true` and `HIBP_MODE=off` (or an invite code), registration is limited to 5 per hour per IP so specs across three projects need distinct `x-forwarded-for` values or a Redis flush, and `pnpm db:migrate` must have run. `ready.integration.test.ts` ("Redis stopped") failed once under parallel `pnpm check` and passed on rerun; it looks timing-sensitive.


### 2026-09-29 · M2-T11 · PR pending
- Web routes `/verify-email`, `/resend-verification` (resource route), `/forgot-password`, `/reset-password` with page components in `components/auth/`, and `components/shell/verification-banner.tsx` rendered by the root layout through the new `AppShell` `bannerSlot`. Component tests in `recovery-pages.test.tsx`. D-082 records the choices.
- Next iteration: M2-T12 e2e can follow the emailed links straight to `/verify-email?token=` and `/reset-password?token=`; the banner has the "Resend link" button; reset success links to `/login`. Rebuild `@reprint/ui` before typechecking web. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-29 · M2-T12 · PR pending
- `e2e/specs/auth.spec.ts` (register, banner, verify through the Mailpit link, log out, log in) and `e2e/specs/password-reset.spec.ts` (forgot, emailed link, new password, old password rejected), both with axe checks, passing in chromium, webkit, and mobile. Helpers in `e2e/support/` (`mailpit.ts`, `identity.ts`). The e2e stack env gained open signups, HIBP off, trusted proxy, an in-process worker, and SMTP. D-083 records the choices.
- Next iteration: e2e specs should call `useOwnClientIp(page)` and `newIdentity()` to avoid rate limits and collisions. The account menu is a `<details>` whose summary has `aria-label="Account menu"` (use `getByLabel`, and beware `getByLabel('Email')` also matches the banner region while signed in). After registering, the Member lands on `/` already signed in (D-083 item 4). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-29 · M2-T13 · PR pending
- `modules/me/routes.ts`: `GET/PATCH /v1/me` and `POST /v1/me/password` (shared `me.ts` schemas: `meSchema`, `updateMeRequestSchema`, `changePasswordRequestSchema`). Password change keeps the current session, ends the others, and queues the "password changed" email. New `passwordChange` rate limit. D-084 records the choices.
- Next iteration: M2-T14 (`POST /v1/me/email`) can add its route to `modules/me/` and reuse `verifyPassword` and the `AuthRoutesOptions` shape; the `email-changed` notification emails need new templates. The "password changed" template copy now says other devices were signed out. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-29 · M2-T14 · PR pending
- `POST /v1/me/email` and `POST /v1/me/email/confirm` in `modules/me/routes.ts` (shared `changeEmail*` and `confirmEmailChange*` schemas), three templates (`email-change-confirm`, `email-change-requested`, `email-changed`) with job cases, an `emailChange` rate limit, and `emailSendPayload` is now exported from `jobs/registry.ts` for tests. Integration tests in `modules/me/email-change.integration.test.ts` include a Mailpit container. D-085 records the choices.
- Next iteration: M2-T18 should also write security notifications on email change (call `notify` in the confirm transaction). M2-T20 must add the web route `/confirm-email-change?token=` (the emailed link points there; it should POST the token to `/v1/me/email/confirm`) and the pending state on `/settings/security`. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).


### 2026-09-29 · M2-T15 · PR pending
- `modules/me/sessions.ts`: `GET /v1/me/sessions`, `GET /v1/me/sessions/:id`, `DELETE /v1/me/sessions/:id` (shared `sessionInfoSchema`, `sessionListResponseSchema`, `sessionParamsSchema`, `endSessionResponseSchema`). Device names come from `ua-parser-js` (added to `apps/api`, approved in D-022). D-086 records the choices.
- Next iteration: M2-T20's active devices list reads `{ items }` and calls DELETE per `id`; ending the current session clears the cookie, so the web should treat it like logout. "Log out everywhere" already exists as `POST /v1/auth/logout-all`. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-29 · M2-T16 · PR pending
- `apps/api/src/storage/` (`ImageStorage`, local-disk and R2 drivers, `createImageStorage(env)`), `modules/me/avatar.ts` + `avatar-image.ts` (`POST /v1/me/avatar`, sharp pipeline), `modules/uploads/routes.ts` (`GET /v1/uploads/*` for the local driver). New `covers` table and `users.avatar_id` (migration `0003_covers`); `GET /v1/me` now returns `avatarUrl`. Added `sharp`, `@fastify/multipart`, `@aws-sdk/client-s3` to `apps/api` (all approved by the PRD §8 stack or D-022). D-087 records the choices.
- Next iteration: M2-T17 `accounts.erase` cascades `users` → sessions etc., but avatar files and `covers` rows are not cascaded from `users`; delete them there (the worker env needs the `STORAGE_*` and `R2_*` settings first, see D-087 item 8). M2-T19's settings page reads `avatarUrl` from `/v1/me` and posts multipart field `file` to `/v1/me/avatar`. M3-T02 must reuse the `covers` table (already created). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).


### 2026-09-29 · M2-T17 · PR pending
- `DELETE /v1/me` in `modules/me/routes.ts` (shared `deleteAccount*` schemas and `ACCOUNT_ERASE_AFTER_DAYS`), the `account-deletion-scheduled` email template, and the daily `accounts.erase` job (`modules/accounts/erase.ts`, payload takes an optional `now` clock override). `JobContext` gained `db` and `storage`, so `startWorker` takes them and the worker env schema gained the storage settings. D-088 records the choices, including what a deleted account looks like for 30 days.
- Next iteration: M2-T18 `notify` is independent. M2-T20's delete form sends `DELETE /v1/me` with a JSON body `{ password }`; a success clears the cookie, so treat it like logout. M4 must filter deleted users' reviews from lists and update aggregates on deletion (M4-T02 already owns this), and every later table with a `users` FK must cascade so `accounts.erase` stays one delete. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-29 · M2-T18 · PR pending
- `modules/notifications/`: `notify(tx, userId, type, data)`, `GET /v1/me/notifications`, and `POST /v1/me/notifications/read` (shared `notifications.ts` schemas and `NOTIFICATION_TYPES`). Password change, password reset, and confirmed email change now write `password_changed` / `email_changed` notifications in their transactions. Web: `NotificationBell` in the header (root loader loads the newest 10), `/notifications/read` resource route, copy under `copy.shell.notifications`. D-089 records the choices.
- Next iteration: M4-T07 should call `notify(tx, authorId, 'review_approved' | 'review_rejected' | 'review_unpublished', { bookSlug, ... })` in the decision transaction; the bell already has message copy for those types. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-29 · M2-T19 · PR pending
- Web `/settings` layout (sign-in required, `noindex`), `/settings/profile` (display name, bio with a 280-char counter, library privacy and review-decision email toggles) and the `/settings/avatar` resource route (multipart forward, local preview). Components in `components/settings/`, copy under `copy.settings`, `lib/me.server.ts` (`loadMe`), and `sendToApi` in `lib/auth.server.ts`. `packages/ui` gained `Textarea` and `Checkbox`. D-090 records the choices.
- Next iteration: M2-T20 adds its tab to `tabs` in `components/settings/settings-layout.tsx` and a `settings/security` child route under `settings` in `routes.ts`; reuse `loadMe`, `sendToApi`, and the `/settings` layout guard. It also owns the web route `/confirm-email-change?token=` (D-085). jsdom + vitest cannot build a `Request` from `FormData` containing a file (any Blob), so component tests that upload files record the submit and replay it without the file (see `settings-pages.test.tsx`). To run the stack by hand without a `.env`: `set -a; . ./.env.example; set +a; PUBLIC_SIGNUPS=true HIBP_MODE=off pnpm dev`; the session cookie is scoped to the cookie domain, so pass the `rp_session` value as a `cookie` header with curl. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-29 · M2-T20 · PR pending
- Web `/settings/security` (change email with pending state, change password, active devices with end-session and "Log out everywhere", delete account with the 30-day erase notice) and `/confirm-email-change?token=`. One route action takes an `intent` per form. Components in `components/settings/` (`security-forms.tsx`, `sessions-section.tsx`, `text-field.tsx`), copy under `copy.settings.security`. `sendToApi` now supports `DELETE` and a `null` body. D-091 records the choices.
- Next iteration: M2-T22 e2e could cover the security page and the email-change link (Mailpit). The pending email state is not restored after reload (no API read for it). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).


### 2026-09-29 · M2-T21 · PR pending
- `pnpm --filter api seed:admin` (`scripts/seed-admin.ts` + `modules/accounts/seed-admin.ts`, `createFirstAdmin`) and the `users` seed module (50 accounts: Admins, Moderators, Members, unverified, suspended, deleted) registered in `packages/db/src/seed/registry.ts`. Dev credentials are in `docs/local-dev.md`; `CLAUDE.md` command table updated. D-092 records the choices.
- Next iteration: M2-T22 verifies M2 end to end (route enumeration test for allowed/denied coverage is still to write). Later seed modules (M3 Books, M4 reviews) append to `seedModules` and can look users up by username (`member1`, `moderator1`, ...). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-29 · M2-T22 · PR pending
- M2 verification. Added `apps/api/src/route-coverage.test.ts`: it renders the OpenAPI spec, fails if any served route lacks an entry in its allowed/denied table (or an entry names a route that is gone), and checks that every named `it(...)` title exists in its integration test file. `pnpm check` (lint, typecheck, db:check, unit, integration, build, openapi drift, audit) passes locally. Each M2 acceptance criterion is mapped to its proving test in the PR body.
- Local `pnpm test:e2e` could not be run cleanly: a `pnpm dev` stack that is not the loop's was already listening on :5173/:3000 and Playwright reuses it (`reuseExistingServer`), so chromium auth specs failed against that stack's settings. The clean-stack proof is the CI `e2e` job on this PR.
- Next iteration: M3-T01 is next (catalog domain schemas in `packages/shared`). New endpoints must add a row to `COVERAGE` in `route-coverage.test.ts`. To run e2e locally, stop any running `pnpm dev` first. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-30 · M3-T01 · PR pending
- `packages/shared`: `catalog.ts` (Book, Edition, Author, Contribution, Series membership, Genre, Subject, Cover, Format, Language, Source link, Book candidate schemas), `isbn.ts` (`toIsbn13`, `isValidIsbn10`, `isValidIsbn13`), `slug.ts` (`makeSlug`), with unit tests; shared coverage is 100%. `COVER_ORIGINS` already lived in `permissions.ts` and is reused. D-093 records the choices, notably that the slug suffix is the last 6 hex of the UUIDv7.
- Next iteration: M3-T02 (catalog tables) reuses the existing `covers` table and can import the enums (`CONTRIBUTION_ROLES`, `FORMATS`, `GENRE_ORIGINS`) for column enums. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-30 · M3-T02 · PR pending
- `packages/db/src/schema/catalog.ts` (`books`, `editions`, `authors`, `contributions`, `source_links`, `source_records`), migration `0004_catalog_core`, and `catalog.integration.test.ts` (constraints, zeroed aggregates, GIN/trigram indexes, cascade). `tsvector` helper added to `helpers.ts`. D-094 records the choices, including an extra `books.refreshed_at`.
- Next iteration: M3-T03 adds series, genres, subjects, rules, and merge candidates, and the Genre data migration; `book_id` FKs on later community tables should be `RESTRICT` (D-094). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-30 · M3-T03 · PR pending
- `packages/db/src/schema/catalog.ts` gained `series`, `book_series`, `genres`, `book_genres`, `subjects`, `book_subjects`, `subject_genre_rules`, and `merge_candidates` (migration `0005_catalog_taxonomy`); `0006_seed_genres` loads the D-015 Genres (42) and starter rules (98). `genres` and `subject_genre_rules` are now in `MIGRATION_SEEDED_TABLES`. D-095 records the choices, including that D-015's table marks 13 featured Genres although its text says 12.
- Next iteration: M3-T04 is independent of this. M3-T09 should match rules by case-insensitive substring, highest `priority` first. If `pnpm` fails with "Failed to switch pnpm to v12.6.0", run `node ~/Library/pnpm/.tools/pnpm/12.6.0/node_modules/pnpm/bin/pnpm.mjs` with `npm_config_manage_package_manager_versions=false`. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-30 · M3-T04 · PR pending
- `apps/api/src/catalog/sources/`: `types.ts` (interface, storage policy, trusted-field priorities, `SourceError`), `index.ts` (`createSourceAdapter` for `SOURCE_MODE`), `stub/stub-adapter.ts`, and `open-library/record-fixtures.ts` (`pnpm --filter api fixtures:record`, which recorded three search fixtures into `__fixtures__/`). `runSourceContract` is in `src/testing/source-contract.ts`. `packages/shared` gained `authorRecordSchema`, `bookSearchPageSchema`, and an optional Source link on candidate contributions. `SOURCE_*` env vars are validated. D-096 records the choices.
- Next iteration: M3-T05 writes the Open Library adapter, registers it in `createSourceAdapter`'s `fixtures` and `live` slots, adds a no-cover search to `FIXTURE_REQUESTS`, and adds the vocabulary grep script to `pnpm check`. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`). Don't end a shell command with a stray `cat`; it waits on stdin.


### 2026-09-30 · M3-T05 · PR pending
- `sources/open-library/`: `adapter.ts` (`createOpenLibraryAdapter`, `searchBooks`), `search.ts` (translation, confidence), `languages.ts` (MARC to ISO 639), `fixture-fetch.ts`, and `index.ts` (`openLibraryImplementations` for `createSourceAdapter`'s `fixtures` and `live` slots). Added `search-no-cover` and `search-empty` fixtures and re-recorded `search-author` as `q=`. `pnpm vocabulary:check` is in `pnpm check` and the CI `lint` job. D-097 records the choices.
- Next iteration: M3-T06 replaces the `getBook`/`getEditions`/`getAuthor` stubs, adds work/edition/author fixtures to `FIXTURE_REQUESTS`, and fills `bookIds`/`authorIds` in the contract call in `adapter.test.ts`. Nothing calls `createSourceAdapter` yet; the gateway (M3-T07) will wrap the live `fetch`. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-30 · M3-T06 · PR pending
- `sources/open-library/record.ts` (work, Edition, Series, Subject, and Author translation) and real `getBook`/`getEditions`/`getAuthor` in `adapter.ts`. Four new fixtures recorded for *The Left Hand of Darkness* (work, byline search, Editions, Author Le Guin) in `record-fixtures.ts`; the adapter contract now runs with `bookIds`/`authorIds`. D-098 records the choices, including that `getBook` costs three Source requests and only the first 50 Editions are read.
- Next iteration: M3-T07 (gateway) should count `getBook` as three calls when sizing limits. Wrap the live `fetch` in `openLibraryImplementations`. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).


### 2026-09-30 · M3-T07 · PR pending
- `apps/api/src/catalog/gateway/`: `rate-limiter.ts` (Redis slot limiter with interactive-over-background priority), `circuit-breaker.ts`, `metrics.ts` (per-second request counters, cache hit/miss), and `gateway.ts` (`createSourceGateway`, whose `fetch` adds the User-Agent, limit, breaker, and timeout). `openLibraryImplementations` now takes the gateway's `fetch` instead of building its own. D-099 records the choices.
- Next iteration: nothing constructs the gateway yet. M3-T09 should build it once in the app/worker wiring from `SOURCE_*` env vars and call `metrics.recordCache`; background refreshes wrap calls in `gateway.run({ priority: 'background' }, ...)`. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-30 · M3-T08 · PR pending
- `apps/api/src/catalog/ingest/`: `ingestBook` (one transaction: Source link then ISBN-13 matching, advisory lock against concurrent duplicates, Books, Editions, Authors, Contributions, Series, Subjects, covers, Source links, `source_records`, search vector), `fields.ts` (`planFieldUpdate`, field origins and locking), unit and integration tests. Title-and-author look-alikes get a `merge_candidates` row; non-`store` Sources are refused. D-100 records the choices.
- Next iteration: M3-T09 adds Primary Edition choice, Subject-to-Genre mapping (case-insensitive substring, highest priority first), and per-field Source priority on top of `ingestBook` (currently any unlocked field is overwritten by a non-empty value). Nothing constructs the gateway or calls `ingestBook` outside tests yet. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-30 · M3-T09 · PR pending
- `apps/api/src/catalog/enrichment/`: `primary-edition.ts` (ranking), `genres.ts` (Subject to Genre rule matching), `priorities.ts` (per-field Source priority lookup), `enrich.ts` (`enrichBook`, called inside `ingestBook`). `planFieldUpdate` gained an optional `priorityOf`, and `ingestBook` an optional `otherSources`. Unit tests plus new integration cases in `ingest.integration.test.ts`. D-101 records the choices.
- Next iteration: M3-T10 (`GET /v1/books/:slug` etc.). The refresh job should call `ingestBook` with the same `source` and `otherSources` used for the first ingest. Nothing constructs the gateway or calls `ingestBook` outside tests yet. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).


### 2026-09-30 · M3-T10 · PR pending
- `packages/shared/src/catalog-api.ts` (Book detail, Editions, Author detail schemas); `apps/api/src/modules/catalog/` (routes plus `read.ts` queries, with 304/ETag caching in the plugin's `onSend`); `catalog/refresh.ts` (`refreshBook`, `purgeSourceRecords`, `isStale`) and jobs `catalog.refresh` and `catalog.purgeSourceRecords`; `catalog/runtime.ts` builds the Source adapter behind the gateway for the worker (and the in-process worker). `enqueue` takes `{ jobId, priority }`. `JobContext` and `startWorker` gained `catalog`. D-102 records the choices.
- Next iteration: M3-T11 (`POST /v1/books/resolve`) can reuse `createCatalogRuntime` (build it in `server.ts` for the API too, passing `gateway.run` for interactive calls) and `ingestBook`. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-30 · M3-T11 · PR pending
- `apps/api/src/catalog/candidate-refs.ts` (`createCandidateRefs`: `issue`, `load`, 24 h in Redis), `catalog/resolve.ts` (`resolveCandidate`), and `modules/catalog/resolve.ts` (`POST /v1/books/resolve`, `bookResolve` rate limit). `buildApp` gained `catalog: { source, interactive }` and `createCatalogRuntime` an `interactive` helper; `server.ts` now builds the runtime once for the API and the in-process worker. `packages/shared` gained `candidateRefSchema` and the resolve schemas. D-103 records the choices.
- Next iteration: M3-T12 (Catalog search) is independent. M3-T13 should call `createCandidateRefs(redis).issue(candidate)` for each candidate that doesn't match a stored Book, and pass `SOURCE_SEARCH_TIMEOUT_MS` through `gateway.run` for search. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-30 · M3-T12 · PR pending
- `apps/api/src/catalog/search/catalog-search.ts` (`searchCatalogBooks`, `searchCatalogAuthors`, `toTsQueryText`), `GET /v1/search/suggest` in the catalog plugin, `loadBookSummaries`/`loadAuthorSuggestions` in `modules/catalog/read.ts`, and shared `search-api.ts` (suggest query/response, `SEARCH_MIN_LENGTH`). Integration tests cover typos, accents, ISBN-10/13, Series and Author names, and zero Source calls. D-104 records the choices.
- Next iteration: M3-T13 (`GET /v1/search`) calls `searchCatalogBooks` (it returns `{ id, score }`; hydrate with `loadBookSummaries`) in parallel with the Source search, and applies the review-count boost and ISBN-first ordering itself. `BookSummary` has no `firstPublishedYear` yet; M3-T13/T15 need it for the card, so add it to the summary schema then. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).


### 2026-09-30 · M3-T13 · PR pending
- `apps/api/src/catalog/search/federated-search.ts` (`federatedSearch`: Catalog and Source in parallel, 24 h Redis cache, 1.5 s timeout with Catalog-only fallback, stored-Book matching by Source link or ISBN-13, review-count boost, candidate refs) and `GET /v1/search` in the catalog plugin, which now takes `catalog` and `redis` options. `packages/shared/src/search-api.ts` gained the query and response schemas; `BookSummary` gained `firstPublishedYear`. `createCatalogRuntime` exposes `recordCache`. D-105 records the choices.
- Next iteration: M3-T14 adds filters, sorts, `type=authors`, and `isbnMatch` to this endpoint (`searchQuerySchema` and `federatedSearch` are the places). Filters that limit to the Catalog (genre, language, minRating) should skip the Source call. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-30 · M3-T14 · PR pending
- `packages/shared/src/search-api.ts`: `searchQuerySchema` gained `type`, `genre`, `language`, `decade`, `minRating`, `sort`; the response gained `isbnMatch` and an `author` item kind. `catalog-search.ts` applies filters and sort in SQL; `federated-search.ts` skips the Source for Catalog-only filters, filters candidates by decade, sorts the merged list, serves `type=authors`, and sets `isbnMatch`. New `search-filters.integration.test.ts`. D-106 records the choices.
- Next iteration: M3-T15 (web `Cover`, `BookCard`) is independent of the API. M3-T17 reads `isbnMatch` and redirects. `apps/api/openapi.json` was regenerated. The `/v1/ready` "Redis stopped" integration test failed once under full-suite load and passed alone and on rerun. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-30 · M3-T15 · PR pending
- `apps/web/app/components/books/`: `Cover` (generated fallback on missing or failed image), `RatingDisplay`, `BookCard` (takes `BookCardData` plus `href`), with component tests; `lib/cover-url.ts`; `copy.books`. `docs/DESIGN.md` inventory updated. D-107 records the choices.
- Next iteration: M3-T16 (header search box) is next; M3-T17 maps `BookSummary` (`contributions` to `authorNames`, `rating`) and search candidates (`rating: null`) onto `BookCardData`. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-30 · M3-T16 · PR pending
- `apps/web/app/components/shell/search-box.tsx` (`SearchBox`, hand-built ARIA combobox, 250 ms debounce, 2-character minimum, wired into `root.tsx`'s `searchSlot`), resource route `routes/search-suggest.tsx` (`/search/suggest`, forwards to `/v1/search/suggest`), `copy.shell.search`. Component tests use fake timers; loader test covers the API-down case. D-108 records the choices.
- Next iteration: M3-T17 (`/search` results page) reads `q` from the URL; the box's form already submits `GET /search?q=`. Suggestion links point at `/books/:slug` and `/authors/:slug`, which arrive in M3-T18 and M3-T20. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-30 · M3-T17 · PR pending
- `apps/web/app/routes/search.tsx` (loader, ISBN redirect, failure state), `components/search/search-results-page.tsx` (tabs, GET filter form, sort, pagination, cards), `lib/search-links.ts` (`parseSearchParams`, `searchHref`, `resolveHref`), `copy.search`, and tests. D-109 records the choices. Added task M5-T05a for the Genre select (no Genre list API before M5-T03).
- Next iteration: M3-T18 (book page). Search cards link stored Books to `/books/:slug` and unstored ones to `/resolve?ref=`; M3-T19 must serve that path. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-30 · M3-T18 · PR pending
- `apps/web/app/routes/book.tsx` (loader, meta with canonical and Open Graph), `components/books/book-page.tsx` (`BookPage`), `lib/contributors.ts` (byline grouping), `copy.books.page`, and tests. D-110 records the choices. The route is registered in `routes.ts`.
- Next iteration: M3-T19 (`/resolve?ref=`). The book page has no rating chart, reviews, or shelf controls yet (M4, M6); schema.org JSON-LD is deferred to M4. Series and Genre links target M5 routes. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).


### 2026-09-30 · M3-T19 · PR pending
- `apps/web/app/routes/resolve.tsx` (loader that calls resolve and redirects), `components/books/resolve-page.tsx` (failure and not-found states, retry form), `copy.resolve`, route registered in `routes.ts`, and tests. D-111 records the choices.
- Next iteration: M3-T20 (Author page `/authors/:slug`); book-page and suggestion links already point there. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-30 · M3-T20 · PR pending
- `apps/web/app/routes/author.tsx` (loader, meta with canonical and Open Graph), `components/books/author-page.tsx` (`AuthorPage`, `groupWorks`, `lifeDates`), `copy.author`, route registered in `routes.ts`, and tests. D-112 records the choices.
- Next iteration: M3-T21 (local seed of about 500 Books) is next; M3-T22 e2e can rely on `/authors/:slug` now existing. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-30 · CI runner (owner) · owner/self-hosted-ci
- GitHub-hosted Actions minutes ran out, so CI now runs on a self-hosted runner on the owner's Mac (D-113, `docs/ci-runner.md`). The e2e job uses an isolated Compose project (`reprint-ci`) on shifted ports.
- Next iteration: finish PR #66 (M3-T21): merge `main` into its branch so it picks up the new workflow, mark it ready (`gh pr ready`), wait for checks, and merge with `scripts/ralph/merge-pr.sh`. Jobs run one at a time on one runner, so `gh pr checks --watch` can take 10–20 minutes. Don't hard-code new host ports in CI; use env vars as the e2e job does.

### 2026-09-30 · M3-T21 · PR pending
- `apps/api/src/catalog/seed-catalog.ts` (`seedCatalog`), `sources/seed/` (generator and `seed` Source), `sources/open-library/seed-fixtures.ts` (recorded Book), `scripts/seed-catalog.ts` (`pnpm --filter api seed:catalog`). Root `db:seed` and `db:reset` now run it after the database seed; `@reprint/db` exports `assertSeedAllowed`, `createSeedRandom`, and `SEED`. Integration test covers 500 Books, all 42 Genres, 3 merge candidates, the book-detail response schema, and a second run adding nothing. D-114 records the choices.
- Next iteration: M3-T22 (e2e search to book page) can rely on the seed for Catalog Books; the "not yet on RePrint" flow still needs the stub Source (`SOURCE_MODE=stub` offers Dune and The Hobbit). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).


### 2026-09-30 · M3-T22 · PR pending
- `e2e/specs/search.spec.ts`: search from the header box, open a not-yet-stored result through `/resolve` to the new Book page, re-search to confirm the result now links to `/books/:slug`, and the ISBN path landing on the Book page. Axe runs on every page in all three projects. Steps are state-agnostic because the projects share one database and run in parallel.
- Next iteration: M3-T23 (M3 verification). M1-T20 and M1-T22 stay unbuilt while M1-T19/T21 are skipped. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-30 · M3-T23 · PR pending
- M3 verification: no code changes. `pnpm check` (including the vocabulary guard, openapi drift, gitleaks, audit), `pnpm db:reset` (500 Books, 3 merge candidates), and `pnpm test:e2e` (18 passed across chromium, webkit, mobile) all pass. Each M3 acceptance criterion maps to an existing test (listed in the PR body); no gaps found.
- Next iteration: M4-T01 (Reviews schema and shared review rules). M1-T20 and M1-T22 stay unbuilt while M1-T19/T21 are skipped. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-30 · M4-T01 · PR pending
- `packages/db/src/schema/reviews.ts` (`reviews`, `review_versions`, `review_claims`) and migration `0007_reviews.sql`; `packages/shared/src/reviews.ts` (`reviewInputSchema`, `REVIEW_STATUSES`, `nextReviewStatus`, `canTransitionReview`) with unit tests; `reviews.integration.test.ts` covers the constraints, cascades, and RESTRICT. D-115 records the choices.
- Next iteration: M4-T02 (ratings and aggregates). It owes the aggregate update on account deletion (D-088). `accounts.erase` already cascades to reviews, so M4-T02 must adjust the Book aggregates there too. After changing `packages/shared`, run `pnpm --filter @reprint/shared build` before `@reprint/db` integration tests (they read `dist`). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-30 · M4-T02 · PR pending
- `packages/shared/src/ratings.ts` (`weightedRating`, `siteMeanRating`, `averageRating`, `ratingDistribution`, `WEIGHTED_RATING_C`) with unit tests; `apps/api/src/modules/reviews/aggregates.ts` (`applyReviewChange`, `removeMemberFromAggregates`, `recomputeRatings`), the daily `ratings.recompute` job, and the aggregate update in `DELETE /v1/me`. Integration tests cover transitions, rollback, corrupted aggregates, the job, deletion, and erase. D-116 records the choices.
- Next iteration: M4-T03 (audit log). M4-T04 and M4-T07 must call `applyReviewChange(tx, bookId, before, after)` inside the transaction that changes a review (never update the `books` aggregates by hand). M4-T05 changes the Book response average from two decimals (D-102) to one. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-30 · M4-T03 · PR pending
- `packages/db/src/schema/audit.ts` (`audit_log`) and migration `0008_audit_log.sql` (with the `audit_log_guard` append-only trigger); `packages/shared/src/audit.ts` (`AUDIT_ACTIONS`, `AUDIT_TARGET_TYPES`); `apps/api/src/modules/audit/audit.ts` (`recordAudit(tx, entry)`) with integration tests (insert, rollback with the caller's transaction, UPDATE and DELETE refused, IP clearing after 90 days, actor erase). `docs/deploy.md` has the restricted app-role SQL. D-117 records the choices.
- Next iteration: M4-T04 (my review API). M4-T07 must call `recordAudit(tx, …)` with `request.ip` for approve and reject, in the same transaction as `applyReviewChange`. The trigger allows only clearing `ip` (rows over 90 days) and `actor_id`, which M7's `privacy.clearOldIps` needs. One full `pnpm test:integration` run during this task showed a single unidentified failure that did not recur in two reruns; watch for flakiness. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-09-30 · M4-T04 · PR pending
- `apps/api/src/modules/reviews/routes.ts` (`reviewRoutes`: `GET/PUT/DELETE /v1/books/:slug/my-review`), registered in `app.ts`; `myReviewSchema` and `deleteMyReviewResponseSchema` in `packages/shared/src/reviews.ts`; integration tests in `my-review.integration.test.ts` (create, edit with versions, Approved→Pending drops totals, Rejected→Pending, Edition check, 401/403/404/429, delete). D-118 records the choices.
- Next iteration: M4-T05 (`GET /v1/books/:slug/reviews` and the one-decimal rating summary). Moderator decisions (M4-T07) must set `review_versions.status`, `decided_by`, `decision_reason`, and `decided_at` on the latest version, which is what `GET my-review` reads for `rejectionReason`. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-10-01 · CI back to GitHub-hosted (owner) · owner/github-hosted-ci
- CI jobs run on `ubuntu-latest` again (D-119); the repo is going public for the rest of the build, so minutes are free. The self-hosted runner is being removed.
- Next iteration: CI takes about 4 minutes again. Open PRs created before this change still target the self-hosted runner; if one is stuck "Queued", merge `main` into its branch (don't rebase) so it picks up this workflow.

### 2026-10-01 · M4-T05 · PR pending
- `GET /v1/books/:slug/reviews` in `apps/api/src/modules/reviews/routes.ts` (Approved only, four sorts, star filter, 10 per page, cached like other public GETs through the new `catalog/public-cache.ts`); `bookReviewsQuerySchema`, `publicReviewSchema`, and `bookReviewsResponseSchema` in `packages/shared/src/reviews.ts`; the Book response average is now one decimal. Integration tests in `book-reviews.integration.test.ts`; the route is in `route-coverage.test.ts`. D-120 records the choices.
- Next iteration: M4-T06 (moderation queue API). One full `pnpm check` run showed `ready.integration.test.ts` ("503 when Redis is stopped") fail once with 200, then pass alone and on rerun; it looks flaky (the M4-T03 note saw something similar). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-10-01 · M4-T06 · PR pending
- `apps/api/src/modules/moderation/routes.ts` (`GET /v1/mod/reviews` with cursor paging, `POST /v1/mod/reviews/:id/claim`, `GET /v1/mod/stats`), registered in `app.ts`; queue, claim, and stats schemas in `packages/shared/src/reviews.ts`; integration tests in `moderation/queue.integration.test.ts`; the three routes are in `route-coverage.test.ts`. D-121 records the choices.
- Next iteration: M4-T07 (approve and reject). It must check the claim (409 if another Moderator holds an unexpired one), refuse the moderator's own review (403), set `decided_by`/`decision_reason`/`decided_at` on the latest version, call `applyReviewChange` and `recordAudit` in the same transaction, and delete the claim. M7-T01 must fill `reportedCount` in the queue. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-10-01 · M4-T07 · PR pending
- `POST /v1/mod/reviews/:id/approve|reject` in `apps/api/src/modules/moderation/routes.ts` (one transaction: version decision, review status, `applyReviewChange`, claim removal, notification, audit); `reviewDecisionRequestSchema`/`reviewDecisionResponseSchema` in `packages/shared`; new `review-decision` email template wired into `email.send`; integration tests in `moderation/decisions.integration.test.ts` and a Mailpit delivery test in `email/email.integration.test.ts`. D-122 records the choices.
- Next iteration: M4-T08 (web star rating and spoiler toggle components). Decision requests must send a JSON body (`{}` if no reason). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-10-01 · M4-T08 · PR pending
- `apps/web/app/components/reviews/star-rating-input.tsx` and `spoiler-toggle.tsx`, copy under `copy.reviews`, component tests (keyboard, aria, axe) in `reviews-components.test.tsx`. `axe-core` added to `apps/web` devDependencies. D-123 records the choices.
- Next iteration: M4-T09 (review form and "my review" panel). `StarRatingInput` takes `value`/`onChange` (works with React Hook Form `Controller`), plus `labelledBy`, `describedBy`, `invalid`. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-10-01 · M4-T09 · PR pending
- `MyReviewSection` and `ReviewForm` in `apps/web/app/components/reviews/` (React Hook Form + `reviewInputSchema`, counters, Edition select, server errors, status badge, rejection reason, inline delete confirmation, verify and login prompts); the Book route loader now returns `viewer` and `myReview`, and its `action` saves or deletes through the API. Component tests in `my-review-section.test.tsx`, loader and action tests in `book.test.ts`. D-124 records the choices.
- Next iteration: M4-T10 (rating summary chart and approved reviews list). The Book page has no reviews list yet; it should load `GET /v1/books/:slug/reviews` in the loader using URL params (`sort`, `rating`, `page`). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).


### 2026-10-01 · M4-T10 · PR pending
- `RatingSummary` and `ReviewsList` in `apps/web/app/components/reviews/` (5-bar distribution as filter links with a text alternative; sort/filter form; paragraphs, spoiler toggle, Previous/Next paging at 10); `lib/review-links.ts` builds the URLs; the Book loader reads `sort`/`rating`/`page` and loads the reviews. Component tests (with axe) in `reviews-list.test.tsx`, loader tests in `book.test.ts`. D-125 records the choices.
- Next iteration: M4-T11 (admin shell and moderation queue). M5-T02 adds the helpful button to `ReviewItem` in `reviews-list.tsx`. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-10-01 · M4-T11 · PR pending
- Admin shell (`routes/admin.tsx`, `components/admin/admin-layout.tsx`, `lib/admin.server.ts` `requireViewerPermission`) and the review queue page (`routes/admin-reviews.tsx`, `components/admin/review-queue.tsx`): queue list, `?review=<id>` opens and claims, reviewer history, full text. Loader tests in `admin.test.ts` and `admin-reviews.test.ts`, component tests (with axe) in `review-queue.test.tsx`. D-126 records the choices.
- Next iteration: M4-T12 (actions, reason picker, side-by-side diff, shortcuts) builds on `ReviewDetail` in `review-queue.tsx`; decisions must POST JSON (`{}` if no reason) to `/v1/mod/reviews/:id/approve|reject`. Pages under `/admin` must call `requireViewerPermission` in their own loader. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-10-01 · M4-T12 · PR pending
- `DecisionPanel` and `VersionComparison` in `apps/web/app/components/admin/review-decision.tsx`, wired into `ReviewDetail`; `A`/`R` shortcuts live in the panel and `J`/`K` in `ReviewQueue`; the `/admin/reviews` route now has an `action` that POSTs approve and reject (JSON) to the API. Copy under `copy.admin.reviews`. Component tests in `review-queue.test.tsx` (with axe), action tests in `admin-reviews.test.ts`. D-127 records the choices.
- Next iteration: M4-T13 (`/admin` dashboard; `/admin` still redirects to the review queue). M4-T15 e2e can click Approve/Reject by role name ("Approve", "Reject", then "Reject review"). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-10-01 · M4-T13 · PR pending
- `/admin` is now the moderation dashboard (`routes/admin-index.tsx`, `components/admin/moderation-dashboard.tsx`): pending count and oldest age from `/v1/mod/stats`, a placeholder open-reports card for M7, and a "Dashboard" nav link. Loader tests in `admin-index.test.ts` (Moderator allowed, Member and Visitor denied, API failure), component tests (with axe) in `moderation-dashboard.test.tsx`. D-128 records the choices.
- Next iteration: M4-T14 (seed reviews in every status). M7 fills the reports card. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-10-01 · M4-T14 · PR pending
- `seedReviews` in `apps/api/src/modules/reviews/seed-reviews.ts` with `pnpm --filter api seed:reviews`, chained after `seed:catalog` in `db:seed` and `db:reset` (146 reviews, 194 versions). `resetDatabase` is now exported from `@reprint/db`. Integration test `seed-reviews.integration.test.ts` checks every status, multi-version reviews, and zero `recomputeRatings` mismatches. D-129 records the choices.
- Next iteration: M4-T15 (e2e for reviews and moderation). Seeded accounts: `member1`, `moderator1` (password in `docs/local-dev.md`); many Pending reviews exist already, so e2e specs should create their own Book review with a fresh Member. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-10-01 · M4-T15 · PR pending
- `e2e/specs/reviews.spec.ts` (register, verify, write with keyboard star input, edit, delete, axe at each step) and `e2e/specs/moderation.spec.ts` (two Members review Dune; a new Moderator approves one and rejects the other with a saved phrase; both authors see the status, the reason, and the notification). Helpers in `e2e/support/accounts.ts`. D-130 records the choices.
- Next iteration: M4-T16 (M4 verification). The specs pass in all three projects against a seeded database; the queue is global, so they move their own reviews to its front. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-10-01 · M4-T16 · PR pending
- M4 verification only; no code gaps found. `pnpm check` passed, `pnpm db:reset` then `pnpm test:e2e` passed (24 specs across chromium, webkit, mobile, axe included), and `recomputeRatings` against the e2e-used database reported 502 Books checked, 0 mismatches. Each criterion maps to a test (listed in the PR body).
- Next iteration: M5-T01 is next in order unless an earlier `[ ]` task becomes eligible (M1-T20 waits on HUMAN M1-T19). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-10-01 · M5-T01 · PR pending
- `helpful_votes` table (migration 0009), `POST/DELETE /v1/reviews/:id/helpful` in `modules/reviews/routes.ts`, `helpfulVoteResponseSchema` in `packages/shared`, and the `accounts.erase` fix that lowers `helpful_count` before the votes cascade. Integration tests in `reviews/helpful.integration.test.ts` and `accounts/deletion.integration.test.ts`; route-coverage table extended. D-131 records the choices.
- Next iteration: M5-T02 (web helpful button). The response is `{ helpful, helpfulCount }`; the book-reviews list does not yet say whether the viewer voted, so M5-T02 needs a viewer-vote field on `GET /v1/books/:slug/reviews` (it is a public cached route, so consider a separate authenticated lookup). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-10-01 · M5-T02 · PR pending
- `HelpfulVote` (`components/reviews/helpful-vote.tsx`) with an optimistic TanStack Query mutation and rollback; web resource route `routes/review-helpful.tsx`; `QueryClientProvider` in the root `App`; `@tanstack/react-query` added to `apps/web`. New API `GET /v1/books/:slug/helpful-votes` feeds the viewer's votes into the Book loader. Tests in `helpful-vote.test.tsx`, `review-helpful.test.ts`, `book.test.ts`, and `helpful.integration.test.ts`. D-132 records the choices.
- Next iteration: M5-T03 (Genres API). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-10-01 · M5-T03 · PR pending
- `GET /v1/genres` (tree) and `GET /v1/genres/:slug` (Books in the Genre and all Genres below it; `sort=top_rated|most_reviewed|newest_review`, `page`) in `modules/catalog/genres.ts` and `routes.ts`; schemas in `packages/shared/src/genres-api.ts`. Integration tests in `genres.integration.test.ts` (they delete their own `zz-%` Genres because `reset` keeps Genre reference data). D-133 records the choices.
- Next iteration: M5-T04 (Series API). The weighted-rating SQL in `genres.ts` can be reused by M5-T06's Top rated row. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`); after changing `packages/shared`, run `pnpm --filter @reprint/shared build` before API tests.


### 2026-10-01 · M5-T04 · PR pending
- `GET /v1/series/:slug` in `modules/catalog/series.ts` and `routes.ts`; schema in `packages/shared/src/series-api.ts`; `openapi.json` regenerated. Integration tests in `series.integration.test.ts` (reading order with decimal and empty positions, empty Series, 404); route-coverage table extended. D-134 records the choices.
- Next iteration: M5-T05 (web Genres index, Genre page, Series page). The Series response is `{ series, items: [{ position, book }] }` with no paging. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`); after changing `packages/shared`, run `pnpm --filter @reprint/shared build` before API tests.

### 2026-10-01 · M5-T05 · PR pending
- Web pages `/genres` (`routes/genres.tsx`), `/genres/:slug` (`routes/genre.tsx`, sort and page read from the URL, bad values fall back to defaults) and `/series/:slug` (`routes/series.tsx`); components in `components/books/genre-pages.tsx` and `series-page.tsx`; copy under `copy.genres` and `copy.series`. Tests in `genre-series-pages.test.tsx` (with axe) and `routes/genres.test.ts`.
- Next iteration: M5-T05a (Genre select on `/search`); `GenresIndexPage` shows the tree and `GET /v1/genres` is the data source. The Series page does not show the viewer's shelf status yet; M6-T03 adds the shelf selector. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-10-01 · M5-T05a · PR pending
- `/search` Filters now has a Genre select (`#filter-genre`, tree flattened with "– " prefixes for child Genres) filled from `GET /v1/genres`; the search loader fetches the tree in parallel with the search on the Books tab only and falls back to an empty list if it fails. The "Genre: slug / Remove genre filter" line and its copy are gone ("Any" clears the filter). Tests in `search.test.ts` and `search-results-page.test.tsx`.
- Next iteration: M5-T06 (Discover rows). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-10-01 · M5-T06 · PR pending
- `featured_items` table (migration 0010), `GET /v1/discover` (`modules/discover/`: `rows.ts` builders, `cache.ts` Redis rows, `routes.ts`), and the `discover.rebuild` job (every 10 minutes). `JobContext` and `startWorker` now take a `redis` client. Schema in `packages/shared/src/discover-api.ts`. Integration tests in `discover.integration.test.ts`; route-coverage table extended. D-135 records the choices.
- Next iteration: M5-T07 (web Discover home page). A hidden row is `null` in the response; the featured review comes with its Book. Nothing seeds `featured_items` yet (M5-T08), so locally only the three Book rows appear. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`); after changing `packages/shared`, run `pnpm --filter @reprint/shared build` before API tests.


### 2026-10-01 · M5-T07 · PR pending
- Discover home page: `components/books/discover-page.tsx` (`DiscoverPage`), `routes/home.tsx` loader fetching `/v1/discover` (renders with no rows if the API fails), and `copy.home` strings. Tests in `discover-page.test.tsx` (with axe) and `routes/home.test.ts`. D-136 records the choices.
- Next iteration: M5-T08 (seed featured Genres, a featured review, helpful votes). Locally only the three Book rows show until then. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-10-01 · M5-T08 · PR pending
- `seed:discover` (`modules/discover/seed-discover.ts`, `scripts/seed-discover.ts`) added to `db:seed` and `db:reset`: eight Books get six Approved reviews each (recent, so Top rated and "this month" show), Helpful votes, six featured Genres, and a featured review. `seed-reviews.ts` now exports `loadSeedAccounts`, `pick`, `reviewText`, `DAY_MS` for reuse. Integration test in `seed-discover.integration.test.ts`. D-137 records the choices.
- Next iteration: M5-T09 (M5 verification). After `db:reset`, wait for the `discover.rebuild` job or clear the `discover:v1:*` Redis keys to see rows. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).


### 2026-10-01 · M5-T09 · PR pending
- M5 verification. Added `e2e/specs/discover.spec.ts` (Discover home, Genres index → Genre page with a sort, Series page created through the DB; axe on each, all three projects). `pnpm check` and `pnpm test:e2e` pass (33 tests), and the new spec also passes on a `db:reset` seeded database. Criteria 1–6 are covered by the M5-T01..T08 integration and component tests.
- Next iteration: M6-T01 (Shelves). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-10-01 · M6-T01 · PR pending
- `shelf_entries` table (migration 0011), shared `Shelf` schemas (`packages/shared/src/shelves.ts`), and `PUT/DELETE /v1/books/:slug/shelf` in `modules/library/routes.ts`. Integration tests in `shelf.integration.test.ts`; route-coverage table extended. D-138 records the choices.
- Next iteration: M6-T02 (`viewerShelf` on Book, search, Series, Discover responses; those are public cached routes, so mind `Cache-Control: private`). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`); after changing `packages/shared` or `packages/db`, rebuild them (`pnpm --filter @reprint/shared build`, `pnpm --filter @reprint/db build`) before API tests.

### 2026-10-01 · M6-T02 · PR pending
- `viewerShelf` added to the shared Book summary and Book detail schemas and filled by `addViewerShelves` (`modules/library/viewer-shelf.ts`) on `GET /books/:slug`, `/search`, `/series/:slug`, and `/discover`; signed-in responses are `Cache-Control: private`, and the public cache hook now adds `Vary: Cookie`. Integration tests in `viewer-shelf.integration.test.ts`. D-139 records the choices.
- Next iteration: M6-T03 (web `ShelfSelector`). The field is absent for Visitors and `null` for Members with no Shelf; Genre and Author pages do not carry it yet. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`); after changing `packages/shared` or `packages/db`, rebuild them before API tests.

### 2026-10-01 · M6-T03 · PR pending
- `ShelfSelector` and `BookShelfSelector` (`components/books/shelf-selector.tsx`) on the Book page header, search results (including not-yet-stored results, which are resolved first), Discover rows, and the Series page, through `BookCard`'s new `shelf` slot. New resource routes `books/:slug/shelf` (`routes/book-shelf.tsx`) and a `POST /resolve` action. Page tests now wrap renders in a `QueryClientProvider`. Tests in `shelf-selector.test.tsx`, `book-shelf.test.ts`, `resolve.test.ts`. D-140 records the choices.
- Next iteration: M6-T04 (Library API). Genre and Author pages have no shelf control yet. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-10-01 · M6-T04 · PR pending
- `GET /v1/users/:username/library` in `modules/library/routes.ts`; shared schemas in `packages/shared/src/library-api.ts` (`libraryQuerySchema`, `libraryResponseSchema`, `usernameParamsSchema`); `openapi.json` regenerated. Integration tests in `library.integration.test.ts` (counts, shelf filter, four sorts, paging, private library 404 for others and 200 for the owner, unknown and deleted users); route-coverage table extended. D-141 records the choices.
- Next iteration: M6-T05 (web library page). `counts` always covers every Shelf, `meta.total` follows the `shelf` filter, and a private Library is a plain 404 to others (the web page should show its "private" state from that 404 only when the viewer cannot otherwise tell; D-141). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`); after changing `packages/shared` or `packages/db`, rebuild them before API tests.

### 2026-10-01 · M6-T05 · PR pending
- Web Library page: `routes/library.tsx` (loader, `noindex`), `components/library/library-page.tsx` (`LibraryPage`, `PrivateLibrary`), `lib/library-links.ts`, and `copy.library`. Tests in `routes/library.test.ts` and `library-page.test.tsx` (with axe). D-142 records the choices.
- Next iteration: M6-T06 (Profiles API). The profile page (M6-T07) should link to `/u/:username/library` and show the Library tab only for a public Library or the owner. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-10-01 · M6-T06 · PR pending
- `GET /v1/users/:username` and `/v1/users/:username/reviews` in `modules/profiles/routes.ts`; shared schemas in `packages/shared/src/profiles-api.ts`; `openapi.json` regenerated. Integration tests in `profiles.integration.test.ts`; route-coverage table extended. D-143 records the choices.
- Next iteration: M6-T07 (web profile page). The profile carries `libraryPublic` (show the Library tab when true or when the viewer is the owner); a review item has its `book` summary and no `author`. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`); after changing `packages/shared` or `packages/db`, rebuild them before API tests.


### 2026-10-01 · M6-T07 · PR pending
- Web profile page: `routes/profile.tsx` (loader, canonical URL, meta), `components/profile/profile-page.tsx`, `copy.profile`, and the `u/:username` route. Tests in `routes/profile.test.ts` and `profile-page.test.tsx` (with axe). D-144 records the choices.
- Next iteration: M6-T08 (data export). The Library page does not yet link back to the profile. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-10-01 · M6-T08 · PR pending
- `GET /v1/me/export` (`modules/me/export.ts`, schema in `packages/shared/src/export.ts`), the web resource route `routes/settings-export.tsx`, and a "Download your data" section (`export-section.tsx`) on Settings → Security. Integration tests in `export.integration.test.ts`; route-coverage table extended. D-145 records the choices.
- Next iteration: M6-T09 (seed libraries). M7-T01 should add reports to the export. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`); after changing `packages/shared` or `packages/db`, rebuild them before API tests.


### 2026-10-01 · M6-T09 · PR pending
- `seedLibraries` (`modules/library/seed-libraries.ts`), `pnpm --filter api seed:libraries` wired into `db:seed` and `db:reset`. Integration test in `seed-libraries.integration.test.ts`. D-146 records the choices.
- Next iteration: M6-T10 (e2e). Seeded private Libraries belong to the first four reviewers by username; public ones to the next ten. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-10-01 · M6-T10 · PR pending
- `e2e/specs/library.spec.ts` (specs live in `e2e/specs/`): shelves Dune from the Book page and from search results, changes the Shelf from the library, checks tab counts, profile → Library link, and that a private Library is hidden from another signed-in Member (and its profile has no Library tab) but still open to its owner. axe on each page; passes in chromium, webkit, and mobile.
- Next iteration: M6-T11 (M6 verification). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-10-01 · M6-T11 · PR pending
- M6 verification: `pnpm check` and `pnpm test:e2e` (39 passed across chromium, webkit, mobile) pass on `main`. Each acceptance criterion in `docs/milestones/M6-libraries-and-profiles.md` is mapped to its proving test in the PR body. No gaps found; no code changed.
- Next iteration: M7-T01 (reports; also add reports to the data export). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-10-02 · M7-T01 · PR pending
- `review_reports` and `reviews.hidden_at` (migration `0012`), `POST /v1/reviews/:id/reports` in `modules/reviews/routes.ts`, shared `reviewReportInputSchema` and reason/status enums in `packages/shared/src/reviews.ts`. Auto-hide at 3 open reports; hidden reviews are filtered from the Book review list, profile reviews and totals, Discover, and the Genre `newest_review` sort (not from aggregates, D-046). The export gained `reports`; `accounts.erase` removes reports by cascade (tested). Integration tests in `reports.integration.test.ts`; route-coverage table extended. D-147 records the choices.
- Next iteration: M7-T02 (reports queue API: dismiss must clear `hidden_at` and close the reports; unpublish must also close them). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`); after changing `packages/shared` or `packages/db`, rebuild them before API tests.

### 2026-10-02 · M7-T02 · PR pending
- `GET /v1/mod/reports`, `POST /v1/mod/reports/:reviewId/dismiss` (`moderation/reports.ts`), and `POST /v1/mod/reviews/:id/unpublish` (`moderation/routes.ts`); `/mod/stats` gained the open-report fields and the review queue's `reportedCount` is now real. The review-decision email handles `unpublished`. Shared schemas in `packages/shared/src/reviews.ts`; `openapi.json` regenerated. Integration tests in `moderation/reports.integration.test.ts`; route-coverage table extended. D-148 records the choices.
- Next iteration: M7-T03 (admin users API). M7-T06 should show the new stats on the dashboard (its card still says "Reports are not available yet."). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`); after changing `packages/shared` or `packages/db`, rebuild them before API tests.

### 2026-10-02 · M7-T03 · PR pending
- `GET /v1/admin/users` and `/v1/admin/users/:id` in `modules/admin/users.ts` (new `admin` module); shared schemas in `packages/shared/src/admin-users-api.ts`; `openapi.json` regenerated. Integration tests in `admin/users.integration.test.ts`; route-coverage table extended. D-149 records the choices (limited view is keyed on `audit.view`).
- Next iteration: M7-T04 (role management). Register new admin routes in `app.ts` next to `adminUserRoutes`; the detail response already lists `roles`. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`); after changing `packages/shared` or `packages/db`, rebuild them before API tests.

### 2026-10-02 · M7-T04 · PR pending
- `PUT` and `DELETE /v1/admin/users/:id/roles/:role` in `modules/admin/users.ts`; shared `adminUserRoleParamsSchema` and `adminUserRolesResponseSchema` in `packages/shared/src/admin-users-api.ts`; `openapi.json` regenerated. Integration tests in `admin/users.integration.test.ts`; route-coverage table extended. D-150 records the choices (idempotent, only `moderator` and `admin` can be named, last-Admin check locks the Admin grants).
- Next iteration: M7-T05 (suspensions). Add the routes to `adminUserRoutes` or a sibling registered next to it in `app.ts`; a suspension reason is not stored yet (D-149). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`); after changing `packages/shared` or `packages/db`, rebuild them before API tests.


### 2026-10-02 · M7-T05 · PR pending
- `POST /v1/admin/users/:id/suspend`, `/unsuspend`, `/revoke-sessions`, and `/resend-verification` in `modules/admin/suspensions.ts` (registered next to `adminUserRoutes`); migration `0013` adds `users.suspended_reason`; new `account-suspended` email; `users.lift_suspensions` job (every 5 minutes) plus a lazy lift at login. Shared schemas in `packages/shared/src/admin-users-api.ts`; `openapi.json` regenerated. Integration tests in `admin/suspensions.integration.test.ts`; route-coverage table and the worker schedule test extended. D-151 records the choices (resend needs `users.view`).
- Next iteration: M7-T06 (web report dialog and reports queue). The dashboard card still says "Reports are not available yet." (M7-T06 should show the M7-T02 stats). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`); after changing `packages/shared` or `packages/db`, rebuild them before API tests.

### 2026-10-02 · M7-T06 · PR pending
- Report dialog (`components/reviews/report-review.tsx`, resource route `routes/review-report.tsx`) on the Book page's review list; `/admin/reports` (`routes/admin-reports.tsx`, `components/admin/reports-queue.tsx`) with Dismiss, Unpublish (reason), and Suspend author (Admins); the dashboard card shows the open report count and oldest age. Component and loader/action tests alongside. D-152 records the choices.
- Next iteration: M7-T07 (admin users list and detail). The suspend action here posts to `/v1/admin/users/:id/suspend`; the admin nav is built in `routes/admin.tsx` (add Users for `users.view`). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-10-02 · M7-T07 · PR pending
- `/admin/users` (`routes/admin-users.tsx`, `components/admin/users-list.tsx`) and `/admin/users/:id` (`routes/admin-user.tsx`, `components/admin/user-detail.tsx`) with role, suspend, unsuspend, end sessions, and resend actions; "Users" nav link. Loader/action and component tests alongside (incl. axe). D-153 records the choices.
- Next iteration: M7-T08 (audit log API and `/admin/audit` page; add the nav link for `audit.view` in `routes/admin.tsx`). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-10-02 · M7-T08 · PR pending
- `GET /v1/admin/audit` and `/v1/admin/audit.csv` in `modules/admin/audit.ts` (`audit.view`); shared schemas in `packages/shared/src/admin-audit-api.ts`; `openapi.json` regenerated. Web: `/admin/audit` (`routes/admin-audit.tsx`, `components/admin/audit-log.tsx`), the CSV resource route `routes/admin-audit-csv.ts`, and an "Audit log" nav link. Integration tests in `admin/audit.integration.test.ts`; route-coverage table extended. D-154 records the choices.
- Next iteration: M7-T09 (admin Catalog editing). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`); after changing `packages/shared` or `packages/db`, rebuild them before API tests.


### 2026-10-02 · M7-T09 · PR pending
- `PATCH /v1/admin/books/:id` in `modules/admin/books.ts` (`catalog.manage`, new permission via migration `0014`); shared schemas in `packages/shared/src/admin-catalog-api.ts`; `openapi.json` regenerated. Integration tests in `admin/books.integration.test.ts` (edit, lock, refresh keeps locks, validation, denied); route-coverage table extended. D-155 records the choices.
- Next iteration: M7-T10 (cover upload, Primary Edition choice, refresh). Reuse `loadBook`/the lock names (`title`, `description`, `genres`, `series`, `contributions`, `primaryEdition`, `cover`) from D-155. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`); after changing `packages/shared` or `packages/db`, rebuild them before API tests.

### 2026-10-02 · M7-T10 · PR pending
- `POST /v1/admin/books/:id/cover` and `POST /v1/admin/books/:id/refresh` in `modules/admin/books.ts` (+ `cover-image.ts`); Primary Edition is set by `PATCH` with `primaryEditionId`. The `catalog.refresh` job takes `interactive` and the job context gained `catalog.interactive`. Uploaded covers now get a `url` in Book responses (`configureUploadUrls`). Shared schemas in `packages/shared/src/admin-catalog-api.ts`; `openapi.json` regenerated. Integration tests in `admin/books.integration.test.ts`; route-coverage table extended. D-156 records the choices.
- Next iteration: M7-T11 (merge queue and merge). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`); after changing `packages/shared` or `packages/db`, rebuild them before API tests.

### 2026-10-02 · M7-T11 · PR pending
- `GET /v1/admin/books/merge-candidates`, `POST /v1/admin/books/merge-candidates/:id/dismiss`, and `POST /v1/admin/books/merge` in `modules/admin/merge.ts` (`catalog.manage`); migration `0015` adds `book_slug_redirects`; `findBookBySlug` follows a redirect and the web Book loader 301s old slugs. Shared schemas in `packages/shared/src/admin-catalog-api.ts`; `openapi.json` regenerated. Integration tests in `admin/merge.integration.test.ts`; route-coverage table extended. D-157 records the choices (body is `{ fromBookId, intoBookId }`).
- Next iteration: M7-T12 (Genre and Subject rule management, Catalog stats). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`); after changing `packages/shared` or `packages/db`, rebuild them before API tests.

### 2026-10-02 · M7-T12 · PR pending
- `GET/POST /v1/admin/genres`, `PATCH /v1/admin/genres/:id` (edit, archive, restore), `GET/POST /v1/admin/subject-rules`, `DELETE /v1/admin/subject-rules/:id`, and `GET /v1/admin/catalog/stats` in `modules/admin/genres.ts`; migration `0016` adds `genres.archived_at`; public Genre reads, Discover featured Genres, and Subject mapping skip archived Genres. Shared schemas in `packages/shared/src/admin-catalog-api.ts`; `openapi.json` regenerated. Integration tests in `admin/genres.integration.test.ts`; route-coverage table extended. D-158 records the choices.
- Next iteration: M7-T13 (web admin Catalog book edit page). Genre tests must delete their own Genres (`zz-%` slugs): `stack.reset()` keeps reference data. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`); after changing `packages/shared` or `packages/db`, rebuild them before API tests.


### 2026-10-02 · M7-T13 · PR pending
- `/admin/books/:id` (`routes/admin-book.tsx`, `components/admin/book-editor.tsx`): edit title, description, Genres, Series, Contributions, and Primary Edition (only changed groups are sent), upload a Cover, trigger a refresh, and see locked fields with their origins. Added `GET /v1/admin/books/:id` (with Editions) and `adminBookDetailSchema`; `openapi.json` regenerated; route-coverage table extended. Loader/action and component tests (incl. axe). D-159 records the choices.
- Next iteration: M7-T14 (merge queue, Genre and rule management, Catalog dashboard web pages). Nothing links to `/admin/books/:id` yet; add the entry points with the Catalog nav. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-10-02 · M7-T14 · PR pending
- `/admin/catalog` (stats dashboard), `/admin/catalog/merge` (side-by-side pairs, confirmed Merge in either direction, Dismiss), and `/admin/catalog/genres` (Genre add/edit/archive/restore and Subject rules) with routes `admin-catalog*.tsx` and components `catalog-dashboard`, `merge-queue`, `genre-manager`; the admin nav gains the three links for `catalog.manage`. Merge cards link to `/admin/books/:id`. Loader/action and component tests (incl. axe). D-160 records the choices.
- Next iteration: M7-T15 (featured content, `PUT /v1/admin/featured`). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`); after changing `packages/shared` or `packages/db`, rebuild them before API tests.

### 2026-10-02 · M7-T15 · PR pending
- `GET` and `PUT /v1/admin/featured` in `modules/admin/featured.ts` (`featured.manage`; `featured.genres` for Genres, Admin only); migration `0017` adds both permissions; `loadFeaturedReviews` in `discover/rows.ts` is shared with the Discover row. Shared schemas in `packages/shared/src/admin-featured-api.ts`; `openapi.json` regenerated. Web: `/admin/featured` (`routes/admin-featured.tsx`, `components/admin/featured-manager.tsx`) and a "Featured content" nav link. Integration, loader/action, and component tests (incl. axe). D-161 records the choices.
- Next iteration: M7-T16 (IP retention job). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`); after changing `packages/shared` or `packages/db`, rebuild them before API tests.

### 2026-10-02 · M7-T16 · PR pending
- `privacy.clearOldIps` daily job (`jobs/registry.ts`) over `clearOldIps` in `modules/audit/retention.ts`: nulls `ip` on `sessions` and `audit_log` rows older than 90 days; the existing audit trigger already allowed only that update, so no migration. Integration tests in `audit/retention.integration.test.ts`; the worker schedule list test gained the job. D-162 records the choices. Note: `ready.integration.test.ts` (Redis stopped, 503) was flaky once locally and passed on rerun.
- Next iteration: M7-T17 (E2E: report and unpublish; admin role and suspend). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-10-03 · M7-T17 · PR pending
- `e2e/specs/reports.spec.ts` (Member reports, Moderator unpublishes from `/admin/reports`, author sees the Unpublished status and notification) and `e2e/specs/admin.spec.ts` (axe on every admin page; Admin grants Moderator and suspends a Member, who then cannot log in). Helpers in `e2e/support/accounts.ts` (`grantAdmin`, `moveReportsToQueueFront`, `restoreReviewSubmittedAt`). axe found scrollable table wrappers without keyboard access on mobile; fixed with `ScrollRegion` (`components/admin/scroll-region.tsx`) in the users, audit, and Catalog dashboard tables.
- Next iteration: M7-T18 (M7 verification). Never flip a review's status in the DB from an e2e helper: it skips the Book's cached aggregates (it once drove Dune's `rating_counts` negative and broke search locally). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`); run `pnpm db:migrate` before e2e after pulling new migrations.

### 2026-10-03 · M7-T18 · PR pending
- M7 verification. Added `apps/api/src/staff-route-guards.test.ts`: it reads the `/mod/*` and `/admin/*` route registrations in `modules/moderation` and `modules/admin`, asserts each has a `preHandler` built from `requirePermission`, and checks that set equals the routes in the OpenAPI spec; `route-coverage.test.ts` already requires an allowed and a denied integration test per route. `pnpm check` and `pnpm test:e2e` (45 specs, 3 projects) pass; each M7 acceptance criterion is mapped to its proving test in the PR body.
- Next iteration: M8-T01 (SEO meta). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`). `pnpm audit` reports 1 moderate finding (below the high gate).

### 2026-10-03 · M8-T01 · PR pending
- `pageMeta` (`apps/web/app/lib/seo.ts`) now builds every page route's `meta`: description (site default fallback), canonical link, `noindex` where needed, Open Graph for Book, Author, Genre, Series, profile, and home. The root loader returns `origin`, which the canonical URL uses. `GET /v1/users/:username` gained `verified`, so unverified Members' profiles are `noindex`; `openapi.json` regenerated. `routes/seo.test.ts` walks `routes.ts` and checks each page route. D-163 records the choices.
- Next iteration: M8-T02 (JSON-LD). Reuse `pageMeta`; add a safe `<JsonLd>` component (no `dangerouslySetInnerHTML`). Tests that call `meta` use `metaArgs` from `lib/seo.testing.ts`. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`). `ready.integration.test.ts` flaked once again; it passes on rerun.

### 2026-10-03 · M8-T02 · PR pending
- JSON-LD: `lib/json-ld.ts` (builders) and `components/seo/json-ld.tsx` (`<JsonLd>`, escapes `<` and the line separators, no `dangerouslySetInnerHTML`). Book emits `Book` + `AggregateRating` (when reviewed) + `Review`s + `BreadcrumbList`; Author emits `Person` + `BreadcrumbList`; Genre and Series emit `BreadcrumbList`. Loaders return `jsonLd`. Unit tests for builders and the component; loader tests for Book and Author. D-164 records the choices.
- Next iteration: M8-T03 (sitemaps and `robots.txt`). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-10-03 · M8-T03 · PR pending
- `sitemaps.build` daily job (`jobs/registry.ts`, `modules/sitemaps/build.ts`) stores a chunk list and chunks (≤ 50,000 URLs) in Redis; `GET /v1/sitemaps` and `GET /v1/sitemaps/:number` serve them; the web app renders `/sitemap.xml`, `/sitemaps/N.xml` (`routes/sitemap.ts`) and `/robots.txt` (`routes/robots.ts`, disallows admin and settings). Shared schemas in `packages/shared/src/sitemap-api.ts`; `openapi.json` regenerated. Integration and web tests. D-165 records the choices.
- Next iteration: M8-T04 (legal and static pages). The sitemap is empty until the job first runs (the worker schedules it on start; the route 404s before that). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-10-03 · M8-T04 · PR pending
- Five pages (`routes/about|terms|privacy|community-guidelines|contact.tsx`) over `components/legal/static-page.tsx`, copy in `copy.legal`, each marked `DRAFT – owner review`; the footer already linked them. Privacy covers GDPR and CCPA, 90-day IP retention, JSON export, and cookieless analytics; Community Guidelines list the rejection reasons. Component tests (incl. axe) in `routes/static-pages.test.tsx`. D-166 records the choices.
- Next iteration: M8-T05 (cookieless analytics). The Contact page shows a placeholder address: M8-T14 (HUMAN) must replace it. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-10-03 · M8-T05 · PR pending
- Cookieless analytics: the root loader returns `analytics` from `VITE_ANALYTICS_DOMAIN` / `VITE_ANALYTICS_SCRIPT_URL` (null = off); `<Analytics>` adds the script after hydration; the script origin joins the CSP. `trackEvent` fires `Search Result Click`, `Review Submitted`, and `Shelf Added` (`lib/analytics.ts`). Unit and component tests with a mocked `window.plausible`; `e2e/specs/analytics.spec.ts` checks the script loads under the CSP and no cookies are set (the e2e web server now sets the analytics env). D-167 records the choices.
- Next iteration: M8-T06 (alert signals and monitor job). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`). `moderation.spec.ts` flaked once on webkit in a full e2e run and passed on rerun.

### 2026-10-03 · M8-T06 · PR pending
- `system.monitor` job (every minute; `modules/ops/monitor.ts`) raises `queue_stuck`, `review_queue_stale`, `source_breaker_open`, and `source_usage_high` through `captureAlert` (`observability/sentry.ts`, tag `alert:<signal>`). The gateway now publishes breaker-open to Redis and `SourceMetrics` gained `requestsBetween` and the breaker marks; `JobContext` gained `queue`, `sourceRps`, `alert` (and `startWorker` takes `sourceRps`, `onAlert`). Integration tests in `monitor.integration.test.ts`; `docs/runbooks/alerts.md` maps every PRD §11 alert. D-168 records the choices.
- Next iteration: M8-T07 (admin system dashboard); reuse `SourceMetrics` (`requestsAt`, `cacheCounts`, `breakerOpen`) and the queue counts. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-10-03 · M8-T07 · PR pending
- `GET /v1/admin/system` (`modules/admin/system.ts`, `catalog.manage`) returns Source requests per second, search cache hit rate, breaker state, and queue depth; schema in `packages/shared/src/admin-system-api.ts`; `buildApp` gained a `queue` option (`server.ts` passes it); `openapi.json` regenerated. Web: `/admin/system` (`routes/admin-system.tsx`, `components/admin/system-dashboard.tsx`) revalidates every 30 s; "System" nav link; axe in `e2e/specs/admin.spec.ts`. Integration, loader, and component tests. D-169 records the choices.
- Next iteration: M8-T08 (k6 load tooling). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-10-02 · M8-T08 · PR pending
- `load/k6/mixed-read-heavy.js` (200 rps for 10 min by default; thresholds for errors and the three p95 targets), `pnpm load:smoke` (`scripts/load-smoke.sh`: `k6` binary or `grafana/k6` Docker image; 30 s at 3 rps; passes locally), and `e2e/specs/web-vitals.spec.ts` (LCP, CLS, INP on The Hobbit's Book page, throttled Pixel 7; runs in the `mobile` project only). `docs/performance.md` documents both and has a table for the owner's staging results. D-170 records the choices. A 429 counts as an error, and the PRD's per-IP read limit blocks a full run from one IP: M8-T15 needs `SPREAD_IPS=true` on staging or several generators (see `docs/performance.md`).
- Next iteration: M8-T09 (axe on every page type). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-10-03 · M8-T09 · PR pending
- `e2e/specs/a11y-pages.spec.ts` fills the axe gaps: the five legal pages, Author, Book, settings (profile, security), and the admin Book edit page. With the existing specs every page type now has a check (table in `docs/a11y.md`); axe found nothing new to fix. `docs/a11y.md` also holds the VoiceOver and NVDA script and a results table for the owner (M8-T15).
- Next iteration: M8-T10 (ASVS L2 preparation). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`). `pnpm test:e2e -- <name>` ignores the filter and runs every spec.

### 2026-10-03 · M8-T10 · PR pending
- `docs/security/asvs-l2.md` maps authentication, session, access-control, header, and supply-chain requirements to code and tests; `apps/api/src/security-docs.test.ts` fails if a cited test disappears. New test: API security headers (`app.test.ts`). The rest (cookie flags, Origin check, CSP, HSTS) already had tests; `pnpm audit:deps` and `pnpm secrets:scan` run in `pnpm check`. Gap filed as M8-T17 (no absolute session lifetime); a second gap (old session kept on sign-in) is accepted. D-171 records the choices.
- Next iteration: M8-T11 (backups). Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

### 2026-10-03 · M8-T11 · PR pending
- `scripts/backup.sh`, `scripts/restore.sh` (scratch-only target), and `scripts/restore-drill.sh` (`pnpm backup:drill`, in `pnpm check` and the new required CI job `restore-drill`, added to `docs/ci.md`). `.github/workflows/backup.yml` dumps production nightly to R2 `daily/` and exits with a notice when secrets are absent. `docs/runbooks/restore.md` has setup, restore steps, the drill log table, and `backup-lifecycle.json` (30 days). Secrets are in `docs/deploy.md`. D-172 records the choices.
- Next iteration: M8-T12 (release workflow). M8-T13 (HUMAN) must apply the lifecycle rule and set the backup secrets. Local `pnpm backup:drill` falls back to the Compose container since Homebrew `pg_dump` is older than 18. Local shell needs Node 24 on PATH (`~/.nvm/versions/node/v24.19.0/bin`).

