# M4 · Reviews

## Goal

Let verified Members write, edit, and delete one review per Book, and let Moderators decide every review in a fast, keyboard-driven queue. Ratings, the distribution chart, and cached aggregates stay exactly in sync with Approved reviews. Every elevated action lands in the append-only audit log.

## PRD sections covered

§3 (milestone 4), §4 (moderation rules, audit), §5.3 (Review, Review status, Review version), §7.4 (rating summary, my controls, reviews list), §7.6 (writing, rules, averages), §7.10 (review queue, actions, claims, dashboard), §7.12 (review decision notifications and email), §9 (`reviews`, `review_versions`, `review_claims`, `audit_log`, keeping ratings in sync), §10 (Reviews and Moderation endpoints except reports and unpublish), §11 (review rate limit, star input and spoiler a11y), §12 (components: star input, spoiler toggle, review form, moderation queue; e2e: write/edit/delete, moderate), §13 (seeded reviews in every status).

## Deliverables

- Schema: `reviews`, `review_versions`, `review_claims`, `audit_log` (append-only trigger).
- Shared: the `ReviewInput` schema, the status transition function, and the weighted rating, average, and distribution functions.
- Aggregates updated in the same transaction as each status change; a nightly `ratings.recompute` job with mismatch reporting.
- Endpoints: `GET/PUT/DELETE /books/:slug/my-review`, `GET /books/:slug/reviews`, rating summary on `GET /books/:slug`, `GET /mod/reviews`, `POST /mod/reviews/:id/claim|approve|reject`, `GET /mod/stats`.
- Notification and email on each decision (respecting preferences).
- Web: `StarRatingInput`, `SpoilerToggle`, the review form and "my review" panel, the rating summary chart, the reviews list, the admin shell, `/admin/reviews` (claims, diff, reason picker, A/R/J/K), and the `/admin` dashboard.
- Seed: reviews in every status. E2E: `reviews.spec.ts` and `moderation.spec.ts`.

## Acceptance criteria

1. A verified Member can submit a review (1–5 stars, optional headline ≤ 120, body 50–10,000, spoiler flag, optional Edition). It is Pending and not publicly visible. Unverified Members and Visitors are refused.
2. A second review of the same Book is impossible (DB unique constraint); PUT edits the existing review instead.
3. Editing an Approved review returns it to Pending and hides it until re-approved; aggregates drop it immediately.
4. A Moderator opening a queue item claims it for 10 minutes; a second Moderator gets 409; Moderators cannot decide their own reviews.
5. Approve and reject (with an optional saved or typed reason) record the decision on the version, update aggregates, notify the author in-app and by email (if enabled), and write an audit row.
6. A rejected review is visible only to its author, with the reason; the author can edit and resubmit.
7. The book page shows average (one decimal), count, and a 5-bar distribution (with a text alternative); clicking a bar filters the list; the list sorts Most helpful, Newest, Highest, and Lowest, 10 per page.
8. `ratings.recompute` finds zero mismatches after the seed and after e2e runs.
9. The star input works fully by keyboard as a radio group; spoiler content is hidden behind "Show spoilers".
10. `e2e/reviews.spec.ts` and `e2e/moderation.spec.ts` pass with axe checks. `audit_log` refuses UPDATE and DELETE.

## Implementation choices (recorded in `docs/DECISIONS.md`)

- Saved rejection phrases are a constant list in `packages/shared` (editable in code); free text is also allowed.
- Audited actions: review decisions (approve, reject, unpublish), report dismissals, role changes, suspensions, session revocations, verification resends by staff, Catalog edits, merges, featured changes, and Genre/rule changes. Claims and reads are not audited.
- Append-only is enforced by a trigger (works in every environment) plus INSERT/SELECT-only grants where a separate app role exists.
- The "most helpful" sort uses `helpful_count`, which stays 0 until M5.

## Out of scope

- Helpful votes (M5), reports, unpublish, and the reports queue (M7).
- Automatic approval (never in v1).
- Structured data for reviews (M8).

## Human prerequisites

- None. The first Moderator locally comes from the seed; in staging, from `seed:admin` plus a role grant once M7 lands (or directly via the seed script).
