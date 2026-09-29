# M2 · Accounts

## Goal

Let people register, verify their email, log in and out, recover their password, manage settings and sessions, and delete their account, all behind the permission model and rate limits the rest of the product relies on. At the end, the `rp_session` cookie, `requirePermission` preHandlers, the email pipeline, and in-app notifications are ready for every later feature.

## PRD sections covered

§3 (milestone 2), §4 (roles, permissions, rules, `seed:admin`), §7.1 (all), §7.8 (avatar upload, bio), §7.12 (notifications and account emails), §8 (sessions, Argon2id, Resend/React Email), §9 (`users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `sessions`, `auth_tokens`, `notifications`), §10 (Auth and Me endpoints), §11 (rate limits, uploads, security), §12 (e2e: register, verify, log in; password reset), §13 (seed users), §14 (private beta default).

## Deliverables

- Accounts schema, plus a data migration that seeds Member, Moderator, and Admin with the PRD §4 permission grants.
- A session plugin (256-bit token, SHA-256 at rest, 30-day sliding expiry) and preHandlers `requireAuth`, `requireVerified`, `requirePermission`.
- Redis rate limit policies for every PRD §11 row.
- `packages/email` templates: verify email, password reset, email change (old and new address), password changed, account deletion scheduled. A mailer (Mailpit via SMTP locally, Resend elsewhere) and the `email.send` job.
- Endpoints: `/auth/register|login|logout|logout-all|verify-email|resend-verification|forgot-password|reset-password`, `GET /auth/session`, `GET/PATCH /me`, `/me/email`, `/me/password`, `/me/avatar`, `/me/sessions[/:id]`, `DELETE /me`, `/me/notifications`, `/me/notifications/read`.
- The `PUBLIC_SIGNUPS` private beta gate with invite codes.
- An image storage abstraction (local disk / R2) and the avatar pipeline (content sniffing, 5 MB, WebP 256 px, no EXIF).
- The `accounts.erase` daily job (hard delete 30 days after deletion).
- Web: register, login, verify, forgot/reset password, unverified banner, account menu, notification bell, settings (profile and security).
- `seed:admin` and 50 seeded users.
- E2E specs: `auth.spec.ts` and `password-reset.spec.ts`.

## Acceptance criteria

1. A visitor can register with a 3–30 char username and a password of 12+ chars; a breached password is refused; they're signed in, unverified, and a verification email arrives in Mailpit.
2. Following the link verifies the account once; a reused or older-than-24-hour link fails; "Resend" works and is limited to 3 per hour per email.
3. Login failures show one generic message whether or not the email exists; the 11th attempt per IP (or 6th per account) in 15 minutes returns 429.
4. Forgot-password returns the same response for any email; the 1-hour link resets the password and ends all sessions.
5. Settings: change email (old and new addresses notified; takes effect only after verifying), change password (ends other sessions), edit display name and bio (≤ 280), upload an avatar (WebP 256, EXIF stripped), set library privacy and email preferences, list and end sessions, log out everywhere.
6. Deleting an account needs the password, disables it at once, and the erase job removes it after 30 days.
7. `requirePermission` denies a Member on a Moderator-only test route and allows a Moderator; the permission check never looks at role names.
8. `pnpm --filter api seed:admin` creates the first Admin exactly once.
9. `e2e/auth.spec.ts` and `e2e/password-reset.spec.ts` pass in all Playwright projects with axe checks.
10. Every M2 endpoint has an allowed and a denied integration test.

## Implementation choices (recorded in `docs/DECISIONS.md`)

- Registration signs the user in immediately (unverified), consistent with "unverified accounts can browse and shelve".
- Sliding session renewal: `expires_at` is pushed to now + 30 days at most once per day per session, to limit writes.
- Local email goes over SMTP to Mailpit (nodemailer); staging and production use the Resend SDK.
- HIBP check fails open (logs a warning) if the range API is unreachable; `HIBP_MODE=off` in tests.
- Avatars are stored as `covers` rows with origin `upload` (the table already models uploaded images with `r2_key`).
- `GET /me/sessions` (list) is added alongside the PRD's `GET/DELETE /me/sessions/:id`.
- Notification preferences are columns on `users` (`email_review_decisions boolean default true`).

## Out of scope

- Reviews, votes, reports, and libraries (later milestones extend the erase job and export).
- Admin user management, suspensions UI, and audit log UI (M7). The suspended-login refusal is in scope here.
- Third-party login and MFA (out of v1).

## Human prerequisites

- None for local work. Staging email needs the Resend sandbox from M1-T19.
