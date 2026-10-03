# OWASP ASVS 5.0 Level 2: authentication, sessions, access control

Prepared for the pre-launch security review (PRD §11, M8-T15). Each row names the code that meets the requirement and the test that proves it. A test is cited as `` `path` "start of its title" ``; `apps/api/src/security-docs.test.ts` fails when a cited file or title no longer exists. Requirements are grouped by ASVS chapter, not by requirement number; the reviewer maps numbers when signing off.

## Authentication

| Requirement | Code | Proof |
| --- | --- | --- |
| Passwords are 12 to 128 characters, no composition rules | `packages/shared/src/auth.ts` (`PASSWORD_MIN_LENGTH`, `PASSWORD_MAX_LENGTH`) | `apps/api/src/modules/me/routes.integration.test.ts` "rejects a new password that is too short" |
| Passwords are stored with Argon2id at the OWASP baseline | `modules/auth/password.ts` | `apps/api/src/modules/auth/password.test.ts` "uses Argon2id with 19 MiB" |
| Breached passwords are refused (k-anonymity; fails open, D-029) | `modules/auth/breached-password.ts`, used by register, reset, and change | `apps/api/src/modules/auth/breached-password.test.ts` "sends only the first 5 SHA-1 hex characters" · `apps/api/src/modules/auth/register.integration.test.ts` "refuses a breached password" |
| Login does not reveal whether an account exists (same body, similar time) | `modules/auth/login.ts` (decoy hash) | `apps/api/src/modules/auth/login.integration.test.ts` "gives the same 401 body" · "spends similar time" |
| Registration and reset do not reveal existing emails | `modules/auth/register.ts`, `password-reset.ts` | `apps/api/src/modules/auth/register.integration.test.ts` "answers a taken email like a new registration" · `apps/api/src/modules/auth/password-reset.integration.test.ts` "answers identically for known and unknown emails" |
| Online guessing is rate limited per IP and per account | `modules/rate-limit/policies.ts` | `apps/api/src/modules/auth/login.integration.test.ts` "returns 429 with Retry-After on the 6th attempt" · "returns 429 on the 11th attempt from one IP" |
| Recovery and verification tokens are random 256-bit values, stored only as hashes | `modules/auth/tokens.ts` | `apps/api/src/modules/auth/tokens.test.ts` "is the SHA-256 hex digest" |
| Reset tokens are single use, expire after one hour, and the newest wins | `modules/auth/password-reset.ts` | `apps/api/src/modules/auth/password-reset.integration.test.ts` "rejects a reused token" · "rejects an expired token" |
| A password reset ends every session and notifies the Member | `modules/auth/password-reset.ts` | `apps/api/src/modules/auth/password-reset.integration.test.ts` "sets a new Argon2id hash, ends all sessions" |
| A password change needs the current password, ends other sessions, and notifies | `modules/me/routes.ts` (`/me/password`) | `apps/api/src/modules/me/routes.integration.test.ts` "refuses a wrong current password" · "sets a new Argon2id hash, keeps this session" · "returns 429 after 5 attempts" |
| An email change needs the current password and confirmation from the new address; both addresses are told | `modules/me/routes.ts` (`/me/email`) | `apps/api/src/modules/me/email-change.integration.test.ts` "refuses a wrong current password" · "leaves the address alone until the link" · "emails both the old and the new address" |
| Account deletion needs the password and ends every session | `modules/me/routes.ts` (`DELETE /me`) | `apps/api/src/modules/accounts/deletion.integration.test.ts` "refuses a wrong password" · "disables the account, ends every session" |
| Email verification links are single use and expire after 24 hours | `modules/auth/verification.ts` | `apps/api/src/modules/auth/verification.integration.test.ts` "verifies the account once" · "rejects a token older than 24 hours" |
| Suspended and deleted accounts cannot sign in | `modules/auth/login.ts` | `apps/api/src/modules/auth/login.integration.test.ts` "refuses a suspended account" · "refuses a deleted account" |

## Session management

| Requirement | Code | Proof |
| --- | --- | --- |
| Session tokens are random 256-bit values and only their hash is stored | `modules/auth/session-plugin.ts`, `tokens.ts` | `apps/api/src/modules/auth/session.integration.test.ts` "holds a random 256-bit token and stores only its SHA-256 hash" |
| The cookie is `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` outside local | `modules/auth/session-cookie.ts` | `apps/api/src/modules/auth/session.integration.test.ts` "is HttpOnly and SameSite=Lax" · "is Secure and uses Domain" · `apps/api/src/modules/auth/session-cookie.test.ts` "is not Secure locally, and Secure everywhere else" |
| A new token is issued at every sign-in (the server never accepts a client-chosen session ID) | `SessionService.start` | `apps/api/src/modules/auth/login.integration.test.ts` "signs in with the right email and password" |
| Sessions expire after 30 idle days (sliding, renewed at most daily) and expired sessions are refused | `modules/auth/session-plugin.ts` | `apps/api/src/modules/auth/session.integration.test.ts` "rejects an expired session" · "renews a session last seen over a day ago" |
| Logout ends the session server-side and clears the cookie; logout-all ends every session | `modules/auth/login.ts` | `apps/api/src/modules/auth/login.integration.test.ts` "logout ends only the current session" · "logout-all ends every session" |
| Members can list and end their own sessions, never another Member's | `modules/me/sessions.ts` | `apps/api/src/modules/me/sessions.integration.test.ts` "ends another device" · "returns 404 for another Member’s session and does not end it" |
| Suspending an account ends its sessions; a suspended user's session is not honoured | `modules/admin`, `session-plugin.ts` | `apps/api/src/modules/admin/suspensions.integration.test.ts` "suspends, ends every session" |
| Cross-site request forgery: change requests need an allowed `Origin`, and cookies are `SameSite=Lax` | `plugins/origin-check.ts` | `apps/api/src/app.test.ts` "rejects a non-GET request from a foreign Origin" · "rejects a non-GET request with no Origin" |
| CORS allows only the configured web origins | `app.ts` | `apps/api/src/app.test.ts` "answers CORS for an allowed origin with credentials" |
| Session IP and user agent are cleared after 90 days | `modules/audit` retention job (M7-T16) | `apps/api/src/modules/audit/retention.integration.test.ts` "clears IPs older than 90 days and keeps newer ones" |

## Access control

| Requirement | Code | Proof |
| --- | --- | --- |
| Every `/mod/*` and `/admin/*` route has a `requirePermission` preHandler, and the set matches the OpenAPI spec | `modules/moderation`, `modules/admin` | `apps/api/src/staff-route-guards.test.ts` "registers a preHandler built from requirePermission" |
| Every route has an allowed and a denied integration test | all routes | `apps/api/src/route-coverage.test.ts` "every route" |
| Visitors get 401, unverified Members 403, Members without the permission 403 | `modules/auth/guards.ts` | `apps/api/src/modules/auth/session.integration.test.ts` "denies a Visitor with 401" · "denies an unverified Member with 403" · "denies a Member with 403 and a Visitor with 401" |
| Checks use permission names, never role names | `modules/auth/guards.ts` | `apps/api/src/modules/auth/session.integration.test.ts` "checks permissions, not role names" |
| Members reach only their own records (IDs are scoped by the session user) | `modules/me`, `modules/reviews`, `modules/library` | `apps/api/src/modules/me/sessions.integration.test.ts` "returns 404 for another Member’s session" |
| Every elevated action writes an `audit_log` row in the same transaction | `modules/audit` | `apps/api/src/modules/admin/audit.integration.test.ts` "lists entries" |
| Responses go through response schemas, so internal fields cannot leak | `fastify-type-provider-zod` serializer in `app.ts` | `apps/api/src/modules/me/routes.integration.test.ts` "returns the signed-in Member’s own account" |

## Transport and headers

| Requirement | Code | Proof |
| --- | --- | --- |
| API: HSTS with preload, `nosniff`, referrer policy, a CSP that allows nothing | `app.ts` (`@fastify/helmet`) | `apps/api/src/app.test.ts` "sets HSTS with preload, nosniff" · "sets the same headers on error responses" |
| Web: strict CSP with a per-request nonce and no `unsafe-inline` for scripts | `apps/web/app/lib/csp.server.ts`, `entry.server.tsx` | `apps/web/app/lib/csp.server.test.ts` "allows scripts only with the nonce" · "generates a fresh nonce each time" |
| Web: static assets get the same baseline headers from Netlify | `apps/web/netlify.toml` | `apps/web/app/lib/csp.server.test.ts` "sets the same baseline headers as SSR responses" |
| A real SSR response carries the CSP and HSTS, and the browser reports no CSP violation | `entry.server.tsx` | `e2e/specs/smoke.spec.ts` (checks `content-security-policy` and `strict-transport-security`) |
| `dangerouslySetInnerHTML` is banned | `biome.json` | `pnpm lint` |

## Supply chain and secrets

| Check | How | Result at preparation |
| --- | --- | --- |
| Dependency advisories at high or critical fail the build | `pnpm audit:deps` (`pnpm audit --audit-level high`), run in `pnpm check` and CI | clean (one moderate finding is below the gate) |
| No secrets in history | `pnpm secrets:scan` (`scripts/gitleaks.sh`), run in `pnpm check` and CI | clean |

## Gaps

| Gap | Status |
| --- | --- |
| Sessions have no absolute lifetime: a session that is used at least every 30 days never expires (ASVS asks for an absolute maximum at L2) | Filed as M8-T17 |
| Signing in while holding another session's cookie leaves the old session until it expires (no fixation risk, because tokens are server-generated; the old session stays listed under Sessions and the Member can end it) | Accepted for v1 |

## Sign-off

The owner records the pre-launch review here (M8-T15).

| Reviewer | Date | Result | Notes |
| --- | --- | --- | --- |
| | | | |
