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
