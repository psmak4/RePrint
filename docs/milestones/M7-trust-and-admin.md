# M7 · Trust and admin

## Goal

Complete the trust loop and the staff tools: Members report bad reviews, Moderators dismiss or unpublish them, and Admins manage users, roles, suspensions, the Catalog, featured content, and an append-only, exportable audit log. Every elevated action is permission-checked in a preHandler and audited.

## PRD sections covered

§3 (milestone 7), §4 (all rules: last Admin, suspended users, limited `users.view`, audit), §5.2 and §5.4 (admin locks, merge queue, Genre mapping management), §6 (admin refresh, Catalog growth), §7.9 (all), §7.10 (reports queue, unpublish, suspend author, dashboard counts), §7.11 (all), §7.12 (account suspended email, unpublish notification), §9 (`review_reports`, `merge_candidates`, `audit_log`, `featured_items`), §10 (Moderation report endpoints and Admin endpoints), §11 (report rate limit, 90-day IP retention), §12 (e2e: report and unpublish; admin assigns a role and suspends a user).

## Deliverables

- `review_reports`, `POST /reviews/:id/reports`, and auto-hide at 3 open reports.
- `GET /mod/reports`, `POST /mod/reports/:reviewId/dismiss`, `POST /mod/reviews/:id/unpublish`; `/mod/stats` gains report counts.
- `GET /admin/users[/:id]`, role assign and remove, suspend, unsuspend, revoke sessions, resend verification.
- `GET /admin/audit`, `/admin/audit.csv`.
- `PATCH /admin/books/:id`, cover upload, Primary Edition, `POST /admin/books/:id/refresh`, merge candidates and `POST /admin/books/merge`, Genre and Subject-rule management, Catalog growth stats.
- `PUT /admin/featured`.
- A 90-day IP clearing job.
- Web: report dialog, `/admin/reports`, `/admin/users[/:id]`, `/admin/audit`, `/admin/books/:id`, `/admin/catalog` (dashboard, merge, genres), `/admin/featured`.
- E2E: `reports.spec.ts` and `admin.spec.ts`.

## Acceptance criteria

1. A verified Member can report someone else's Approved review once, with one of five reasons ("other" needs a note ≤ 500); 20 reports per day is the cap.
2. At 3 open reports the review disappears from public lists until a Moderator dismisses (restores it) or unpublishes it (author notified, can edit and resubmit).
3. Only Admins see "Suspend author" in the reports queue.
4. Admins can search and filter users (role, status including unverified and deleted, join date) and see the full detail; Moderators get the limited view; Members get 403.
5. Admins can grant or remove roles but cannot remove their own Admin role when they are the last Admin.
6. Suspending (reason, optional end date) ends sessions immediately, blocks login, sends the email, keeps the user's Approved reviews visible, and lifts automatically at the end date.
7. Admin Catalog edits lock the edited fields, and a refresh never overwrites them. A merge moves reviews and shelves and fails if one Member reviewed both Books.
8. Every elevated action appears in `/admin/audit` with who, what, target, before and after values, time, and IP. It filters and exports to CSV and cannot be edited.
9. IPs in sessions and the audit log are cleared after 90 days.
10. Every `/mod/*` and `/admin/*` route has a permission preHandler and allowed and denied tests; `reports.spec.ts` and `admin.spec.ts` pass with axe checks.

## Implementation choices (recorded in `docs/DECISIONS.md`)

- New permissions `catalog.manage` (Admin) and `featured.manage` (see owner question for Moderator access) are added as data.
- Endpoints the PRD doesn't list: `GET /v1/admin/books/merge-candidates`, `POST /v1/admin/books/merge-candidates/:id/dismiss`, `GET/POST/PATCH /v1/admin/genres`, `GET/POST/DELETE /v1/admin/subject-rules`, `GET /v1/admin/catalog/stats`.
- Auto-hide is a `hidden_at` column on `reviews` (status stays Approved); hidden reviews are excluded from lists (see owner question on aggregates).
- A merged Book's old slug redirects to the remaining Book (a `book_slug_redirects` table).
- The audit trigger permits exactly one kind of update: nulling `ip` on rows older than 90 days.

## Out of scope

- Moderation staffing and SLAs (an owner concern; the 48-hour alert is in M8).
- Second Source backfills (not in v1).

## Human prerequisites

- None for code. For staging, the owner grants the first Moderator via the new admin UI.
