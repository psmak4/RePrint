# Decisions

Numbered decision records. Append new entries at the end with the next number, and never renumber. Each entry says **Status**: *Decided (PRD)* for choices the PRD makes, *Default, owner to confirm* for the owner's call where the PRD is open, or *Implementation* for details the PRD leaves to engineering. To change a PRD decision, add an entry proposing it. `PRD.md` itself is never edited by the loop.

Format:

```
### D-NNN · Title
- Status: …
- Decision: …
- Why: …
- Affects: task IDs or files
```

## Questions for the owner

Answer these before, or while, the loop reaches the tasks listed. Each has a default the loop will use until you change it: edit the entry's Status to "Decided (owner)", then adjust the text.

| # | Question | Default used | First task affected |
| --- | --- | --- | --- |
| Q1 | Is `reprint.com` secured? What are the real domains? | Domains come from env vars (D-013) | M1-T18 |
| Q2 | Private beta before public launch? | Yes: `PUBLIC_SIGNUPS=false` plus invite codes (D-014) | M2-T06 |
| Q3 | Approve the proposed Genre list and starter mapping rules | The 42 Genres in D-015 | M3-T03 |
| Q4 | Show the previously approved version while an edit is pending? | No, hidden (PRD, D-016) | M4-T04 |
| Q5 | Erase or keep a deleted account's reviews? | Erase (PRD, D-017) | M2-T17 |
| Q6 | Ask Hardcover about storage now? | Not in v1 (D-018) | none |
| Q7 | Who moderates at launch, and how fast? | Out of scope for code; 48-hour alert stays (D-019) | M8-T06 |
| Q8 | During the 30 days before erase, what do others see of a deleted account? | Profile, library, and reviews hidden immediately; aggregates recomputed (D-043) | M2-T17 |
| Q9 | What does the limited `users.view` for Moderators include? | Profile, status, roles, review/report counts; no email, sessions, IPs, or audit history (D-044) | M7-T03 |
| Q10 | Who picks featured content? PRD §7.2 says a moderator picks the featured review; §7.11 puts it in Admin | `featured.manage` for Moderator and Admin, with featured Genres Admin-only (D-045) | M7-T15 |
| Q11 | Do auto-hidden reviews (3+ open reports) still count in the Book's rating? | Yes, until unpublished; they're only hidden from lists (D-046) | M7-T01 |
| Q12 | What does a suspended user see when logging in? | "This account is suspended" (+ end date) after a correct password; the generic error otherwise (D-047) | M2-T08 |
| Q13 | Should registration reveal that an email is already registered? | Username taken: yes (field error). Email taken: same generic "check your email" response, and an email tells the owner (D-048) | M2-T05 |
| Q14 | Plausible or self-hosted Umami? | Plausible (D-049) | M8-T05 |
| Q15 | Merging two Books when one Member shelved both | Keep the most recently updated Shelf entry (D-050) | M7-T11 |

## Decisions made in the PRD (§14)

### D-001 · Scope
- Status: Decided (PRD)
- Decision: One v1 launch with every feature in the PRD. Milestones are internal checkpoints, not releases.
- Why: Owner requirement.
- Affects: all

### D-002 · Book data
- Status: Decided (PRD)
- Decision: RePrint's Catalog stores Books as they're used, plus live Source search with caching. Open Library first; no bulk import.
- Why: Own vocabulary; small storage cost; pages never wait on a Source; stays within Open Library's usage guidelines.
- Affects: M3

### D-003 · Reviews
- Status: Decided (PRD)
- Decision: One per Member per Book; every review moderated; edits go back to Pending; rejection reason optional.
- Why: Owner requirement.
- Affects: M4

### D-004 · Reviewing independent of the library
- Status: Decided (PRD)
- Decision: Reviewing doesn't require the Book to be in the library.
- Why: Owner requirement.
- Affects: M4, M6

### D-005 · Library
- Status: Decided (PRD)
- Decision: One shelf per Book; no reading dates.
- Why: Libraries are secondary.
- Affects: M6

### D-006 · Access control
- Status: Decided (PRD)
- Decision: Roles and permissions tables; Member, Moderator, Admin. Code checks permissions, never role names.
- Why: Room to add roles later.
- Affects: M2, M7

### D-007 · Sign-in
- Status: Decided (PRD)
- Decision: Postgres sessions in an httpOnly `rp_session` cookie on the parent domain; Argon2id password hashing.
- Why: Sessions can be revoked; `www` and `api` are the same site.
- Affects: M2

### D-008 · Email verification
- Status: Decided (PRD)
- Decision: Required before reviewing, voting, or reporting.
- Why: Reduces spam.
- Affects: M2, M4, M5, M7

### D-009 · Web app
- Status: Decided (PRD)
- Decision: React Router 8 framework mode, server-rendered on Netlify.
- Why: Book pages need to be indexed by search engines.
- Affects: M1

### D-010 · API
- Status: Decided (PRD)
- Decision: Fastify 5 on Render with a separate worker.
- Why: Can later serve a mobile app; heavy jobs don't slow requests.
- Affects: M1

### D-011 · Repository
- Status: Decided (PRD)
- Decision: pnpm + Turborepo monorepo.
- Why: Zod schemas shared between web and API.
- Affects: M1

### D-012 · Quality
- Status: Decided (PRD)
- Decision: Full test suite, CI/CD, preview environments.
- Why: Production-ready from day one.
- Affects: all

## Defaults for PRD open questions (§14)

### D-013 · Domains
- Status: Default, owner to confirm (Q1)
- Decision: Every origin and domain comes from env vars: `WEB_ORIGIN`, `API_ORIGIN`, `WEB_ORIGINS` (allowed Origins for writes), `COOKIE_DOMAIN`, `IMAGE_BASE_URL`, `API_INTERNAL_URL`. Nothing hard-codes `reprint.com`. Locally: web `http://www.reprint.localhost:5173`, API `http://api.reprint.localhost:3000`, `COOKIE_DOMAIN=reprint.localhost`, and SSR calls the API at `API_INTERNAL_URL=http://localhost:3000`. If a Playwright browser (WebKit) can't resolve `*.localhost`, M1-T13 falls back to `http://localhost:5173` and `http://localhost:3000` with a host-only cookie (cookies ignore ports), recording that here.
- Why: `reprint.com` may not be secured; env-driven domains make the swap a config change.
- Affects: M1-T07, M1-T11, M1-T13, M1-T18, M2-T02, `.env.example`

### D-014 · Launch content: private beta
- Status: Default, owner to confirm (Q2)
- Decision: Plan for a private beta. `PUBLIC_SIGNUPS=false` closes registration unless the request carries a code listed in `SIGNUP_INVITE_CODES` (comma-separated, env-managed). Browsing stays public. Flipping to `true` opens signups with no code change.
- Why: The Catalog starts empty; early reviewers fill Discover before the public launch.
- Affects: M2-T06, M2-T10

### D-015 · Genre list and starter Subject mapping
- Status: Default, owner to confirm (Q3)
- Decision: Seed these 42 Genres as reference data (slug in brackets; a child Genre names its parent). The ★ Genres are the 12 featured by default. Starter `subject_genre_rules` patterns are case-insensitive substring matches on Subject labels, higher priority first.

| # | Genre [slug] | Parent | Starter Subject patterns |
| --- | --- | --- | --- |
| 1 | ★ Literary Fiction [literary-fiction] | — | "literary fiction", "psychological fiction" |
| 2 | Contemporary Fiction [contemporary-fiction] | — | "contemporary fiction", "domestic fiction" |
| 3 | ★ Historical Fiction [historical-fiction] | — | "historical fiction" |
| 4 | ★ Classics [classics] | — | "classic literature", "classics" |
| 5 | ★ Science Fiction [science-fiction] | — | "science fiction", "space opera", "space warfare" |
| 6 | Dystopian [dystopian] | Science Fiction | "dystopia", "dystopian" |
| 7 | ★ Fantasy [fantasy] | — | "fantasy fiction", "fantasy", "magic" |
| 8 | Horror [horror] | — | "horror", "ghost stories", "vampires" |
| 9 | ★ Mystery [mystery] | — | "mystery", "detective and mystery stories", "private investigators" |
| 10 | ★ Thriller & Suspense [thriller-suspense] | — | "thriller", "suspense", "espionage" |
| 11 | Crime Fiction [crime-fiction] | — | "crime fiction", "noir" |
| 12 | ★ Romance [romance] | — | "romance", "love stories" |
| 13 | Adventure [adventure] | — | "adventure stories", "adventure fiction" |
| 14 | Westerns [westerns] | — | "western stories", "westerns" |
| 15 | Humor & Satire [humor-satire] | — | "humorous fiction", "humor", "satire" |
| 16 | Short Stories [short-stories] | — | "short stories" |
| 17 | Poetry [poetry] | — | "poetry", "poems" |
| 18 | Drama & Plays [drama-plays] | — | "drama", "plays" |
| 19 | Graphic Novels & Comics [graphic-novels-comics] | — | "graphic novels", "comic books", "comics" |
| 20 | Mythology & Folklore [mythology-folklore] | — | "mythology", "folklore", "legends" |
| 21 | ★ Young Adult [young-adult] | — | "young adult fiction", "teen" |
| 22 | Middle Grade [middle-grade] | — | "middle grade" |
| 23 | Children's Books [childrens-books] | — | "juvenile fiction", "juvenile literature", "picture books" |
| 24 | ★ Biography [biography] | — | "biography", "autobiography" |
| 25 | ★ Memoir [memoir] | — | "memoir" |
| 26 | ★ History [history] | — | "history" (lower priority than specific fiction rules) |
| 27 | True Crime [true-crime] | — | "true crime", "criminal investigation" |
| 28 | ★ Science & Nature [science-nature] | — | "popular science", "natural history", "physics", "biology", "astronomy" |
| 29 | Technology [technology] | — | "technology", "computer science", "programming" |
| 30 | Philosophy [philosophy] | — | "philosophy", "ethics" |
| 31 | Psychology [psychology] | — | "psychology" |
| 32 | Religion & Spirituality [religion-spirituality] | — | "religion", "spirituality", "theology" |
| 33 | Politics & Society [politics-society] | — | "political science", "politics", "sociology", "social conditions" |
| 34 | Business & Economics [business-economics] | — | "business", "economics", "management" |
| 35 | Self-Help [self-help] | — | "self-help", "self-actualization", "success" |
| 36 | Health & Wellness [health-wellness] | — | "health", "nutrition", "fitness" |
| 37 | Food & Cooking [food-cooking] | — | "cooking", "cookbooks", "food" |
| 38 | Travel [travel] | — | "travel", "description and travel" |
| 39 | Arts & Photography [arts-photography] | — | "art", "photography", "design" |
| 40 | Music [music] | — | "music", "musicians" |
| 41 | Sports & Outdoors [sports-outdoors] | — | "sports", "outdoor recreation" |
| 42 | Essays [essays] | — | "essays" |

- Why: PRD §5.1 asks for about 40 curated Genres; these cover the most common Open Library subject areas. Owners can edit them in the admin area after M7.
- Affects: M3-T03, M3-T09, M5

### D-016 · Edited-review visibility
- Status: Default, owner to confirm (Q4)
- Decision: Follow the PRD: when an Approved review is edited it returns to Pending and is hidden (and dropped from aggregates) until approved again.
- Why: The current spec is explicit.
- Affects: M4-T04

### D-017 · Deleted accounts
- Status: Default, owner to confirm (Q5)
- Decision: Follow the PRD: on account deletion, the account is disabled immediately and erased after 30 days with its reviews, votes, reports, and library.
- Why: The current spec is explicit; there's no "Deleted reader" placeholder.
- Affects: M2-T17, M4-T02, M5-T01, M7-T01

### D-018 · Hardcover
- Status: Default, owner to confirm (Q6)
- Decision: Not in v1. The adapter interface and contract suite (M3-T04) keep the door open.
- Why: Hardcover hasn't confirmed storage rights; PRD §3 lists a second provider as out of scope.
- Affects: none

### D-019 · Moderation staffing
- Status: Default, owner to confirm (Q7)
- Decision: Out of scope for code. The 48-hour oldest-pending alert (M8-T06) stays as specified.
- Why: Staffing is an operations decision.
- Affects: M8-T06

## Implementation decisions

### D-020 · Monorepo layout details
- Status: Implementation
- Decision: API code lives under `apps/api/src/modules/<area>/` (routes, services, preHandlers), jobs under `apps/api/src/jobs/`, Source adapters under `apps/api/src/catalog/sources/<name>/`. E2E specs live in a root `e2e/` workspace package. Web copy lives in `apps/web/app/copy/`.
- Why: Conventional feature-folder layout; keeps Source vocabulary contained.
- Affects: M1

### D-021 · UUIDv7 generation
- Status: Implementation
- Decision: Generate UUIDv7 in the app with the `uuid` package (v7), not with Postgres 18's `uuidv7()`.
- Why: Works if Neon forces the Postgres 17 fallback; IDs are known before insert.
- Affects: M1-T05

### D-022 · Dependencies outside the PRD §8 stack table
- Status: Implementation
- Decision: The loop may add these without a further entry: `uuid` (UUIDv7), `testcontainers` + `@testcontainers/postgresql` + `@testcontainers/redis` (PRD §12 names Testcontainers), `nodemailer` (SMTP to Mailpit), `@fastify/multipart` (uploads), `@aws-sdk/client-s3` (R2), `ua-parser-js` (session device names), `@fastify/swagger` + `@fastify/swagger-ui` + `fastify-type-provider-zod` (OpenAPI from Zod), `@testing-library/*` + `jsdom` (component tests), `@axe-core/playwright` and `k6` (PRD §12), `web-vitals` (M8-T08), `pino-pretty` (dev only). Anything else needs its own entry.
- Why: Each fills a job the PRD requires; recording them once avoids noise.
- Affects: all

### D-023 · Local services
- Status: Implementation
- Decision: `docker-compose.yml` runs `postgres:18`, `redis:7`, and `axllent/mailpit`. Integration tests use Testcontainers with the same images.
- Why: Matches PRD §13 local setup; Render Key Value is Redis-compatible.
- Affects: M1-T04, M1-T08

### D-024 · E2E before preview environments
- Status: Implementation
- Decision: Until M1-T22 lands, CI's `e2e` job runs Playwright against a locally built stack (Docker services + built apps, `SOURCE_MODE=stub`, Mailpit). After previews exist, `e2e-preview` runs against them and the local job stays as a fallback.
- Why: PRD §12 wants e2e on every PR; previews need owner accounts first.
- Affects: M1-T13, M1-T22

### D-025 · Render region
- Status: Implementation
- Decision: Render services and Key Value use `virginia` (US East); Neon uses `aws-us-east-1` or `aws-us-east-2`.
- Why: PRD §13: same US East region for all three.
- Affects: M1-T18, M1-T19

### D-026 · Registration signs you in
- Status: Implementation
- Decision: A successful registration creates a session immediately; the account is unverified until the link is used.
- Why: PRD §7.1 lets unverified accounts browse and shelve, which implies they're signed in.
- Affects: M2-T05

### D-027 · Sliding session renewal
- Status: Implementation
- Decision: On an authenticated request, if `last_seen_at` is more than 24 h old, set `last_seen_at = now` and `expires_at = now + 30 days`.
- Why: "Renews while in use" without a write on every request.
- Affects: M2-T02

### D-028 · Email transport
- Status: Implementation
- Decision: `EMAIL_TRANSPORT=smtp` (local and CI → Mailpit via nodemailer) or `resend` (preview in test mode, staging, production). All sends go through the `email.send` job.
- Why: PRD §13 uses Mailpit locally and Resend elsewhere.
- Affects: M2-T04

### D-029 · Breached-password check availability
- Status: Implementation
- Decision: `HIBP_MODE=live|off`. In `live`, a range-API failure or timeout (2 s) logs a warning and allows the password (fail open). Tests and local dev default to `off`.
- Why: An outside outage shouldn't block registration; the 12-char minimum still applies.
- Affects: M2-T05, M2-T09, M2-T13

### D-030 · Uploaded images use the `covers` table
- Status: Implementation
- Decision: Member avatars and admin-uploaded covers are rows in `covers` with `origin = upload` and an `r2_key`; `users.avatar_id` references `covers.id`. Locally, `STORAGE_DRIVER=local` writes to `.data/uploads` and serves via the API.
- Why: PRD §9 already models uploaded images there; avoids a second image table.
- Affects: M2-T16, M7-T10

### D-031 · Extra endpoints the PRD implies but doesn't list
- Status: Implementation
- Decision: `GET /v1/me/sessions` (list), `POST /v1/books/resolve` (store a Book from a search candidate), `GET /v1/me/export` (data download), `GET /v1/admin/books/merge-candidates`, `POST /v1/admin/books/merge-candidates/:id/dismiss`, `GET/POST/PATCH /v1/admin/genres`, `GET/POST/DELETE /v1/admin/subject-rules`, `GET /v1/admin/catalog/stats`, `GET /v1/admin/system/stats`.
- Why: Each backs a feature in PRD §6, §7.1, §7.11, or §11 with no listed endpoint.
- Affects: M2-T15, M3-T11, M6-T08, M7-T11, M7-T12, M8-T07

### D-032 · Notification preferences
- Status: Implementation
- Decision: `users.email_review_decisions boolean not null default true`. Security emails (verification, reset, email change, password changed, suspension, deletion) always send.
- Why: PRD §7.12 marks only the review decision email as optional.
- Affects: M2-T01, M2-T13, M4-T07

### D-033 · Search candidates are opaque references
- Status: Implementation
- Decision: Each "not yet on RePrint" candidate gets a random `ref`; the candidate payload (incl. Source link) is stored in Redis for 24 h under that ref. The web route `/books/resolve/:ref` calls `POST /v1/books/resolve`. Shelving a candidate resolves it first.
- Why: PRD §5.4: Source IDs must never appear in URLs or API responses.
- Affects: M3-T11, M3-T19, M6-T03

### D-034 · Search vector maintenance
- Status: Implementation
- Decision: `books.search_vector` is rebuilt by the ingest and admin-edit services (Book title and subtitle, Edition titles, ISBNs, Author names, Series names, with `unaccent`). Trigram indexes cover Book titles and Author names.
- Why: The vector spans several tables, so a generated column can't express it.
- Affects: M3-T02, M3-T08, M3-T12, M7-T09

### D-035 · ISBN searches
- Status: Implementation
- Decision: When `q` is a valid ISBN-10 or ISBN-13, `/v1/search` returns `isbnMatch: { slug } | { ref }` and the web loader redirects.
- Why: PRD §7.3 says ISBN search "goes straight to that Book".
- Affects: M3-T14, M3-T17

### D-036 · Audited actions
- Status: Implementation
- Decision: `audit_log` records approve, reject, unpublish, report dismissal, role grant and removal, suspend, unsuspend, session revocation by staff, verification resend by staff, Catalog edits, cover uploads, Primary Edition changes, refreshes, merges, merge dismissals, Genre and rule changes, and featured changes. Claims and reads are not recorded.
- Why: PRD §4 says every elevated action; claims and reads change nothing.
- Affects: M4-T03 and all later elevated endpoints

### D-037 · Append-only audit log
- Status: Implementation
- Decision: A trigger rejects UPDATE and DELETE on `audit_log`, with one exception: setting `ip` to NULL on rows older than 90 days (D-042). Where deployments use a separate app DB role, it gets INSERT and SELECT only.
- Why: PRD §9 requires insert-only; a trigger also protects local and preview databases.
- Affects: M4-T03, M7-T16

### D-038 · Saved rejection phrases
- Status: Implementation
- Decision: A constant list in `packages/shared` (for example "Contains unmarked spoilers", "Not about this book", "Offensive or hateful content", "Spam or advertising", "Too short or low effort") plus free text.
- Why: PRD §7.10 mentions saved phrases but no management UI.
- Affects: M4-T12

### D-039 · New permissions
- Status: Implementation (holders of `featured.manage`: see Q10)
- Decision: Add `catalog.manage` (Admin) for Catalog edits, refresh, merge, and Genre/rule management, and `featured.manage` (see D-045) as data in the permissions tables.
- Why: PRD §4 has no permission for these Admin areas; the app checks permissions, never roles.
- Affects: M7-T09, M7-T12, M7-T15

### D-040 · Auto-hidden reviews and merged Book slugs
- Status: Implementation
- Decision: Auto-hide sets `reviews.hidden_at` (status stays Approved) and clears it on dismiss. A merged Book's slug is kept in `book_slug_redirects` and the web returns a 301 to the remaining Book.
- Why: The status list in PRD §5.3 has no "hidden"; old URLs must keep working for SEO.
- Affects: M7-T01, M7-T11

### D-041 · Caching of viewer-specific responses
- Status: Implementation
- Decision: Public GETs use `Cache-Control: public, max-age=60, stale-while-revalidate=600` plus ETag; responses containing viewer data (`viewerShelf`, my review) use `private, no-store`, and the web loader separates public from viewer data.
- Why: PRD §10 caching must not leak one Member's data to another.
- Affects: M3-T10, M6-T02

### D-042 · IP retention
- Status: Implementation
- Decision: A daily `privacy.clearOldIps` job sets `sessions.ip` and `audit_log.ip` to NULL when older than 90 days.
- Why: PRD §11.
- Affects: M7-T16

### D-043 · Deleted accounts during the 30-day window
- Status: Default, owner to confirm (Q8)
- Decision: Once deleted, the profile and library return 404, reviews are hidden from lists and excluded from aggregates (recomputed on deletion), and votes stop counting. The account can't log in. There is no self-service restore in v1.
- Why: "Disabled immediately" suggests nothing should stay visible.
- Affects: M2-T17, M4-T02, M6-T06

### D-044 · Moderators' limited `users.view`
- Status: Default, owner to confirm (Q9)
- Decision: Moderators see username, display name, status, roles, join date, and review and report counts. Only Admins see email, sessions, IPs, and audit history.
- Why: Least privilege for a role that doesn't manage accounts.
- Affects: M7-T03

### D-045 · Featured content permissions
- Status: Default, owner to confirm (Q10)
- Decision: `featured.manage` is granted to Moderator and Admin. Moderators may set the featured review; only Admins set featured Genres (checked by a second permission, `featured.genres`, Admin only).
- Why: PRD §7.2 says a moderator picks the featured review; §7.11 places featured content under Admin.
- Affects: M7-T15

### D-046 · Auto-hidden reviews and ratings
- Status: Default, owner to confirm (Q11)
- Decision: Hidden reviews stay in the Book's average and count until a Moderator unpublishes them.
- Why: Hiding is provisional; only a moderator decision changes status.
- Affects: M7-T01

### D-047 · Suspended user login message
- Status: Default, owner to confirm (Q12)
- Decision: After a correct password, a suspended user sees "This account is suspended" (with the end date if set). Wrong credentials always get the generic message.
- Why: Tells the real owner what happened without helping enumeration.
- Affects: M2-T08, M7-T05

### D-048 · Registration and existing emails
- Status: Default, owner to confirm (Q13)
- Decision: A taken username is a field error. A taken email returns the same success-shaped response as a new registration ("check your email") and sends the existing owner an "someone tried to register with your email" message. No second account is created.
- Why: Consistent with PRD §7.1's anti-enumeration stance on login and password reset.
- Affects: M2-T05

### D-049 · Analytics provider
- Status: Default, owner to confirm (Q14)
- Decision: Plausible (hosted), configured by `ANALYTICS_DOMAIN` and `ANALYTICS_SCRIPT_URL`. Umami works with the same env vars.
- Why: No cookies, no infrastructure to run.
- Affects: M8-T05

### D-050 · Shelf conflicts on merge
- Status: Default, owner to confirm (Q15)
- Decision: If one Member shelved both Books, keep the Shelf entry with the latest `updated_at` and drop the other.
- Why: One shelf per Member per Book must hold after a merge.
- Affects: M7-T11

### D-051 · JSON-LD without `dangerouslySetInnerHTML`
- Status: Implementation
- Decision: A `<JsonLd data={…}>` component serializes with `JSON.stringify` and escapes `<` as `<`, rendered as a script child. The Biome ban stays on everywhere.
- Why: PRD §11 bans `dangerouslySetInnerHTML`; §7.4 needs structured data.
- Affects: M8-T02

### D-052 · Alerts and backups
- Status: Implementation
- Decision: The `system.monitor` job raises tagged Sentry events; the owner routes them to email and Slack in Sentry. Nightly backups run as a scheduled GitHub Actions workflow (`pg_dump` → R2 bucket with a 30-day lifecycle rule).
- Why: No extra infrastructure; both are auditable in the repo.
- Affects: M8-T06, M8-T11

### D-053 · Workspace build and TypeScript setup
- Status: Implementation
- Decision: Workspace packages are named `@reprint/<name>`; the apps are `api` and `web` (so `pnpm --filter api …` works). Each library compiles to `dist/` with `tsc -p tsconfig.build.json` (tests excluded) and exports `./dist/index.js` + types; `tsconfig.json` is the no-emit typecheck config that includes tests. Turbo runs `build`, `typecheck`, and `test:unit` after `^build`. TypeScript 7 (`typescript@^7`, the native compiler) is the only compiler so far. Node packages use `module: nodenext`. `@types/node` (major 24, matching the runtime) is added as a type-only dev dependency. Turbo's AI-agent `AGENTS.md` guidance is turned off (`agentGuidance: false`) because `CLAUDE.md` is the agent guide.
- Why: Compiled `dist/` output lets Node run the API and worker without a bundler or loader; per-package tsconfigs keep strict settings in one base (`packages/config/tsconfig/base.json`).
- Affects: M1-T01, every package

### D-054 · CI job layout and secret scanning
- Status: Implementation
- Decision: CI runs one job per check (`lint`, `typecheck`, `unit`, `build`, `gitleaks`, `audit`) in parallel, each installing through a shared composite action (`.github/actions/setup`: `pnpm/action-setup` + `actions/setup-node` with the pnpm store cache). Gitleaks runs through `scripts/gitleaks.sh` (local binary if present, otherwise the pinned `ghcr.io/gitleaks/gitleaks` image) instead of `gitleaks/gitleaks-action`, so CI and `pnpm check` scan identically and no action license key is needed. `pnpm check` runs the same steps sequentially. Turbo's remote cache reads `TURBO_TOKEN` (secret) and `TURBO_TEAM` (variable or secret) and is skipped when they are empty.
- Why: Separate jobs give stable, individually required status checks (listed in `docs/ci.md`) and fast parallel feedback.
- Affects: M1-T02, M1-T03, later tasks that add CI jobs

### D-055 · Merge gate instead of branch protection
- Status: Decided (owner)
- Decision: The repo stays private on the free GitHub plan, where branch protection and rulesets aren't enforced, so M1-T03 is skipped. The loop merges only through `scripts/ralph/merge-pr.sh <pr>`: it refuses unless the PR is open, not a draft, targets `main`, is mergeable, has no failing or cancelled checks, and every required job in the `docs/ci.md` "Required checks" table passed on its head commit; it then squash-merges with `--match-head-commit` and deletes the branch. `.claude/settings.json` denies `gh pr merge` and allows the script; `scripts/ralph/PROMPT.md` requires it. Force-pushes and direct pushes to `main` stay blocked by the existing deny rules.
- Why: Keeps "CI must be green before merge" for the loop without a paid plan. It doesn't stop a person with write access from merging by hand; if the repo goes public or to a paid plan, enable branch protection as well.
- Affects: M1-T03, M1-T24, `scripts/ralph/`, `docs/ci.md`, every task that adds a CI job

### D-056 · Local compose services
- Status: Decided (loop)
- Decision: `docker-compose.yml` (project name `reprint`) runs `postgres:18`, `redis:7`, and `axllent/mailpit` on the host ports in `.env.example`, each with a healthcheck so `docker compose up -d --wait` blocks until ready. Postgres mounts its volume at `/var/lib/postgresql` (the Postgres 18 image layout). Extensions are enabled by `docker/postgres/init.sql` through `docker-entrypoint-initdb.d`, and the first migration (M1-T05) repeats them with `IF NOT EXISTS` so managed databases (Neon) work too. Mailpit's healthcheck is `/mailpit readyz`. Images are unpinned beyond the major version the PRD requires, to match the Testcontainers images later.
- Why: Follows the earlier compose decision (images) and PRD §13; the init script keeps local setup zero-step.
- Affects: M1-T05, M1-T08, M1-T13, `docs/local-dev.md`

### D-057 · Database tooling details (M1-T05)
- Status: Decided (loop)
- Decision: (1) `pnpm db:check` runs `drizzle-kit check` and then `drizzle-kit generate` into a scratch copy of `packages/db/drizzle/` (`.drizzle-check/`, git-ignored); any new migration file means drift. It needs no database. (2) The first migration is a custom SQL migration (`0000_extensions`) that enables `pg_trgm`, `unaccent`, and `citext` with `IF NOT EXISTS`. (3) `db:migrate` builds the package and runs `dist/migrate-cli.js`, defaulting to the local compose URL when no `DATABASE_URL` is set and `NODE_ENV` is not `production`. (4) Integration tests are `*.integration.test.ts` files run by `vitest.integration.config.ts` through Turbo's `test:integration` task (never cached); unit runs exclude them. The Testcontainers helper is exported from `@reprint/db/testing`. (5) Added `db-check` and `integration` CI jobs. (6) `pnpm-workspace.yaml` sets `allowBuilds` to `false` for `esbuild`, `cpu-features`, `protobufjs`, and `ssh2`: esbuild ships prebuilt binaries, and the others are optional native add-ons of Testcontainers.
- Why: PRD §12 requires a drift check and Testcontainers-based integration tests; these are the conventional ways to get them with drizzle-kit 0.31 and pnpm 12.
- Affects: M1-T08, M1-T16, every later schema task, `docs/ci.md`


### D-058 · Shared foundation details (M1-T06)
- Status: Decided (loop)
- Decision: (1) Member permission names are `reviews.write`, `reviews.vote`, `reviews.report`, `library.manage`, and `profile.manage`; public reading needs no permission. Only names live in `packages/shared`; the role-to-permission mapping is data in the database (PRD §4). (2) Cursor pagination takes `?cursor=&limit=` (limit ≤ 50, default 20); cursors are opaque strings. Page envelopes are `{ items, meta }`. (3) `@vitest/coverage-v8` (Vitest's own coverage plugin, same major as Vitest) enforces the 90% line gate; `packages/shared` `test:unit` always runs with coverage, so `pnpm check` and CI enforce it.
- Why: PRD §4 and §12 name the gate and the elevated permissions but not the Member permission names or the cursor parameter details.
- Affects: M1-T07, M2 onward (permission checks), every list endpoint


### D-059 · API skeleton details (M1-T07)
- Status: Decided (loop)
- Decision: (1) Dev runs through `tsx watch` (`pnpm --filter api dev`, which first builds `@reprint/shared`); production runs `node dist/server.js`. `tsx` and `pino-pretty` are dev dependencies. (2) A non-GET/HEAD/OPTIONS request with a missing or foreign `Origin` gets 403 (PRD §10 says the header must be present); tests and server-to-server callers must send an allowed `Origin`. (3) A caller's `x-request-id` is reused only if it matches `[A-Za-z0-9._-]{1,128}`; otherwise a UUID is generated. It is logged as `reqId` (pino's default label) and echoed in the response header. (4) Problem Details responses use `application/problem+json`; the `type` is `https://reprint.com/problems/<title-slug>`; validation `errors[].path` is `body.<field>`, `querystring.<field>`, or `params.<field>`. Fastify reports only the first failing part (body before querystring). (5) Only `WEB_ORIGINS` is required for now; `DATABASE_URL` and `REDIS_URL` become required when M1-T08 uses them. Empty env values count as unset. (6) helmet is registered with its defaults; M1-T14 tightens and tests the header set.
- Why: PRD §8 and §10 fix the stack and the error shape but not the dev runner, request-ID handling, or the missing-Origin case.
- Affects: M1-T08, M1-T10, M1-T14, M1-T15, every route


### D-060 · API integration harness and readiness (M1-T08)
- Status: Decided (loop)
- Decision: (1) `DATABASE_URL` and `REDIS_URL` are now required env vars. (2) `apps/api/src/testing/stack.ts` (`startTestStack()`) starts Postgres 18 (through `@reprint/db/testing`, migrated) and Redis 7 containers per test file and returns clients plus `reset()` (truncates every `public` table with `truncateAllTables()` from `@reprint/db/testing`, then `FLUSHALL`), which tests call in `beforeEach`. It is not shipped in `dist` (excluded from `tsconfig.build.json`). (3) `buildApp(env, { readinessChecks })` takes a list of `{ name, check }`; `server.ts` supplies Postgres and Redis checks, and M1-T09 adds the queue. `GET /v1/ready` runs them in parallel with a 2 s timeout each and returns `{ status, checks }` (200) or a 503 Problem Details naming the failed dependencies. (4) The API's Redis client uses `lazyConnect` and `maxRetriesPerRequest: 1`, so the API starts and reports not ready while Redis is down. (5) Unit runs exclude `*.integration.test.ts`; integration runs use `vitest.integration.config.ts`.
- Why: PRD §10 defines `/ready` and PRD §12 requires Testcontainers with Postgres 18 and Redis; the per-file containers keep the harness simple and let a test stop Redis without affecting others.
- Affects: M1-T09, M1-T15, every API integration test


### D-061 · Background worker details (M1-T09)
- Status: Decided (loop)
- Decision: (1) One BullMQ queue, `reprint`; jobs are named `<area>.<action>` and declared in `apps/api/src/jobs/registry.ts` with a Zod payload, a handler, and an optional `schedule` (see `src/jobs/README.md`). Payloads are validated on enqueue and again before the handler runs. (2) Repeatable jobs use BullMQ job schedulers (`upsertJobScheduler`, keyed by job name), synced at worker start, so several worker instances never duplicate a schedule. (3) The worker reads only `NODE_ENV`, `APP_ENV`, `LOG_LEVEL`, `DATABASE_URL`, and `REDIS_URL` (`loadWorkerEnv`); it needs no `WEB_ORIGINS`. (4) `pino` is now a direct API dependency (it was already installed through Fastify; PRD §8 lists it). The worker logs with `service: worker`. (5) `pnpm dev` (root) runs `apps/api` `dev`, which runs `dev:server` and `dev:worker` in parallel. (6) `test:integration` now depends on the package's own `build`, because the worker test starts the built `dist/worker.js`. (7) `pnpm-workspace.yaml` sets `allowBuilds` to `false` for `msgpackr-extract`, an optional native accelerator of BullMQ (same reason as D-057). (8) The queue readiness check calls `getJobCounts('waiting')`; the API and worker each hold their own Redis connection for BullMQ, with `maxRetriesPerRequest: 1` for the API's queue client and `null` for the worker.
- Why: PRD §8 and §10 require a separate worker process and a `/ready` queue check but leave the queue layout, schedule mechanism, and dev wiring open.
- Affects: M1-T10, M1-T15, M3 (Book refreshes), M2 (emails), M8 (queue alerts)



### D-062 · OpenAPI generation and drift check (M1-T10)
- Status: Decided (loop)
- Decision: (1) `@fastify/swagger` builds an OpenAPI 3.1 document from the routes' Zod schemas through `jsonSchemaTransform` from `fastify-type-provider-zod` (`src/plugins/openapi.ts`, registered before the routes). `@fastify/swagger-ui` serves it at `/v1/docs` only when `NODE_ENV` is not `production`; in production the path is an ordinary 404 Problem Details. Both packages were pre-approved in D-055's list. (2) `pnpm build` in `apps/api` runs `tsc` and then `src/scripts/openapi.ts`, which builds the app with placeholder env values and no database or Redis connections and writes `apps/api/openapi.json`. (3) `pnpm openapi:check` (`turbo run openapi:check`) regenerates the spec in memory and exits 1 when it differs from the committed file. It runs as a step of the CI `build` job and in `pnpm check`. (4) `openapi.json` is generated output, so Biome ignores it (`!**/openapi.json`); the drift check is what guards it. (5) The spec `info.version` is `1.0.0` until a release process exists.
- Why: PRD §10 and §12 require a generated spec and a build that fails when the spec changes without being committed, but leave the mechanism open.
- Affects: every later route task (run `pnpm build` and commit `apps/api/openapi.json`), M1-T24


### D-063 · Web app skeleton (M1-T11)
- Status: Decided (loop)
- Decision: (1) `apps/web` is React Router 8 framework mode with `ssr: true`, Vite 8, and `@tailwindcss/vite`; the default `entry.client`/`entry.server` are used until M1-T14 needs a nonce-aware server entry. `pnpm build` runs `react-router build` (output in `build/`, added to Turbo outputs) and `typecheck` runs `react-router typegen` first. (2) `packages/ui` compiles with `tsc` to `dist/` like the other packages; it holds the shadcn/ui-style `Button` (Radix `Slot`, `class-variance-authority`, `clsx`, `tailwind-merge`) and `cn`. The web `app.css` scans `packages/ui/src` with `@source`. The full theme tokens come in M1-T12. (3) The server API client (`app/lib/api.server.ts`) takes the incoming `Request`, forwards `cookie`, and forwards `x-request-id` (generating a UUID when absent); the base URL is `API_INTERNAL_URL`. (4) `vite.config.ts` loads `API_INTERNAL_URL` and `WEB_PORT` from the repo-root `.env` (Vite only exposes `VITE_*` by default); tests use a separate `vitest.config.ts` so the React Router plugin is not loaded. (5) Root `pnpm dev` builds `shared` and `ui`, then runs `api` and `web` dev scripts in parallel. (6) Biome's CSS parser has `tailwindDirectives` on. (7) Component tests use jsdom (per-file `@vitest-environment jsdom`) with `@testing-library/react`. (8) Strings live in `apps/web/app/copy/`.
- Why: PRD §8 fixes the stack but not the file layout, build wiring, or test environment.
- Affects: M1-T12, M1-T13, M1-T14, M1-T18

### D-064 · Design foundation (M1-T12)
- Status: Decided (loop)
- Decision: (1) Theme tokens are a Tailwind v4 `@theme` block in `packages/ui/src/theme.css`, exported as `@reprint/ui/theme.css` and imported by `apps/web/app/app.css`. Dark only; the token values and contrast ratios are in `docs/DESIGN.md` and checked by `packages/ui/src/theme.test.ts`. `accent` is never used for text (4.0:1 on `surface`); `link` is. (2) System font stack, no web fonts. (3) `AppShell` (skip link, header with search and account slots, `main#main`, footer) wraps the root `Layout`, so error pages get it too; routes render content only. The header search box uses the `<search>` element. (4) Footer legal links point to `/about`, `/terms`, `/privacy`, `/community-guidelines`, and `/contact`; the pages arrive in M8 and 404 until then. (5) The inline-string guard is a unit test (`components/shell/copy-guard.test.ts`) that scans shell component sources for JSX text and `aria-label`/`alt`/`title`/`placeholder` literals, not a Biome rule (Biome has no such rule).
- Why: PRD §8 and §11 fix the palette and accessibility bar but not the token names, shell structure, or guard mechanism.
- Affects: M1-T13, M2-T10, M3-T15, M3-T16

### D-065 · Playwright + axe harness (M1-T13)
- Status: Decided (loop)
- Decision: (1) `e2e/` is a root workspace package (`@playwright/test`, `@axe-core/playwright`); specs live in `e2e/specs/`, helpers in `e2e/support/`. (2) Playwright's `webServer` starts the **built** API and web app (`node apps/api/dist/server.js`, `react-router-serve`) with `SOURCE_MODE=stub`, so the specs test what ships; it reuses running servers locally and always starts its own in CI. Docker services come from `docker compose up -d --wait`. (3) The `*.localhost` domains from D-013 (`www.reprint.localhost:5173`, `api.reprint.localhost:3000`) work in Chromium, WebKit, and the mobile project, so the `localhost` fallback is not needed. (4) `e2e` is a required CI job in `docs/ci.md` but is not part of `pnpm check` (CLAUDE.md: "everything CI runs except e2e"). (5) Browsers install with `pnpm --filter e2e install:browsers`; the Playwright report is uploaded as an artifact from CI.
- Why: PRD §12 fixes the tools and browsers, and D-024 the CI approach, but not the layout, server wiring, or check wiring.
- Affects: M1-T22, M2-T12, M3-T22, M4-T15

### D-066 · Security headers (M1-T14)
- Status: Decided (loop)
- Decision: (1) The API registers `@fastify/helmet` with HSTS `max-age=63072000; includeSubDomains; preload`, `Referrer-Policy: strict-origin-when-cross-origin`, and a CSP of `default-src 'none'; frame-ancestors 'none'` (it only serves JSON). Swagger UI (non-production only) uses its own `staticCSP`. (2) The web app has its own `app/entry.server.tsx`, which generates a per-request nonce, passes it to `<ServerRouter nonce>` and `renderToPipeableStream`, and sets the CSP (`script-src 'nonce-…' 'strict-dynamic'`, `style-src 'self'`, `frame-ancestors 'none'`, `connect-src` including `API_ORIGIN`) plus the baseline headers. `style-src` allows `unsafe-inline` in development only (Vite injects CSS). (3) `apps/web/netlify.toml` sets the baseline headers (not the CSP, which needs a nonce) on everything Netlify serves, including static assets, and long-cache headers on `/assets/*`. A unit test keeps it in sync with `BASELINE_SECURITY_HEADERS`.
- Why: PRD §11 fixes the header set but not the values, CSP directives, or where each header is set.
- Affects: M1-T15, M1-T22

### D-067 · Observability wiring (M1-T15)
- Status: Decided (loop)
- Decision: (1) Sentry starts only when a DSN is set: `SENTRY_DSN` for the API and worker (`@sentry/node`, `apps/api/src/observability/sentry.ts`) and `VITE_SENTRY_DSN` for the web server and browser (`@sentry/react-router`, in `entry.server.tsx` and a new `entry.client.tsx`). Without a DSN nothing is initialised and no SDK code runs. Sentry's Node auto-instrumentation of third-party modules needs an early `--import`; that is left for the deploy task (M1-T18), so for now Sentry reports captured errors (unhandled API errors, failed jobs, web loader/render errors) but not automatic tracing spans of libraries. (2) The web app assigns the request ID in a root route `middleware` (`app/lib/request-log.server.ts`), which stamps `x-request-id` onto the incoming request before loaders run. The server API client already forwards that header, and the API already logs it as `reqId`, so a page view carries one ID in both logs. The middleware logs one `request completed` line (pino, `service: web`) and echoes the ID on the response. Unsafe incoming IDs are replaced (same rule as the API). (3) Log redaction paths (`cookie`, `authorization`, `password`, `token`, at the top level, one level down, and in `*.headers`, plus `set-cookie`) are `LOG_REDACT_PATHS` in `packages/shared`, used by the API, worker, and web loggers. (4) The web CSP `connect-src` adds the DSN's origin when a DSN is set. (5) `pino` is added to `apps/web` (already in the §8 stack table).
- Why: PRD §11 requires Sentry, structured logs, and a shared request ID but leaves the wiring open.
- Affects: M1-T18 (source map upload, `--import` instrumentation), M1-T22

### D-068 · Seed framework (M1-T16)
- Status: Decided (loop)
- Decision: (1) Seed modules are listed in order in `packages/db/src/seed/registry.ts` and all run in one transaction, so a failed seed leaves nothing behind. (2) Determinism comes from one fixed seed (`SEED`) through a mulberry32 PRNG; modules get `random.id()` (UUIDv7 from a fixed clock starting 2026-01-01 UTC, advancing 1 ms per ID), `int`, `pick`, `next`, and `now` instead of `newId()`, `Math.random()`, or `Date.now()`. (3) `db:reset` drops the `drizzle` and `public` schemas, recreates `public`, re-runs migrations (which re-enable the extensions), then seeds. (4) Both commands refuse when `NODE_ENV=production` or the `DATABASE_URL` host is not `localhost`, `127.0.0.1`, `::1`, or `*.localhost`. `db:seed` alone is for a freshly reset database; running it twice is not supported. (5) No `tsx` dependency: the CLI runs from `dist` like `db:migrate`.
- Why: PRD §13 wants `pnpm db:reset` to recreate the database with sample data; how is left open.
- Affects: M2-T21, M3-T21, M4-T14, M5-T08 (each appends a module).

### D-069 · Renovate configuration (M1-T17)
- Status: Decided (loop)
- Decision: (1) `renovate.json` extends `config:recommended`, runs weekly (before 06:00 UTC Monday), and disables all `major` updates, which pins every major in the PRD §8 stack table (Node, Postgres, Redis images included) without listing each package. (2) Minor, patch, pin, and digest updates share one group. (3) `drizzle-orm` and `drizzle-kit` minors are split out with a `review-carefully` label because 0.x minors can break. (4) GitHub Actions majors are re-enabled as separate PRs since Actions are not part of the stack table. (5) `rangeStrategy: bump` keeps `^x.y.z` ranges current. (6) The policy is in `docs/dependencies.md`.
- Why: PRD §8 and §11 say to pin majors and let Renovate open updates, but do not give the settings.
- Affects: M1-T23

### D-070 · Deployment deferred; free-tier staging plan
- Status: Decided (owner)
- Decision: M1-T19 (staging), M1-T21 (previews), and M1-T23 (Renovate) are skipped for now so the loop builds the app locally without paid services; M1-T20, M1-T22, and deploy tasks that depend on them stay unbuilt. When staging is un-skipped, use free tiers where possible: Neon free (database), Netlify free (web app and per-PR deploy previews), Render free web service for the API with BullMQ jobs run in the API process on staging only (Render has no free background workers; production keeps the separate worker per PRD §8), Render Key Value free (Redis, not persisted), Resend free, and Sentry free. Render free services sleep when idle, so staging smoke tests need a long first-request timeout. Per-PR API previews aren't free, so CI keeps running e2e against the local stack (D-024). Production as specified in PRD §13 (at least 2 always-on API instances) needs a paid Render plan; that is an owner decision for M8.
- Why: The owner doesn't want paid services yet; nothing before M8 needs a deployed environment.
- Affects: M1-T19–M1-T23, M1-T18 (config should allow an in-process worker flag), M8-T12, M8-T13

### D-071 · Deployment config (M1-T18)
- Status: Decided
- Decision: (1) `render.yaml` defines the API (`starter`, 2 instances, `preDeployCommand: pnpm db:migrate`, health check `/v1/ready`), the worker, and Key Value (`noeviction`, internal only), all in `virginia`; shared variables sit in an env var group and secrets use `sync: false`. Render auto-deploy is off, so the GitHub workflow controls order: migrate, then deploy. (2) The Netlify adapter `@netlify/vite-plugin-react-router` (PRD §8) is enabled in `vite.config.ts` only when `NETLIFY` is set, so local dev, CI e2e, and `react-router-serve` keep the plain build. (3) `WORKER_IN_PROCESS=true` makes the API start the job worker itself (for free-tier staging, D-070); default false. (4) The deploy workflow gates on the secrets being present and pins `netlify-cli` through `npx` (not a repo dependency). Render deploys use deploy hooks with `&ref=$GITHUB_SHA`. Migrations use `DATABASE_URL_DIRECT`.
- Why: PRD §12 and §13 fix the hosts and order but not the wiring. The gate lets the workflow merge before staging exists (D-070).
- Affects: M1-T20, M8-T12


### D-072 · Accounts schema (M2-T01)
- Status: Decided (loop)
- Decision: (1) Roles, permissions, and grants are inserted by a data migration (`0002_seed_roles.sql`) using Postgres 18's `uuidv7()`; the grants mirror `ROLE_PERMISSIONS` in `packages/shared` (Moderator = Member set + `reviews.moderate`, `reports.resolve`, `users.view`; Admin = all), and an integration test compares them. `truncateAllTables` in the test helper skips `roles`, `permissions`, and `role_permissions` so tests keep the seeded data. (2) `auth_tokens` gets a nullable `new_email` (citext) for `change_email` links, and `purpose` is a checked text column (`verify_email`, `reset_password`, `change_email`). `users.status` and `purpose` use text with CHECK constraints rather than Postgres enums, so later values need no `ALTER TYPE`. (3) `users.library_public` defaults to true (PRD §7.8 shows the Library tab "if public"; the default is a product choice the PRD leaves open, so change it here if the owner wants private by default). (4) `users.avatar_id` is not added yet; M2-T16 adds it with the `covers` table (nullable, so expand-only). (5) `user_roles.role_id` uses `ON DELETE RESTRICT`; user-side FKs cascade so `accounts.erase` needs one delete. (6) `users.bio` has a 280-character CHECK. (7) `@reprint/db` now depends on `@reprint/shared` for the status and purpose enums.
- Why: PRD §9 lists the columns but not defaults, cascade rules, or how roles are seeded.
- Affects: M2-T02, M2-T05, M2-T16, M2-T17, M2-T21

### D-073 · Session auth plugin (M2-T02)
- Status: Decided (loop)
- Decision: (1) `registerSessions` adds an `onRequest` hook that reads `rp_session`, hashes it, and sets `request.auth` (`null` for Visitors) with the user and their permission names (from `user_roles` → `role_permissions`); it needs the database passed to `buildApp`, and spec generation omits it. (2) An expired session, an unknown token, or a session of a `suspended` or `deleted` user is treated as signed out (`request.auth = null`, so 401 on guarded routes) and the stale cookie is cleared; the session row is left alone. (3) Renewal follows D-027 and re-sends the cookie with a fresh `Max-Age`. (4) `COOKIE_SECURE` defaults to on unless `APP_ENV=local`; `COOKIE_DOMAIN` unset gives a host-only cookie; the lifetime is `SESSION_TTL_DAYS` (30). (5) `requireVerified` and `requirePermission` return 401 for Visitors and 403 otherwise. (6) `app.sessions.start` and `.end` are the shared way for register, login, and logout to open and close sessions.
- Why: PRD §4, §7.1, §8 fix the cookie and the guards but not how stale, suspended, or unverified cases respond.
- Affects: M2-T05, M2-T08, M2-T15


### D-074 · Rate limiting (M2-T03)
- Status: Decided (loop)
- Decision: (1) A small Redis limiter (`modules/rate-limit/`) uses a fixed window: one Lua script does `INCR` and sets the expiry on the first hit, so all API instances share counts. The `@fastify/rate-limit` plugin is not used because login and reset limits key on the email in the request body and need a per-policy `Retry-After`. (2) `policies.ts` holds the PRD §11 table by name (`loginIp`, `loginAccount`, `register`, `passwordReset`, `resendVerification`, `reviewWrite`, `report`, `authenticatedWrite`, `anonymousRead`). The request after the limit gets 429 Problem Details with `Retry-After` (seconds to window reset). (3) PRD §11's single "password reset and resend verification" row is two policies with separate counters (3 per hour per email each), matching the separate M2-T07 and M2-T09 criteria. (4) Two limits are global: anonymous GET/HEAD per IP, and authenticated non-GET requests per user; routes opt out with `config: { rateLimit: false }` (health and ready, so load balancer probes are never counted). Other policies are per-route `rateLimit(policy, subjectOf?)` preHandlers. (5) Email and account subjects are lowercased and SHA-256 hashed before they go into a Redis key. (6) The limiter fails open when Redis is unreachable (logged as a warning; `/v1/ready` already reports Redis down), so a Redis outage doesn't take sign-in offline. (7) `buildApp` takes `redis`; without it (OpenAPI generation) no limits apply.
- Why: PRD §11 fixes the limits but not the algorithm, key scheme, or failure mode. Fixed windows are simple and cheap; the worst case is a burst of 2x the limit across a window boundary.
- Affects: M2-T05, M2-T07, M2-T08, M2-T09, M4-T04, M7 (reports)

### D-075 · Email foundation (M2-T04)
- Status: Decided (loop)
- Decision: (1) Templates use `@react-email/components` 1.x and `@react-email/render` 2.x. The PRD's "React Email 6.11" is the `react-email` package, which is only the preview CLI, so it is not installed. (2) `packages/email` exports `renderEmail(name, props)`: it validates the props with the template's Zod schema, then renders HTML and a plain-text alternative. `emailTemplates` is the registry (props schema, subject, component); every template uses `BaseLayout`. (3) Emails are sent by the `email.send` job. Its payload is a discriminated union on `template` (`to` plus that template's props), so a bad payload fails at enqueue time. Adding a template means a registry entry plus one union case. Callers put the finished link in the props; the job holds no URL logic. (4) The job retries 5 times with exponential backoff starting at 10 seconds (new optional `retry` on job definitions). Job data, including a verification link, sits in Redis until BullMQ trims completed jobs (last 100); the database still stores only token hashes. (5) `apps/api/src/email/mailer.ts` picks the transport from `EMAIL_TRANSPORT` (`smtp` via nodemailer, or `resend` via the Resend SDK). `EMAIL_FROM`, `SMTP_HOST`, and `SMTP_PORT` have local defaults; `RESEND_API_KEY` is required only for `resend`, checked when the environment loads (API and worker). `JobContext` now carries `mailer`, and `startWorker` takes it. (6) Resend is pinned to `~6.30.0`, the PRD's version, because 6.31.0 was younger than the repo's minimum release age.
- Why: PRD §7.12, §8, and D-028 fix the tools and the job but not the payload shape, retry policy, or package split.
- Affects: M2-T05, M2-T07, M2-T09, M2-T11, M4 (review decision emails), M7 (suspension email)

### D-076 · Registration (M2-T05)
- Status: Decided (loop)
- Decision: (1) `POST /v1/auth/register` takes `{ email, username, password }` and answers `201 { status: "check_your_email" }` for a new account and for a taken email alike (D-048). Only a new account gets the `rp_session` cookie, so the cookie is the one difference a caller can see; the web app must not treat its absence as an error. (2) A taken username is a 400 Problem Details with `errors: [{ path: "body.username" }]`; a breached password is a 400 with `body.password`. A taken email is checked first, so a request with both a taken email and a taken username reveals nothing. (3) The password is hashed with Argon2id before any lookup so both paths cost about the same time. (4) Passwords are capped at 128 characters so a huge body can't be used to force expensive hashing. (5) The display name starts as the username. (6) `HIBP_MODE` defaults to `live` (safe for production); `.env.example` and tests set `off`. (7) Links in emails use `WEB_URL`, or the first of `WEB_ORIGINS` when unset. (8) If queuing the email fails after the account is created, the error is logged and registration still succeeds; the resend button recovers. (9) `@node-rs/argon2` is imported with `algorithm: 2` because its `Algorithm` const enum can't be used under `verbatimModuleSyntax`.
- Why: PRD §7.1, §10, §11 and D-029/D-048 fix the behavior but not these details.
- Affects: M2-T06, M2-T07, M2-T08, M2-T10

### D-077 · Private beta signup gate (M2-T06)
- Status: Decided (loop)
- Decision: (1) `PUBLIC_SIGNUPS` defaults to `false` (closed), so a missing variable can never open registration; `.env.example` already sets it. (2) `POST /v1/auth/register` accepts an optional `inviteCode`. While signups are closed, a missing or unlisted code is a 403 Problem Details with `errors: [{ path: "body.inviteCode" }]`, checked before anything about the email or username is looked up, so the gate reveals nothing about existing accounts. (3) Codes are compared by SHA-256 digest in constant time against every listed code. Codes are trimmed and matched case-sensitively; they are not consumed (any listed code works for any number of signups). (4) `GET /v1/auth/session` exists now and returns `{ signupsOpen }`; M2-T07 adds the `viewer` field (id, username, displayName, verified, permissions, or `null`). Until then it returns no viewer.
- Why: PRD §14 and D-014 fix the flags but not the default, the error shape, or how the session endpoint is split across M2-T06 and M2-T07.
- Affects: M2-T07, M2-T10

### D-078 · Email verification and the session viewer (M2-T07)
- Status: Decided (loop)
- Decision: (1) `POST /v1/auth/verify-email` takes `{ token }` and needs no session (the link may open in another browser). One conditional UPDATE marks the token used only if it is unused, unexpired, and for purpose `verify_email`, so concurrent requests can't both succeed; the same transaction sets `email_verified_at` once. Any failure (unknown, reused, expired, wrong purpose) is one 400 with `errors: [{ path: "body.token" }]`. (2) `POST /v1/auth/resend-verification` takes an optional `{ email }`. A signed-in caller may omit it and the session's address is used (the M2-T11 banner has no other way to know it, since the viewer does not expose the email). A Visitor without an email gets a 400. The 3-per-hour policy counts the lowercased address whether or not an account exists. The reply is always `200 { status: "check_your_email" }`, for unknown, already-verified, and unverified addresses alike. Suspended and deleted accounts get nothing. (3) A resend deletes the account's earlier unused verification tokens, so only the newest link works. (4) `GET /v1/auth/session` returns `{ signupsOpen, viewer }`; `viewer` is `{ id, username, displayName, verified, permissions }` (permission names sorted, never the email or role names) or `null`.
- Why: PRD §7.1, §10, §11 fix the endpoints and limits but not the request shapes, what invalidates older links, or the viewer fields' exact form.
- Affects: M2-T10, M2-T11, M2-T18

### D-079 · Login and logout (M2-T08)
- Status: Decided (loop)
- Decision: (1) `POST /v1/auth/login` takes `{ email, password }` and returns `{ status: 'logged_in' }` with the `rp_session` cookie; the web reads the viewer from `GET /auth/session`. The login schema only requires a non-empty password (at most 128 chars), so tightening password rules never locks out old accounts. (2) Every attempt counts against `loginIp` and `loginAccount` (hashed, lowercased email), successful or not, so the 11th attempt per IP and the 6th per account in 15 minutes return 429. (3) An unknown email is verified against a decoy Argon2id hash so it costs the same as a wrong password. (4) A deleted account gets the generic 401 (D-043), even with the right password. A suspended account gets 403 "This account is suspended" (with `until YYYY-MM-DD` when `suspended_until` is set) only after a correct password (D-047); a `suspended_until` in the past is not lifted here (M7 owns lifting suspensions). (5) `POST /auth/logout` ends the current session and `/auth/logout-all` ends every session of the user; both return `{ status: 'logged_out' }` and give Visitors 401.
- Why: PRD §7.1, §10, §11 fix the endpoints and limits but not the bodies, what counts toward the limits, or how deleted accounts appear.
- Affects: M2-T09, M2-T10, M2-T13

### D-080 · Password reset (M2-T09)
- Status: Decided (loop)
- Decision: (1) `POST /v1/auth/forgot-password` takes `{ email }` and always returns `{ status: 'check_your_email' }`; it is rate-limited by the `passwordReset` policy (3 per hour per email, counted for unknown emails too). Only `active` accounts get a link; a new request deletes earlier unused reset links. (2) `POST /v1/auth/reset-password` takes `{ token, password }` (the new-password rules and breached-password check apply) and returns `{ status: 'password_reset' }`. One conditional UPDATE consumes the token (purpose `reset_password`, unused, unexpired, 1 hour), then the password hash changes and every session of the user is deleted in the same transaction. A token for a non-active account is rejected like an invalid one. (3) It does not sign the Member in; they log in with the new password. Resetting does not mark the email verified. (4) The `password-changed` email links to `/forgot-password` for "this wasn't me". No in-app notification is written yet (M2-T19 owns the bell).
- Why: PRD §7.1 and §11 fix the 1-hour link, identical response, and session end, but not the bodies, the account states, or sign-in after reset.
- Affects: M2-T10, M2-T13, M2-T19

### D-081 · Web auth pages (M2-T10)
- Status: Decided (loop)
- Decision: (1) The forms are React Hook Form with `zodResolver` and the shared schemas. A valid form is sent as JSON with `fetcher.submit` to the page's own route action, which calls the API server-side and copies the API's `Set-Cookie` headers onto its response, so the browser gets `rp_session` on the web origin's response with no cross-site request. (2) The server API client now also forwards the browser's `Origin` (falling back to the request URL's origin) and `x-forwarded-for`, because the API rejects writes without an allowed Origin (PRD §10) and rate limits by client IP. (3) API Problem Details become form messages: `errors[].path` `body.<field>` maps to that field, and a problem without field errors becomes a form-level alert using its `detail`. (4) The root loader calls `GET /v1/auth/session`; if the API is unreachable it degrades to a Visitor page (`signupsOpen: false`) and logs the error rather than breaking every page. (5) Login redirects to `/` on success. Register stays on the page and shows "Check your email" for both a new and an already-registered address (D-048, D-076). `/login` and `/register` redirect signed-in Members to `/`. (6) The invite code field is shown, and required client-side, only when `signupsOpen` is false. (7) The account menu is a `<details>` disclosure with a POST form to `/logout` (no extra dependency); `packages/ui` gains `Input` and `Label` (no Radix).
- Why: PRD §7.1 and §8 fix the pages and the form stack but not how forms reach the API, how cookies pass through SSR, or what happens after each action.
- Affects: M2-T11, M2-T19, M2-T20

### D-082 · Web verify, resend, and reset pages (M2-T11)
- Status: Decided (loop)
- Decision: (1) `/verify-email?token=` spends the token in its route loader (the emailed link is a GET) and shows success or one "expired, used, or missing" state; the page is `noindex`. A confirm button would guard against email scanners that prefetch links, but the API's token is single-use and a Member can request a new link, so the extra click is not added. (2) The unverified banner is rendered by the root layout for signed-in Members with `verified: false`, and posts to the resource route `/resend-verification`, which calls the API with an empty body (the API uses the session's address, D-078). It is hidden on `/verify-email`, because the root loader runs in parallel with that page's loader and would still see the Member as unverified. (3) `/forgot-password` shows the same "check your email" state for any address; `/reset-password?token=` reads the token in its loader, sends it with the new password, and maps a token error to a form-level message with a link to request a new link. Reset does not sign the Member in (D-080), so success links to `/login`. (4) `AppShell` gained a `bannerSlot` between header and main.
- Why: PRD §7.1 fixes the flows but not how the pages reach the API or where the banner sits.
- Affects: M2-T12

### D-083 · Accounts e2e stack (M2-T12)
- Status: Decided (loop)
- Decision: (1) The e2e stack env (`e2e/playwright.config.ts`) sets `PUBLIC_SIGNUPS=true`, `HIBP_MODE=off`, `TRUST_PROXY=true`, `WORKER_IN_PROCESS=true`, and SMTP to Mailpit, so emails are sent by an in-process worker (D-071) and no third `webServer` is needed. (2) Each spec gives its browser context a random `x-forwarded-for` (`useOwnClientIp`), because the web app forwards it to the API and the PRD §11 per-IP limits (5 registrations per hour, 11 logins per 15 minutes) would otherwise fail runs across three projects, retries, and reruns. Every run also uses a unique email and username. (3) Specs read the emailed links through the Mailpit API (`e2e/support/mailpit.ts`). (4) Observed behavior, left unchanged: after a successful registration the `/register` loader sees the new session and redirects to `/`, so the "Check your email" panel is not shown; the Member lands signed in with the verification banner.
- Why: PRD §12 lists the flows but not how the stack is wired for them.
- Affects: M2-T22, M3-T22, M4-T15

### D-084 · Own-account API (M2-T13)
- Status: Decided (loop)
- Decision: (1) `GET /v1/me` returns the Member's own account (id, email, username, displayName, bio, verified, libraryPublic, emailReviewDecisions); the email appears only here, never in the viewer. (2) `PATCH /v1/me` takes any non-empty subset of `displayName` (1 to 50 characters, trimmed), `bio` (up to 280, trimmed; an empty string or `null` clears it), `libraryPublic`, and `emailReviewDecisions`; unknown fields such as `username` are a 400. (3) `POST /v1/me/password` takes `{ currentPassword, newPassword }`. A wrong current password is a 400 with `errors: [{ path: "body.currentPassword" }]` rather than 401, so the web doesn't treat it as a signed-out Member. The new password gets the same length rule and breached-password check as registration. The transaction sets the new Argon2id hash and deletes every session except the current one; the "password changed" email is queued afterward (a queue failure is logged, not surfaced). (4) A new `passwordChange` rate limit (5 per Member per 15 minutes) stops someone with a stolen session from guessing the current password; the PRD §11 table doesn't list this endpoint. (5) The "password changed" email no longer says "signed out everywhere" (a change keeps the current session); it says other devices were signed out, which is true for both reset and change.
- Why: PRD §7.1 and §10 name the endpoints and rules but not the bodies, limits, or error shapes.
- Affects: M2-T14, M2-T19, M2-T20

### D-085 · Email change (M2-T14)
- Status: Decided (loop)
- Decision: (1) `POST /v1/me/email` takes `{ currentPassword, newEmail }` and returns `200 { status: "check_your_email" }`. A wrong password is a 400 with `body.currentPassword` (not 401, as in D-084); an address already on any account, compared without regard to case, is a 409 with `body.newEmail`. The `emailChange` policy allows 5 requests per Member per hour. (2) It stores an `auth_tokens` row (purpose `change_email`, `new_email`, 24 hours like verification, hash only) and deletes the Member's earlier unused change links, so the newest wins. It queues `email-change-confirm` (the link) to the new address and `email-change-requested` (a heads-up with a reset link) to the old one. The account's email does not change yet. (3) The PRD §10 endpoint list has no way to use the link, so `POST /v1/me/email/confirm` takes `{ token }` and needs no session (the link may open in another browser, as with verify-email). One conditional UPDATE consumes the token; the same transaction sets the new email and `email_verified_at` (the link proves the Member controls the address), for active accounts only. Any failure is one 400 with `body.token`, including when someone registered the address after the request (the unique index refuses it). (4) After the switch `email-changed` goes to both the old and the new address. Sessions stay signed in. (5) The link is `<WEB_URL>/confirm-email-change?token=...`; the web page arrives with M2-T20. In-app security notifications arrive with M2-T18.
- Why: PRD §7.1 and §7.12 fix the current-password requirement, the verify-before-effect rule, and the emails to both addresses, but not the endpoint for the link, the limits, or the error shapes.
- Affects: M2-T18, M2-T20


### D-086 · Session management API (M2-T15)
- Status: Decided (loop)
- Decision: (1) `GET /v1/me/sessions` lists the Member's unexpired sessions, most recently seen first, as `{ items: [{ id, device, ip, createdAt, lastSeenAt, current }] }`; `GET /v1/me/sessions/:id` returns one. The session `id` is the row's UUID, never the cookie token or its hash. (2) `device` is "Browser on OS" from `ua-parser-js` (approved in D-022), or "Unknown device" when the user agent is missing or unrecognized. (3) `DELETE /v1/me/sessions/:id` ends that session and returns `{ status: "session_ended" }`. A session that is unknown or belongs to another Member is a 404, so IDs can't be probed. Ending the current session also clears the cookie, like logout. (4) Expired sessions are hidden from the list and the single read but are not removed here.
- Why: PRD §7.1 and §10 fix the list and end-a-device behavior but not the response shape, the device label, or what happens when a Member ends the session they are using.
- Affects: M2-T20

### D-087 · Image storage and avatar upload (M2-T16)
- Status: Decided (loop)
- Decision: (1) Storage is an `ImageStorage` interface (`put`, `remove`, `url`) with a local-disk driver (`STORAGE_DRIVER=local`, `STORAGE_LOCAL_DIR`, served by `GET /v1/uploads/*` on the API) and an R2 driver (`@aws-sdk/client-s3`, S3 API, `IMAGE_BASE_URL` is the CDN). The env schema requires the four `R2_*` settings when the driver is `r2`. Keys are `avatars/<cover id>.webp`, so every upload has a new URL and stored objects are immutable (`Cache-Control: immutable`). (2) `POST /v1/me/avatar` takes multipart form data with one file field, needs a signed-in Member (verification is not required), and returns `{ avatarUrl }`. The kind of file comes from sharp reading the bytes (JPEG, PNG, WebP, GIF), never from the file name or MIME type; other content is a 400 with `errors: [{ path: "body.file" }]`. Files over `UPLOAD_MAX_BYTES` (5 MB) are a 413. Input is capped at 40 million pixels against decompression bombs. (3) The image is auto-rotated, cover-cropped to 256×256, and re-encoded as WebP (quality 82); sharp drops EXIF. (4) Migration `0003_covers` adds `covers` (`origin` open_library or upload, `origin_ref`, unique `r2_key`, `width`, `height`) and a nullable `users.avatar_id` (FK to `covers`, `ON DELETE SET NULL`, indexed). A new upload inserts a cover, points the user at it, and deletes the previous cover row in one transaction, then removes the old file (a failed removal is logged and leaves an orphan). (5) `GET /v1/me` gained `avatarUrl` (null until an upload). (6) The upload uses the global authenticated-write limit (120 per minute) and no dedicated policy, since PRD §11 lists none. (7) The local uploads route sets `Cross-Origin-Resource-Policy: cross-origin` (helmet's default `same-origin` would block the web app's images) and skips the anonymous read limit. (8) The worker env does not include storage settings yet; M2-T17's `accounts.erase` must add them if it deletes avatar files.
- Why: PRD §7.8, §9, and §11 fix WebP 256, R2, content sniffing, the 5 MB cap, and EXIF removal, but not the driver interface, the key layout, the request shape, or how replaced files are cleaned up.
- Affects: M2-T17, M2-T19, M3-T02

### D-088 · Account deletion and erase (M2-T17)
- Status: Decided (loop)
- Decision: (1) `DELETE /v1/me` takes `{ password }` (JSON body) and returns `200 { status: "account_deletion_scheduled" }`. A wrong password is a 400 with `body.password` (not 401, as in D-084) and shares the `passwordChange` limit (5 per Member per 15 minutes). In one transaction it sets `status = deleted` and `deleted_at = now`, deletes every session, and deletes the Member's auth tokens (unused verify, reset, and email-change links); then it clears the session cookie and queues the `account-deletion-scheduled` email to the account's address. (2) During the 30 days the row stays, so a deleted account looks like D-043: it cannot log in (generic 401), its sessions are rejected, reset and verification links are dead, and profile, library, and reviews are hidden and excluded from aggregates by the features that own them (M4 and later must filter on `users.status = 'active'`, and the M4-T02 aggregate update on deletion is owed there). The email address and username stay reserved until erase, so nobody can register them in that window; there is no self-service restore in v1, and the email says the deletion cannot be undone. The email has no reset link because reset only works for active accounts. (3) The `accounts.erase` job runs every 24 hours (Redis-scheduled with the other repeatable jobs, 3 attempts) and hard-deletes users with `deleted_at` more than `ACCOUNT_ERASE_AFTER_DAYS` (30, in `packages/shared`) before now, 100 at a time; sessions, tokens, notifications, and roles go by FK cascade, and later tables must cascade from `users` too. Avatars are not cascaded, so the job deletes the `covers` rows in the same transaction and removes the files afterward (a failed removal is logged and leaves an orphan file). Its payload takes an optional `now` (ISO time) so tests can override the clock. (4) `JobContext` now has `db` and `storage`; the worker and the in-process worker create them, and the worker env schema gained the `STORAGE_*`, `IMAGE_BASE_URL`, and `R2_*` settings (D-087 item 8). Worker and API must share the same storage config (in production both use R2). (5) Deleting the last Admin is not blocked; PRD does not say, so the owner may want a rule later.
- Why: PRD §7.1, §7.12, §9, and §10 fix the password requirement, immediate disable, 30-day erase, and the email, but not the request shape, what is cleaned up at deletion, or the job's schedule and clock handling.
- Affects: M2-T18, M2-T20, M4-T02

### D-089 · In-app notifications (M2-T18)
- Status: Implementation
- Decision: (1) `notify(executor, userId, type, data)` in `modules/notifications/notify.ts` inserts one `notifications` row and takes the caller's transaction, so a notification commits or rolls back with the change it reports. Types are the `NOTIFICATION_TYPES` in `packages/shared` (`review_approved`, `review_rejected`, `review_unpublished`, `password_changed`, `email_changed`); the review types are written from M4-T07. (2) Security notifications are written inside the transaction of the password change, the password reset, and the confirmed email change. Requesting an email change writes none, because nothing changed yet. (3) `GET /v1/me/notifications` uses page pagination (`page`, `pageSize`), newest first, and returns `unreadCount` beside `items` and `meta`. Each item is `{ id, type, data, read, createdAt }`. (4) `POST /v1/me/notifications/read` takes `{ ids }` (1 to 50) or `{ all: true }` and returns `{ unreadCount }`. IDs that belong to someone else are ignored, not an error. (5) The header bell shows the newest 10 (root loader, `pageSize=10`). Opening it posts `all: true` through the `/notifications/read` resource route, and the root loader revalidates. Items that were unread at open time stay marked for screen readers while the list is open. Notification text comes from `copy.shell.notifications.messages` by type, not from the API.
- Why: The PRD leaves the shape open; this matches the other Me endpoints and keeps strings in the copy module.
- Affects: M2-T18, M4-T07

### D-090 · Web settings: profile and avatar (M2-T19)
- Status: Decided (loop)
- Decision: (1) Settings live under one layout route `/settings` (sign-in required: a Visitor is redirected to `/login`; `noindex` on the layout and on every child) with a section nav; `/settings` redirects to `/settings/profile`, and M2-T20 adds its tab beside Profile. Each child loader also reads `GET /v1/me`, which redirects a Visitor, because child loaders run in parallel with the layout's. (2) The profile form sends all four fields (`displayName`, `bio`, `libraryPublic`, `emailReviewDecisions`) as JSON through the route action to `PATCH /v1/me`, validated on both sides with the shared `updateMeRequestSchema`; an emptied bio is sent as `null`. (3) The avatar is a separate form posting multipart data to the resource route `/settings/avatar`, which forwards it to `POST /v1/me/avatar`. The preview is a local `blob:` URL and nothing is sent until the Member presses "Upload avatar". The API's `body.file` error is shown as a form message. There is no client-side size check, so the API's 413 message is the single source for the limit. (4) The CSP `img-src` gained `blob:` (previews), and `http:` in development only (the local uploads driver serves over http). (5) `packages/ui` gained `Textarea` and `Checkbox` (a native checkbox, so keyboard and screen reader behavior come for free). (6) `sendToApi(request, method, path, body, fallback)` generalizes `postToApi` (PATCH, and a `FormData` body goes out as multipart).
- Why: PRD §7.1 and §7.8 fix what the settings edit, not the route structure, how the avatar is sent, or the preview behavior.
- Affects: M2-T20

### D-091 · Web settings: security (M2-T20)
- Status: Decided (loop)
- Decision: (1) `/settings/security` is a second tab under the `/settings` layout. Its four forms (change email, change password, end a session or log out everywhere, delete account) each use their own fetcher but post JSON with an `intent` to the one route action, which validates with the shared request schemas and forwards to the API (`POST /v1/me/email`, `POST /v1/me/password`, `DELETE /v1/me/sessions/:id`, `POST /v1/auth/logout-all`, `DELETE /v1/me`). `sendToApi` gained `DELETE`, and a `null` body sends no body. (2) The API has no "pending email change" read, so the pending state is shown from the successful response for the rest of the visit ("we sent a link to X"); it is not restored after a reload. The account's email stays the old one until the link is opened. (3) The emailed link opens `/confirm-email-change?token=`, whose loader spends the token through `POST /v1/me/email/confirm` (the same GET-spends-token approach as D-082) and shows success or "cannot be used". (4) Logging out everywhere and deleting the account forward the cleared session cookie and redirect (`/login` and `/`). Ending the current device's session does the same: every row has an "End session" button, and the current row is tagged "This device". Password change keeps this session, so the page just confirms. (5) Last-active times show in UTC, as the bell's dates do. (6) The delete button is an outlined danger-colored button, since `@reprint/ui` has no destructive variant.
- Why: PRD §7.1 fixes what security settings do, not the route shape, the pending display, or the redirects.
- Affects: M2-T22


### D-092 · First Admin command and seeded users (M2-T21)
- Status: Decided (loop)
- Decision: (1) `pnpm --filter api seed:admin -- --email … --username …` runs `src/scripts/seed-admin.ts`, which validates with the shared email, username, and password schemas (no HIBP check; it is an operator command), hashes with the API's Argon2id, and creates a verified account with the Member and Admin roles. It refuses when any user already holds the Admin role, in the same transaction as the insert. The password comes from stdin (pipe) or a terminal prompt, never from argv, so it stays out of shell history and process lists. (2) The 50 seeded users (2 Admins, 3 Moderators, 34 Members, 5 unverified, 3 suspended, 3 deleted) all share one dev password. The seed stores a precomputed Argon2id hash constant (`DEV_PASSWORD_HASH`) instead of hashing at seed time, so re-seeding is byte-identical and `packages/db` gains no hashing dependency; an API test proves the constant verifies against `DEV_PASSWORD`. (3) Because the seed creates Admins, `seed:admin` locally only works on an unseeded database.
- Why: PRD §4 and §13 name the command and the seed users but not password handling, the hash strategy, or the mix.
- Affects: M2-T22

### D-093 · Catalog schemas, ISBN, and slug utilities (M3-T01)
- Status: Decided (loop)
- Decision: (1) A slug's 6-hex suffix is the **last** 6 hex characters of the record's UUIDv7, not the first. The first 24 bits of a UUIDv7 are the high bits of a millisecond timestamp and repeat for about 4.6 hours, so records created together would collide; the tail is random. `makeSlug` also unaccents (NFKD), drops apostrophes, cuts the title part at 80 characters on a word boundary, and uses `untitled` when nothing survives (for example a title in CJK script). Uniqueness is still enforced by the `slug` unique index, and a collision is retried by the ingest service. (2) `toIsbn13` returns the digits-only ISBN-13, converting a valid ISBN-10 and passing a valid ISBN-13 through, and returns `null` for anything invalid (wrong check digit, wrong length, non-978/979 prefix). (3) A Book candidate has no RePrint IDs: `bookCandidateSchema` is `{ book, editions[≥1], sourceLink, confidence }`, where contributions name Authors by `authorName` and Subjects are raw labels. Each candidate Edition carries its own Source link (PRD §5.1: an Edition must have one). (4) Language is a lowercase 2- or 3-letter ISO 639 code, checked by shape rather than against the full ISO list. (5) Dates on Editions and Authors are `YYYY-MM-DD`; a Source that knows only a year is normalized by its adapter.
- Why: PRD §5 and §5.4 name the types and the slug shape, but not the suffix source, the ISBN failure mode, or the candidate shape.
- Affects: M3-T02, M3-T04, M3-T05, M3-T06, M3-T08

### D-094 · Catalog tables part 1 (M3-T02)
- Status: Decided (loop)
- Decision: (1) `books.primary_edition_id`, `books.cover_id`, `editions.cover_id`, and `authors.photo_id` are `ON DELETE SET NULL`; `editions.book_id` and both `contributions` FKs are `ON DELETE CASCADE`. Books are never removed in normal operation (PRD §6), so this only keeps test cleanup and admin repairs simple; later tables that hold Member data (reviews, shelves) must use `RESTRICT` on `book_id`. (2) `source_links.entity_id` points at one of several tables, so it has no FK; it is indexed on (`entity_type`, `entity_id`) and the unique index covers (`source`, `entity_type`, `source_id`). It carries the `book`, `edition`, `author`, and `series` entity types. (3) The `contributions` primary key is (`book_id`, `author_id`, `role`), so one Author can hold several Roles on a Book (author and illustrator). (4) `books.refreshed_at` is added beyond the PRD §9 column list to drive the 30-day stale refresh. (5) `books.search_vector` is a plain nullable `tsvector` filled by the ingest service; trigram indexes cover `books.title` and `authors.name`. (6) `editions.isbn_13` also has a 13-digit CHECK, and `rating_counts` a length-5 CHECK.
- Why: PRD §9 lists key columns but not delete behavior, the polymorphic link shape, the Contribution key, or the refresh timestamp.
- Affects: M3-T03, M3-T08, M3-T09, M4-T02

### D-095 · Catalog tables part 2 and the Genre data migration (M3-T03)
- Status: Decided (loop)
- Decision: (1) Migration `0005_catalog_taxonomy` creates `series`, `book_series`, `genres`, `book_genres`, `subjects` (`label` is `citext`), `book_subjects`, `subject_genre_rules`, and `merge_candidates`; `0006_seed_genres` loads the D-015 list. Join tables cascade from `books`; `genres.parent_id` is `SET NULL`. (2) The 42 Genres and 98 starter rules are reference data, so `genres` and `subject_genre_rules` join `MIGRATION_SEEDED_TABLES` and tests never empty them. (3) Rule priorities: 50 by default, 20 for broad patterns that would otherwise swamp specific ones ("magic", "success", "food", "art", "design", "health", "teen", "plays", "drama", "humor", "music", "sports", "travel", "business", "politics"), and 10 for "history", so specific fiction rules win. A `(pattern, genre_id)` pair is unique. (4) D-015 says 12 Genres are featured by default but its table marks 13 with ★; the table is followed, and an admin can change it (`featured.genres`). (5) `merge_candidates` has `status` of `pending`, `merged`, or `dismissed` (default `pending`), a free-text `reason`, a unique (`book_a_id`, `book_b_id`) pair, and a check that the two Books differ. (6) `series` carries `field_origins` like the other Source-fed Catalog tables, and `book_genres.origin` defaults to `mapping`.
- Why: PRD §9 lists key columns but not statuses, priorities, or delete behavior; D-015 supplies the Genre data.
- Affects: M3-T08, M3-T09, M3-T21, M5, M7

### D-096 · Source adapter interface, contract suite, and modes (M3-T04)
- Status: Decided (loop)
- Decision: (1) `SourceAdapter` (`apps/api/src/catalog/sources/types.ts`) has `name`, `storagePolicy` (`store`, `cache`, `none`), `trustedFields` (a map of field to priority; the lower number wins, absent means not trusted), `searchBooks(query, page)` returning `{ candidates, page, hasMore }`, `getBook`/`getAuthor` returning `null` when the Source lacks the record, `getEditions` returning a list, and optional `importBulk`. Failures to reach a Source throw `SourceError`. (2) Candidate contributions gain an optional `sourceLink` so the ingest service can call `getAuthor`; `authorRecordSchema` and `bookSearchPageSchema` join `packages/shared`. (3) `runSourceContract(adapter, fixtures)` lives in `apps/api/src/testing/source-contract.ts` (excluded from the build with the other test helpers) and takes queries, Source IDs, an empty query, and an unknown ID. (4) `createSourceAdapter(mode, { fixtures, live })` picks the adapter; `stub` is always available, and the Open Library adapter registers `fixtures` and `live` in M3-T05. (5) The `SOURCE_*` variables from `.env.example` are now validated in the API env schema with the documented defaults. (6) `pnpm --filter api fixtures:record` (`sources/open-library/record-fixtures.ts`) saves raw responses, throttled to 2 per second, identified by `User-Agent: RePrint/<version> (<email>)`; later tasks add requests to `FIXTURE_REQUESTS`.
- Why: PRD §6 names the interface methods and modes but not return shapes, the not-found convention, or the priority encoding.
- Affects: M3-T05, M3-T06, M3-T07, M3-T08


### D-097 · Open Library search translation and the vocabulary check (M3-T05)
- Status: Decided (loop)
- Decision: (1) A search result is a Work-level hit, so each becomes one Book candidate whose Source ID is the bare ID (`OL59800W`, never the `/works/` path) and whose single Edition is a placeholder (`unknown` Format, no ISBN, the cover Edition's Source link when given); `getEditions` (M3-T06) supplies real Editions. (2) Contributions come from `author_name`, the first as `author` and the rest as `co_author`, capped at 10 because compilations list hundreds of names. (3) Confidence is 1 for an ISBN search or a title equal to the query, otherwise the share of query words found in the title and Authors, scaled to at most 0.9. (4) Open Library language codes are MARC; the common ones map to ISO 639-1 and other three-letter codes pass through, while `und`, `zxx`, and `mul` become no language. An Edition takes a language only when the result lists exactly one. (5) `fixtures` mode is a `fetch` that replays the recorded response for the exact request path (404 otherwise); the recorder's author search became `q=` so the adapter and the fixture share one path. (6) A result that fails validation is skipped and reported through `onInvalid`. (7) `getBook`, `getEditions`, and `getAuthor` return `null`, `[]`, and `null` until M3-T06. (8) The vocabulary check is `scripts/check-vocabulary.sh` (`pnpm vocabulary:check`, in `pnpm check` and the CI `lint` job). The task's literal `rg` pattern matches ordinary words ("work", "solid"), so the script matches OLIDs, `/works/`, and identifiers such as `workId` across the API, web, shared, db, email, and ui sources instead.
- Why: PRD §6 leaves the search-result translation and the check's exact pattern open.
- Affects: M3-T06, M3-T08, M3-T11

### D-098 · Open Library Book, Edition, and Author translation (M3-T06)
- Status: Decided (loop)
- Decision: (1) `getBook` makes three requests: the work record (description, subjects, covers), a `search.json?q=key:/works/<id>&limit=1` result that names the byline (a work record lists only Author keys), and the first 50 Editions. `getEditions` reads the same first 50 (`EDITIONS_LIMIT`); the Catalog keeps a page of Editions, not all of a popular work's hundreds, to stay near the 10 KB per Book budget. (2) The IDs passed in must be bare (`OL<digits>W` or `OL<digits>A`); anything else returns `null`/`[]` without a request, so a caller can't steer the path. HTTP 404 is "no such record" (`null`); other failures throw `SourceError`; a redirect or malformed record is reported through `onInvalid` and treated as absent. (3) Edition ISBN-13 is the first valid value across `isbn_13` then `isbn_10`, each through `toIsbn13` (Open Library sometimes files an ISBN-10 under `isbn_13`). Format comes from the free-text `physical_format` by keyword, else `unknown`; language is the first `languages` entry through the MARC map; cover is the first positive cover ID; only a full calendar date is kept as `publishedDate` (a bare year, a month, or an ambiguous `21/06/2006` becomes `null`, never a guessed day). (4) Series exists in Open Library only as free text on Editions mixed with publisher imprints, so a Series is recognized only when the text carries a position (`Hainish Cycle, #4`, `Discworld ; 12`, `Earthsea (book 2)`); the most common name wins. Admins can correct it (PRD §6). (5) Subjects drop machine tags (`award:...`, `collection:...`), duplicates, and labels over 80 characters, capped at 25. Author `bio` accepts a string or `{ value }`; dates follow (3); alternate names are capped at 20. The Wikidata ID on an Author record is not kept: `AuthorRecord` has no field for it and no v1 feature uses it.
- Why: PRD §6 names the methods but not the request plan, the Series and date heuristics, or the Edition cap.
- Affects: M3-T07, M3-T08, M3-T09


### D-099 · Source gateway (M3-T07)
- Status: Decided (loop)
- Decision: (1) `apps/api/src/catalog/gateway/` wraps the transport `fetch` handed to a Source adapter (`openLibraryImplementations({ fetch: gateway.fetch })`), so adapters stay unaware of limits. (2) The limiter hands out one slot every `1000 / SOURCE_RATE_LIMIT_RPS` ms using the Redis clock (one Lua script), so all processes share it. Interactive callers register in a Redis sorted set while they wait; background callers are refused while it holds anyone, so interactive requests always go first. Waiters expire on their own if a process dies. (3) Callers are interactive by default; background work uses `gateway.run({ priority: 'background' }, fn)` (AsyncLocalStorage). `timeoutMs` (default `SOURCE_TIMEOUT_MS`) bounds the slot wait and the response together; search will pass `SOURCE_SEARCH_TIMEOUT_MS`. (4) The circuit breaker is per process: 5 consecutive failures (network error, timeout, 5xx, or 429) open it, 30 s cooldown, then one trial call. A 404 or other 4xx is a normal answer. A call that timed out waiting for a slot never reached the Source and does not count. (5) Metrics: `source:metrics:requests:<epoch second>` counters (2 hour TTL) and a `source:metrics:cache` hash of `hits` and `misses`; the search cache (M3-T09) calls `recordCache`.
- Why: PRD §6 sets the behavior but not the algorithm, thresholds, or key names. A per-process breaker avoids shared state that could itself fail; each process learns of an outage within five calls.
- Affects: M3-T09, M3-T11, M8-T06

### D-100 · Catalog ingest (M3-T08)
- Status: Decided (loop)
- Decision: (1) `ingestBook(db, { source, candidate, authorRecords?, rawRecord?, now? })` (`apps/api/src/catalog/ingest/`) stores one Book candidate in one transaction. The caller fetches Author records (`getAuthor`) and passes them keyed by Source ID, so ingest does no Source calls. It refuses any Source whose storage policy is not `store`, and any candidate whose Source link names a different Source (`IngestError`). (2) Matching follows PRD §5.4: Source link, then any Edition ISBN-13. Authors are matched by Source link only, since `AuthorRecord` carries no Wikidata ID (D-098); an Author is otherwise reused only when already credited on the same Book with the same name (case-insensitive), so people are never merged by name across the Catalog. (3) A newly created Book that shares a case- and accent-insensitive title and an Author name with a stored Book gets a `merge_candidates` row (`reason` `same_title_and_author`, the stored Book as `book_a_id`); nothing is merged. (4) Field origins are keyed by field name (`title`, `subtitle`, `description`, `firstPublishedYear`, `originalLanguage`, `cover`; Edition and Author fields likewise) with `{ source, at }`. A field is locked when it is in `books.locked_fields` or its origin is `admin`; a locked field is never written. An empty incoming value (null, empty list, Format `unknown`) never erases a stored one, and an unchanged value keeps its earlier origin. Per-field priority between Sources is M3-T09. `contributions`, `series`, and `subjects` are skipped for a Book when listed in `locked_fields`. (5) An Edition ISBN-13 is set once: a stored one is never replaced and one held by another Book's Edition is not taken (that Edition is counted in `skippedEditions`). An Edition with no ISBN and no Source link is matched against the Book's stored Editions by Format, Language, publisher, date, and page count. `Edition.title` from a candidate is not stored; the `editions` table has no title column. (6) A concurrent ingest of the same Source record waits on a Postgres advisory lock keyed on Source and Source ID, then finds the first one's Source link. (7) `books.search_vector` is rebuilt at the end of each ingest (`refreshSearchVector`) with the `simple` configuration over unaccented title, subtitle, Author names, Series names (weights A/B) and ISBNs (C); M3-T12 must query it the same way. (8) `source_records` gets the `rawRecord` when given, else the candidate itself (adapters return translated types, not raw responses); M3-T10 purges after 30 days. (9) Cover rows are found by (`origin`, `origin_ref`) or created; a Source never creates an `upload` cover.
- Why: PRD §5.4 and §6 fix the matching order and locking but leave the field naming, empty-value handling, ISBN conflicts, concurrency, and search vector recipe open.
- Affects: M3-T09, M3-T10, M3-T11, M3-T12, M3-T21

### D-101 · Catalog enrichment (M3-T09)
- Status: Decided (loop)
- Decision: (1) `apps/api/src/catalog/enrichment/` holds the derived-data rules; `enrichBook` runs inside the `ingestBook` transaction after Editions, Subjects, and Contributions are stored. (2) Primary Edition ranking applies its criteria in the PRD §5.1 order: English (`en`), then has a cover, then has an ISBN-13, then latest `published_date` (unknown last), then the smaller Edition ID so the choice is stable. It is recomputed on every ingest and skipped when `primaryEdition` is in `books.locked_fields` or its origin is `admin`. (3) Genre mapping gives each Subject the Genre of its best matching `subject_genre_rules` row: case-insensitive substring, highest `priority`, then the longer pattern, then pattern order. A Book gets the distinct Genres of its Subjects with `origin = mapping`. Stale `mapping` rows are deleted; `admin` rows are never changed or removed, and mapping is skipped when `genres` is locked. (4) Per-field Source priority: `planFieldUpdate` takes an optional `priorityOf(source, field)` built from each Source's `trustedFields` (stored fields map to a trusted-field name: Edition columns to `editions`, Author name and dates and bio to `authorBio`). A value another Source wrote is replaced only by a Source with an equal or lower number (a tie goes to the newer write); a Source not trusted for the field never replaces a value but may fill an empty one; the same Source may always refresh its own value; admin always wins. `ingestBook` builds the lookup from `source.trustedFields` plus the new optional `otherSources`; callers that know several Sources must pass them, otherwise earlier values from an unlisted Source count as untrusted and are replaced.
- Why: PRD §5.1, §5.4, and §6 name the rules but not the order of criteria, the mapping tie-break, the treatment of untrusted Sources, or how field names map to trusted fields.
- Affects: M3-T10, M3-T11, M3-T21, M7


### D-102 · Public catalog endpoints, caching, and refresh jobs (M3-T10)
- Status: Decided (loop)
- Decision: (1) `GET /v1/books/:slug`, `/books/:slug/editions`, and `/authors/:slug` live in `apps/api/src/modules/catalog/`. Their shared schemas are in `packages/shared/src/catalog-api.ts`. A Book's rating is `{ average, count, distribution }`, with the average rounded to two decimals (null before the first Review); the review list, "more by this author", and the viewer's own shelf and review are added by later tasks. The Book's cover falls back to its Primary Edition's. Editions are newest first, undated last. An Author's Books come grouped by Role in `CONTRIBUTION_ROLES` order, most reviewed first, with no paging. (2) Public GETs in that plugin get `Cache-Control: public, max-age=60, stale-while-revalidate=300` and a weak ETag hashed from the serialized body; a matching `If-None-Match` returns 304. Errors are never cached. (3) Viewing a Book whose `refreshed_at` is null or older than 30 days enqueues `catalog.refresh` with BullMQ priority 10 and a job ID of Book plus UTC date, so at most one job is queued per Book per day; a queue failure is logged and never fails the view. `enqueue` gained an optional `{ jobId, priority }`. (4) `catalog.refresh` re-fetches the Book from its linked Source (`getBook`, then `getAuthor` for each credited Author) through the gateway as a background request and stores it with `ingestBook`, so locked fields stay. A Book the Source no longer has only gets a new `refreshed_at`. A Book with no link to the Source is skipped. (5) `catalog.purgeSourceRecords` runs daily and deletes `source_records` older than 30 days. (6) The worker builds the Source adapter and gateway from `SOURCE_*` variables (`catalog/runtime.ts`); the worker env schema now includes them. The gateway's `User-Agent` version is `npm_package_version`, falling back to `0.0.0`.
- Why: PRD §6, §7.4, §7.5, and §10 name the endpoints and rules but not the payload shape, cache lifetimes, job dedupe, or how the worker reaches the Source.
- Affects: M3-T11, M3-T15, M3-T21, M4

### D-103 · Candidate references and `POST /v1/books/resolve` (M3-T11)
- Status: Decided (loop)
- Decision: (1) `createCandidateRefs(redis)` (`apps/api/src/catalog/candidate-refs.ts`) issues a random 24-character base64url `ref` per candidate and keeps the candidate JSON, Source link included, under `catalog:candidate:<ref>` for 24 h (D-033); `load` re-validates it with `bookCandidateSchema`. Search (M3-T13) calls `issue` for each candidate not yet on RePrint. (2) `POST /v1/books/resolve` takes `{ ref }` and returns `{ slug }`. It is public, limited to 30 per minute per IP (`bookResolve` policy), and lives in its own plugin because the catalog plugin's `onSend` hook caches every 200. (3) `resolveCandidate` returns a Book that is already stored under the candidate's Source link without calling the Source, so a stored Book opens while the Source is down. Otherwise it calls `getBook`, then `getAuthor` for each Author in parallel, then `ingestBook`. The whole fetch has `SOURCE_TIMEOUT_MS` (5 s): each Source call gets the time that is left as its gateway timeout, and a stalled adapter is cut off by a timer. (4) A `SourceError` (timeout, open breaker, Source failure) is a 503 Problem Details; an unknown or expired `ref`, or a Book the Source no longer has, is a 404. (5) `buildApp` takes `catalog: { source, interactive }` from `createCatalogRuntime`; without it (spec generation) the route exists but throws.
- Why: PRD §6 and §7.3 set the 5-second limit and the retry message but not the ref format, the rate limit, or how the deadline is shared across the Source calls.
- Affects: M3-T13, M3-T19, M6-T03

### D-104 · Catalog search and suggestions (M3-T12)
- Status: Decided (loop)
- Decision: (1) `searchCatalogBooks` and `searchCatalogAuthors` (`apps/api/src/catalog/search/catalog-search.ts`) are the Catalog half of search and are reused by M3-T13 and M3-T14. Books match when the unaccented `search_vector` matches every query word (the last as a prefix), or the title is trigram-similar (≥ 0.3), or an Author or Series name has a word close to the query (`word_similarity` ≥ 0.45). The score is `ts_rank_cd` plus title similarity; ties go to the higher `review_count`. Query text reaches SQL only as bind parameters, and only letters and digits reach the `tsquery`. (2) An ISBN-10 or ISBN-13 query, hyphenated or not, is converted to ISBN-13 before matching, because that is what the vector stores. (3) Editions have no titles of their own (D-093 and PRD §9 give them none), so "Edition titles" from PRD §6 has nothing extra to match; the Book title and ISBNs cover it. (4) `GET /v1/search/suggest?q=` returns up to 5 Books (as Book summaries) and 3 Authors. A query under 2 characters (after trimming) or a missing one is valid and returns two empty lists, not a 400; a query over 100 characters is a 400. It never touches the Source and shares the catalog plugin's `Cache-Control`/`ETag` rule.
- Why: PRD §6 and §7.3 set what is searched and the 2-character minimum but not the matching thresholds, the result sizes, or how a too-short query answers. Empty results keep the search box quiet without a validation error.
- Affects: M3-T13, M3-T14, M3-T16


### D-105 · Federated search (M3-T13)
- Status: Decided (loop)
- Decision: (1) `GET /v1/search?q=&page=` (`federatedSearch` in `apps/api/src/catalog/search/federated-search.ts`) answers `{ items, page, pageSize: 20, hasMore, sourceUnavailable }`. An item is `{ kind: 'book', book }` (a Book summary, now with `firstPublishedYear`) or `{ kind: 'candidate', candidate }` (title, cover, year, Authors, and an opaque `ref` for `POST /books/resolve`). A query under 2 characters is valid and empty. (2) The Source page is cached in Redis for 24 h under `catalog:source-search:<sha1 of the query's lowercase words>:<page>`, so "Dune" and "  dune! " share an entry. A Source error, open breaker, or no answer within `SOURCE_SEARCH_TIMEOUT_MS` (1.5 s) gives `sourceUnavailable: true` and Catalog results alone; nothing is cached for a failure, and an answer that arrives late is still cached. Hits and misses go to `gateway.metrics.recordCache`. (3) A candidate is "stored" when its Source link is linked to a Book or any of its ISBN-13s is on a stored Edition. Stored matches show as the stored Book; unmatched candidates get a ref (issued only for candidates that make the page). Each Book appears once. (4) Score: Catalog hits use the Catalog score (`ts_rank_cd` + title similarity); Source candidates use their confidence (0 to 1); a stored Book gets the higher of the two. Every stored Book adds `0.1 × ln(1 + review count)`. An exact ISBN-13 match goes first (the full ISBN handling is M3-T14). (5) Page 1 merges the top 20 Catalog hits with Source page 1 and keeps the best 20. Later pages show only Source page N, dropping stored Books that were among page 1's Catalog hits. Books cut from page 1 are not carried to page 2; the Source's own pages stay the paging model. `hasMore` is true when more than 20 were merged or the Source says there is another page. (6) The route lives in the catalog plugin, so it shares its public `Cache-Control`/`ETag` rule. It has no dedicated rate limit beyond the global anonymous read limit; the shared Source limiter protects the Source.
- Why: PRD §6 and §7.3 fix the flow but not the score scales, cache key, paging arithmetic, or response shape.
- Affects: M3-T14, M3-T16, M3-T17


### D-106 · Search filters, sorts, Authors tab, and ISBN lookup (M3-T14)
- Status: Decided (loop)
- Decision: (1) `GET /v1/search` takes `type=books|authors` (default books), `genre` (slug), `language` (ISO 639), `decade` (first year, a multiple of 10 from 1000 to 2990), `minRating` (whole stars 1 to 5), and `sort=relevance|most_reviewed|highest_rated|newest`. Bad values are 400s. (2) `genre`, `language`, and `minRating` make the search Catalog-only: the Source is not called, `sourceUnavailable` is false, and pages are Catalog offsets (`limit + 1` tells `hasMore`). A Genre filter includes the Genre's child Genres, as the Genre page does (PRD §7.5). A language filter matches a Book with any Edition in that language, not only its original language. An unknown Genre slug returns an empty page, not a 404. `minRating` compares the plain average (`rating_sum / review_count`) of Books with at least one review; the weighted rating arrives with M4-T02 and is for rankings. (3) `decade` limits Catalog Books in SQL and Source candidates (and stored Books matched from them) in code; a Book with no first published year never matches. (4) Sorts order the merged list after an exact ISBN match: `most_reviewed` by review count, `highest_rated` by average then count, `newest` by first published year (newest first, undated last); ties fall back to relevance. Source candidates have no reviews or rating, so they sort after rated Books under the first two. (5) `type=authors` searches Author names in the Catalog only (`kind: 'author'` items, paged by offset); filters and sort do not apply. (6) An ISBN query (10 or 13 digits, hyphens allowed) adds `isbnMatch` to page 1: `{ kind: 'book', slug }` for a stored Book or `{ kind: 'candidate', ref }` for a Source candidate carrying that ISBN-13, and `null` otherwise. It points at the first result, which is the exact match.
- Why: PRD §7.3 names the filters, sorts, and ISBN behavior but not the parameter formats, how Genre hierarchy and language are matched, how Source candidates sort without ratings, or the response shape for a redirect.
- Affects: M3-T16, M3-T17

### D-107 · Cover URLs and card data in the web app (M3-T15)
- Status: Implementation
- Decision: (1) `apps/web/app/lib/cover-url.ts` turns a Cover into an image URL: `cover.url` when set, otherwise the Open Library image host by cover ID (`originRef`) with size `small|medium|large` mapped to `S|M|L` and `?default=false` so a missing image returns an error, not a blank pixel. The host is origin configuration and lives in this one file. An origin with nothing to load gives the generated cover. (2) `Cover` swaps to the generated cover on `onError`, and once after mount if the image had already failed before hydration. (3) `BookCard` takes plain card data (`authorNames`, `rating: null` for a Book RePrint has not stored) and an `href`, so stored Books and search candidates share it. (4) The star glyphs are decorative; a screen-reader label carries the average and count. The average shows one decimal.
- Why: PRD §6 and §7.3 fix the fallback and the card contents, not the URL shape or component props.
- Affects: M3-T17, M3-T18, M3-T20, M6 library cards

### D-108 · Header search box is a hand-built ARIA combobox (M3-T16)
- Status: Implementation
- Decision: (1) `SearchBox` (`apps/web/app/components/shell/search-box.tsx`) is a plain-React ARIA 1.2 combobox (`role=combobox` input, `listbox` of `option`s, `aria-activedescendant`, a polite status line with the suggestion count) instead of shadcn `Command` in a `Popover`. This avoids adding `cmdk` and a Radix popover dependency for one component, and matches the header bell, which is also hand-built. (2) The browser asks the web app's resource route `GET /search/suggest?q=`, which forwards to the API's `GET /v1/search/suggest` and returns `{ books, authors }`, so the API stays server-to-server like the other loaders. A failed lookup returns no suggestions and leaves a plain search field. (3) The input sits in a `<form action="/search" method="get">`, so Enter (with no active suggestion) and the Search button work without JavaScript. With a suggestion active, Enter opens that Book (`/books/:slug`) or Author (`/authors/:slug`). (4) Escape closes the list; arrow keys wrap through the options and back to the bare input. No TanStack Query: each keystroke burst is one debounced fetch that the next keystroke aborts.
- Why: PRD §7.3 fixes the 2-character and 250 ms rules, not the widget or wiring; `docs/DESIGN.md` names `Command` in a `Popover` as intent but adding the dependencies needs a decision entry (CLAUDE.md).
- Affects: `docs/DESIGN.md` inventory (Combobox row), M3-T17 (results page reads the same `q`), M3-T18 and M3-T20 (the suggestion links target their routes)

### D-109 · Search results page (M3-T17)
- Status: Implementation
- Decision: (1) `/search` (`routes/search.tsx`, `components/search/search-results-page.tsx`) reads `q`, `type`, `language`, `decade`, `minRating`, `sort`, `page` (and `genre`) from the URL through the shared `searchQuerySchema`; a bad or empty parameter is dropped rather than failing the page (`lib/search-links.ts`). The loader calls `GET /v1/search` on first load, skips the API under 2 characters, redirects an `isbnMatch` (stored Book to `/books/:slug`, candidate to the resolve route), and shows an inline failure message with a 502 when the API is down. (2) Tabs are links (`aria-current="page"`), not ARIA tabs, since each tab is its own URL; switching tabs keeps only the query. Filters are a plain GET form (works without JavaScript) shown on the Books tab only. (3) A Book the Source found but RePrint hasn't stored links to `/resolve?ref=<candidate ref>`; M3-T19 builds that route. `resolveHref` is the one place that shape lives. (4) The language list is a fixed set of 14 common ISO 639 codes named with `Intl.DisplayNames`; decades run 2020s back to 1800s. (5) No Genre select yet: no Genre list endpoint exists until M5-T03. A `genre` value in the URL is kept by the form and shown as a removable filter; M5-T05a adds the select. Results pages are `noindex`.
- Why: PRD §7.3 fixes the tabs, filters, sorts, and paging but not the URL handling, the tab widget, the language and decade lists, or how to offer Genres before the Genres API exists.
- Affects: M3-T19 (route path), M5-T05a

### D-110 · Book page (M3-T18)
- Status: Implementation
- Decision: (1) `/books/:slug` (`routes/book.tsx`, `components/books/book-page.tsx`) loads the Book, its Editions, and the first byline Author's Books in one loader. The Book is required (404 for an unknown or malformed slug, 502 when the API fails); Editions and "More by this author" are extras that quietly drop out when their call fails. "More by" takes the Author's Books across all Roles, leaves out this Book, and stops at 6. (2) The byline groups contributions by Role (`lib/contributors.ts`): author and co-author read "by", then translated, illustrated, edited, and narrated by, each in `position` order. (3) The description is clamped with `line-clamp-6` behind a `Read more` button (`aria-expanded`, `aria-controls`). Because CSS can't tell us whether text overflows before layout, the button shows only when the text is over 320 characters or 6 lines; a text just under that may show no toggle. (4) Editions use a native `<details>`, which works without JavaScript. (5) The canonical URL is the request's own origin plus `/books/<slug>`, so it follows the host the site is served from; the meta description is the description cut to 160 characters, or a generated sentence. Open Graph tags carry title, description, URL, type `book`, and the Cover when it has a URL. (6) Series and Genre links point to `/series/:slug` and `/genres/:slug`, which arrive in M5. schema.org JSON-LD is left to the Reviews work (M4), because injecting it needs an approach that doesn't use `dangerouslySetInnerHTML`. The rating summary chart, shelf selector, and reviews are M4 and M6.
- Why: PRD §7.4 fixes the header, description collapse, Editions, and More by author, but not the failure handling, the overflow test, where the canonical host comes from, or the Role wording.
- Affects: M3-T19, M3-T20, M4 (rating summary and reviews slot into the main column), M5 (Series and Genre pages)


### D-111 · Resolve route (M3-T19)
- Status: Implementation
- Decision: (1) `/resolve?ref=` (`routes/resolve.tsx`, `components/books/resolve-page.tsx`) is a loader-only route: it POSTs the ref to `/v1/books/resolve` and redirects to `/books/<slug>`, so the wait is the browser's normal navigation with no client script. (2) Any non-404 failure (503, other status, network error) renders "We couldn't load this book right now" with status 503 and a retry. A 404, a missing ref, or a malformed ref renders "We couldn't find that book" (an expired ref lasts 24 h) with a link back to search. (3) Retry is a plain GET form to `/resolve` with the ref as a hidden field, so it re-runs the loader without JavaScript; with JavaScript it shows "Loading this book…" while the navigation is pending. (4) The page is `noindex`.
- Why: PRD §6 fixes the message and the retry button but not the failure cases, the not-found copy, or how retry works.
- Affects: M3-T22


### D-112 · Author page (M3-T20)
- Status: Implementation
- Decision: (1) `/authors/:slug` (`routes/author.tsx`, `components/books/author-page.tsx`) loads `GET /v1/authors/:slug` in one loader; an unknown or malformed slug is a 404 and an API failure a 502. (2) The API's per-Role lists are merged into six headings (Written, Translated, Illustrated, Edited, Narrated, Other contributions); a co-author Book joins Written, repeats are dropped, and the merged list is re-sorted by review count with the API's order as the tie-break. Empty groups are hidden. Each Book is a `BookCard` with its rating. (3) Life dates show years only: "1920 to 1986", "Born 1920", or "Died 1986". The photo is round and falls back to the Author's initial; other names show as "Also known as …". Missing bio shows "No biography yet". (4) The bio sits in the side column from `lg` (the Book page grid); below `lg` it follows the Books. (5) The page is indexable, with a canonical URL, a meta description (the bio cut to 160 characters, or a generated sentence), and Open Graph tags (type `profile`, photo when it has a URL).
- Why: PRD §7.5 fixes the contents, grouping, and sort but not the heading wording, co-author handling, date format, or fallbacks.
- Affects: M3-T22

### D-113 · CI on a self-hosted runner
- Status: Decided (owner)
- Decision: All CI jobs run on a self-hosted GitHub Actions runner on the owner's Mac (`runs-on: [self-hosted, reprint-ci]`). The `e2e` job uses its own Compose project `reprint-ci` with shifted host ports (`docker-compose.ci.yml`: Postgres 15432, Redis 16379, Mailpit 11025/18025) and runs the apps on 15173/13000, then removes the stack; `e2e/playwright.config.ts` reads `SMTP_PORT` from the environment. The Playwright report is uploaded only on failure. Setup and operation are in `docs/ci-runner.md`. The merge gate (D-055) and required job names are unchanged.
- Why: GitHub-hosted Actions minutes for this private repo on the free plan ran out (CI jobs refused to start on PR #66), and the owner doesn't want to pay or make the repo public. Self-hosted runners are free. Isolated ports and project name keep CI from touching the owner's local stack or a loop session on the same machine.
- Affects: `.github/workflows/ci.yml`, `docker-compose.ci.yml`, `e2e/playwright.config.ts`, `docs/ci.md`, `docs/ci-runner.md`, every PR's CI

### D-114 · Local Catalog seed (M3-T21)
- Status: Decided (loop)
- Decision: (1) The Catalog seed runs through `ingestBook`, so it lives in `apps/api` (`src/catalog/seed-catalog.ts`, run by `pnpm --filter api seed:catalog`), not in `packages/db` seed modules, which cannot import the API. Root `db:seed` and `db:reset` run the database seed, then this script; it applies the same local-only guard (`assertSeedAllowed`, now exported from `@reprint/db`) and the same local `DATABASE_URL` default. (2) It stores one recorded Book from the Open Library fixtures (through the adapter, so it is translated like a live Book) and 499 generated Books from a `seed` Source (`sources/seed/`, storage policy `store`, no lookups). Generated data: 120 Authors, about 43 Series (positions include decimal and empty), all 42 Genres through Subject labels the starter rules map, 1 to 5 Editions per Book, translations with translators, audiobooks with narrators, and missing data (no description, year, publisher, date, page count, ISBN-13, Author record, or cover). Three Books repeat another Book's title and Author under a new Source ID so the merge queue has entries. (3) Generated Books have no Cover, so the app shows the generated fallback and never requests images from a Source with invented IDs. (4) Idempotent means matching by Source link: a second run creates no Books, Editions, or Authors. It does add `source_records` rows, which the 30-day purge removes. `db:seed` still cannot run twice because the user seed is not repeatable; run `seed:catalog` alone to re-check. (5) IDs and slugs come from `newId()` in `ingestBook`, so they differ between resets; titles, Source IDs, ISBNs, and structure are identical.
- Why: PRD §13 asks for about 500 seeded Books but not how they reach the Catalog or how Source-shaped data is generated without live Sources.
- Affects: M3-T22, M3-T23


### D-115 · Reviews schema and shared review rules (M4-T01)
- Status: Implementation
- Decision: (1) `reviews.book_id` is `ON DELETE RESTRICT` (as D-094 requires for Member data); `user_id` cascades, so `accounts.erase` removes reviews, versions, and claims with one delete. `review_versions.decided_by` is `SET NULL`, so a decision survives the Moderator's erasure; `review_claims.moderator_id` cascades. (2) Status columns are checked text (`pending`, `approved`, `rejected`, `unpublished`), as in D-070-style enums elsewhere (D-080). The database also checks the rating (1 to 5), headline (at most 120 characters), and body (50 to 10,000 characters), so a bug in a later endpoint cannot store an invalid review. (3) A Review's current content lives on `reviews`; `review_versions` holds every submitted version (`version` starts at 1, unique per Review) with its own `status`, `decided_by`, `decision_reason`, and `decided_at`. The rejection reason shown to the author is the latest version's `decision_reason`, so `reviews` has no reason column. `reviews.submitted_at` is when the current content was submitted, which orders the queue (a partial index covers Pending only). (4) `review_claims` has one row per Review (`review_id` is the primary key) with `claimed_at` and `expires_at`. (5) `reviews.hidden_at` (D-040) is not added; M7-T01 adds it as a nullable column. (6) In `packages/shared`, `reviewInputSchema` trims the headline and body and counts the trimmed body against the 50-character minimum; `nextReviewStatus(from, action)` returns the new status or `null` for a transition the PRD does not allow (`from` is `null` for a Review that does not exist yet), and `canTransitionReview(from, to)` is derived from it. Editing a Pending Review keeps it Pending.
- Why: PRD §9 lists the columns and the unique constraint but not the delete rules, how a rejection reason is stored, or the exact status-change function.
- Affects: M4-T02, M4-T04, M4-T06, M4-T07, M7-T01

### D-116 · Ratings, aggregates, and the nightly recompute (M4-T02)
- Status: Implementation
- Decision: (1) `packages/shared/src/ratings.ts` holds the pure rating math: `weightedRating(totals, siteMean, c = 5)`, `siteMeanRating(totals)` (the site-wide `m`, averaged over reviews, not over Books), `averageRating` (one decimal, `null` with no reviews), and `ratingDistribution` (buckets listed 5 stars first, each with a 0-to-1 `share`). (2) `applyReviewChange(tx, bookId, before, after)` in `modules/reviews/aggregates.ts` is the only way endpoints change `review_count`, `rating_sum`, and `rating_counts`. It takes the Review's state before and after (`null` for none), removes `before` if it was Approved, and adds `after` if Approved, so an edit that sends an Approved review back to Pending drops its old rating at once, and a delete is `after = null`. Callers run it in the same transaction as the Review change. (3) Reviews by a deleted account do not count (D-043). `DELETE /v1/me` calls `removeMemberFromAggregates` in its transaction. `accounts.erase` is unchanged: the Member's Approved reviews already left the totals at deletion, so the cascade delete needs no second adjustment. (4) `ratings.recompute` runs daily (Redis-scheduled, 3 attempts). In one transaction it recomputes every Book's totals from Approved reviews of Members who are not deleted, overwrites any Book that differs, logs an error with up to 20 sample Books, and reports to Sentry (`captureError`; a no-op without a DSN). It returns `{ checked, mismatches }`. (5) The Book detail response still rounds its average to two decimals (D-102); M4-T05 changes it to one decimal as PRD §7.4 says.
- Why: PRD §7.6 and §9 fix the formula and the same-transaction rule but not who owns the update, how deletion interacts with erase, or how the nightly job reports.
- Affects: M4-T04, M4-T05, M4-T07, M4-T14, M5-T03, M5-T06

### D-117 · Audit log table and service (M4-T03)
- Status: Implementation
- Decision: (1) `audit_log` has the PRD §9 columns plus a UUIDv7 `id`. `actor_id` is a nullable FK with `ON DELETE SET NULL`, so erasing a staff account (`accounts.erase`) keeps the history; `target_id` is a nullable `uuid` (an action may have no single target, such as a featured-list change); `action` and `target_type` are plain text, validated in TypeScript against `AUDIT_ACTIONS` and `AUDIT_TARGET_TYPES` in `packages/shared`, so a new action needs no migration. Which actions are audited is D-036. (2) The `audit_log_guard` trigger raises on DELETE and on any UPDATE except two data-removing ones: `ip` to NULL when the row is over 90 days old (D-042; the later `privacy.clearOldIps` job), and `actor_id` to NULL (the FK action). TRUNCATE is not blocked, so tests can reset. (3) `recordAudit(tx, { actorId, action, targetType, targetId, before, after, ip })` is a plain insert on the caller's executor; endpoints pass their `tx` and `request.ip`. (4) The trigger is the guard everywhere. For deployed environments `docs/deploy.md` gives the SQL for a restricted app role (INSERT and SELECT, plus UPDATE on `ip`); creating that role is an owner step recorded there, not a migration, because role names differ per host.
- Why: PRD §9 says the app's role can only insert rows but not how erasure, IP expiry, or role setup work with that.
- Affects: M4-T07, M7-T03, M7-T16

### D-118 · My review endpoints (M4-T04)
- Status: Implementation
- Decision: (1) `PUT /v1/books/:slug/my-review` creates (201) or edits (200) the viewer's Review in one transaction: it locks the Review row (`FOR UPDATE`), writes the new content, sets status Pending through `nextReviewStatus`, appends a `review_versions` row (`version` = last + 1, always Pending; earlier versions keep their own decision), and calls `applyReviewChange` so an Approved review leaves the totals at once. Editing a Pending review still appends a version. Two first submissions racing past the lookup are settled by the unique (user, Book) constraint, and the loser gets 409. (2) The route is guarded by `requireVerified` then the `reviewWrite` limit (20 per user per day, counted after validation, so rejected bodies don't use it up). `GET` needs only a session; `DELETE` needs only a session too, so a Member whose email later becomes unverified can still remove their own review. (3) `GET` answers 404 when the viewer has no Review of the Book (the web panel treats that as "Write a review"). It returns `rejectionReason` from the latest version's `decision_reason`, and only while the status is Rejected. (4) `DELETE` is permanent, answers `{ status: 'review_deleted' }` (the shape other delete endpoints use), and updates the totals in the same transaction; versions and claims go by cascade. (5) An `editionId` must belong to the Book, or the request fails with 400 and a `body.editionId` error. An empty headline is stored as `null`.
- Why: PRD §7.6 and §10 name the endpoints and rules but not the status codes, the version rule for edits, or which guards `GET` and `DELETE` use.
- Affects: M4-T05, M4-T07, M4-T09

### D-119 · Public repo with GitHub-hosted CI during the build
- Status: Decided (owner)
- Decision: The owner makes the repo public for the rest of the build so GitHub-hosted Actions minutes are free and unlimited, then may make it private again later. All CI jobs go back to `runs-on: ubuntu-latest`; job names, the merge gate (D-055), and the e2e isolation from D-113 are unchanged. The self-hosted runner is removed before the repo goes public, because a fork pull request on a public repo could run code on it. `docs/ci-runner.md` stays as the fallback for when the repo is private again. Actions is set to require approval before workflows run for outside contributors.
- Why: The self-hosted runner made CI 15–25 minutes per PR; GitHub-hosted runners take about 4. The owner accepts that code, the PRD, and history are public in the meantime (anything published can't be recalled by going private).
- Affects: `.github/workflows/ci.yml`, `docs/ci.md`, `docs/ci-runner.md`, D-113

### D-120 · Public review list and the one-decimal rating summary (M4-T05)
- Status: Implementation
- Decision: (1) `GET /v1/books/:slug/reviews?sort=&rating=&page=&pageSize=` lives in `modules/reviews/routes.ts` and is public. It lists Approved reviews only, and leaves out reviews of deleted accounts (D-043); suspended Members' Approved reviews stay, matching `ratings.recompute`. Each item carries rating, headline, body, spoiler flag, `helpfulCount`, `submittedAt`, and the author's `username` and `displayName` (no email, no IDs of the author). `pageSize` defaults to 10 and may go to 50. (2) Sorts are `most_helpful` (default: `helpful_count`, then newest), `newest`, `highest`, and `lowest`; every sort ends on newest then review ID so pages never repeat or skip. "Newest" uses `submitted_at`, the time of the current content. (3) The caching hook moved from the catalog plugin to `catalog/public-cache.ts` (`publicCacheHook`) so this route shares the same `Cache-Control` and ETag rule. (4) `ratingSummary` now rounds the average to one decimal with `averageRating` from `packages/shared`, replacing D-102's two decimals. It already counted Approved reviews only, because the aggregates do (D-116).
- Why: PRD §7.4, §7.6, and §10 name the endpoint and sorts but not the item shape, tie-breaks, page size limit, or how deleted accounts are treated in the list.
- Affects: M4-T10, M5-T01

### D-121 · Moderation queue API (M4-T06)
- Status: Implementation
- Decision: (1) `modules/moderation/routes.ts` holds `GET /v1/mod/reviews`, `POST /v1/mod/reviews/:id/claim`, and `GET /v1/mod/stats`; each route has `requirePermission('reviews.moderate')` as its preHandler. (2) The queue lists Pending reviews by `submitted_at` then ID, oldest first, `limit` 1 to 50 (default 20). The cursor is base64url JSON holding the last item's `submitted_at` as Postgres text (keeps microseconds) and ID; a malformed cursor returns 400. The viewer's own Pending reviews are left out of the queue, since they cannot decide them. (3) Each item carries the Book (slug, title), the reviewer (username, display name, approved/rejected counts of their Review versions), the current version number, the last approved version (for an edit that was approved before), and an unexpired claim with `mine`. `reportedCount` is always 0 until M7-T01 adds reports; M7 must fill it. (4) A claim lasts 10 minutes (`REVIEW_CLAIM_MINUTES`) using database time. The claiming moderator can renew it; another moderator gets 409 until it expires; an expired claim is taken over in one upsert. Claiming a non-Pending review is 409, your own review 403, an unknown ID 404. Claims are not audited. (5) `/mod/stats` returns `pendingCount`, `oldestPendingAt`, and `oldestPendingAgeSeconds` (null when the queue is empty); open-report fields are added in M7.
- Why: PRD §7.10 and §10 name the endpoints but not the item shape, cursor format, claim conflict behavior, or what the queue shows for the moderator's own reviews.
- Affects: M4-T07, M4-T11, M7-T01, M7-T02

### D-122 · Approve and reject (M4-T07)
- Status: Implementation
- Decision: (1) `POST /v1/mod/reviews/:id/approve` and `/reject` take an optional `reason` (trimmed, up to 500 characters; saved phrases are a client concern, M4-T12) and return `{ reviewId, status }`. One transaction locks the review row, then sets the newest version's `status`, `decided_by`, `decision_reason`, and `decided_at`; sets the review's status and `decided_at`; calls `applyReviewChange`; deletes the claim; inserts the author's `review_approved` or `review_rejected` notification (data: `reviewId`, `bookSlug`, `bookTitle`, and `reason` when given); and writes the `review.approve` or `review.reject` audit row with `request.ip`. (2) Errors: own review 403, unknown ID 404, review not Pending 409, an unexpired claim held by another Moderator 409. Deciding without a claim is allowed, and an expired claim does not block. (3) The decision email (`review-decision` template, one neutral subject for both outcomes, with the reason on a rejection) is queued after the commit when the author's `email_review_decisions` is on; a queue failure is logged and does not undo the decision, as with other emails. The Book link uses `WEB_URL`.
- Why: PRD §7.10 and §7.12 name the actions, notification, and email but not the response shape, the reason limit, claim-less decisions, or what happens when the email cannot be queued.
- Affects: M4-T11, M4-T12, M7-T02

### D-123 · Review input components and `axe-core` in component tests (M4-T08)
- Status: Implementation
- Decision: (1) `StarRatingInput` is a controlled `role="radiogroup"` of five native radio inputs (Biome requires native elements) with a visible star glyph: one star is tabbable, and an explicit key handler (arrows, Home/End, wrap-around) moves focus and selects so it behaves the same in jsdom tests; each is labelled "N stars". (2) `SpoilerToggle` renders its children only while open, so hidden text is not in the accessibility tree. (3) `axe-core@^4` is added to `apps/web` devDependencies for the component-level axe checks; it is already the engine behind `@axe-core/playwright` (PRD §8, §12), so no new vendor. jsdom logs a harmless "HTMLCanvasElement getContext not implemented" notice from axe.
- Why: PRD §7.6 and §11 require a radio group operable by keyboard and spoilers behind a "Show spoilers" button, and M4-T08 requires a component-level axe check; the PRD does not say how.
- Affects: M4-T09, M4-T10

### D-124 · Review form and "my review" panel on the Book page (M4-T09)
- Status: Implementation
- Decision: (1) The Book route's loader also loads the session and, for a signed-in Member, `GET /v1/books/:slug/my-review` (404 or any failure means "no review"; the page still renders). (2) The Book route's `action` takes JSON `{ intent: 'save', ...review }` (validated with `reviewInputSchema`, sent as `PUT`) or `{ intent: 'delete' }` (sent as `DELETE`), and returns `{ saved }`, `{ deleted }`, or the usual form failure; after it, the loader revalidates and the panel shows the new state. (3) Unverified Members see a verify prompt instead of the form when they have no review; if they already have one they still see it and can delete it but not edit (matches D-118: PUT needs a verified account, DELETE does not). Visitors see a "Log in" link. (4) The Edition read is a native `<select>` of the Book's known Editions, hidden when there are none. (5) Delete asks for confirmation inline (an `alertdialog` region with "Yes, delete it" / "Keep it") rather than a modal, since the UI kit has no dialog component yet.
- Why: PRD §7.4 and §7.6 describe the controls but not where the save goes, how unverified Members are handled for an existing review, or the confirmation pattern.
- Affects: M4-T10, M4-T15


### D-125 · Rating summary and reviews list on the Book page (M4-T10)
- Status: Implementation
- Decision: (1) The Book loader reads `sort`, `rating`, and `page` from the page URL, validates them with `bookReviewsQuerySchema` (invalid values fall back to defaults), and loads `GET /v1/books/:slug/reviews`; if that call fails the page renders with a short notice in the list. (2) The distribution bars are links (`?rating=N#reviews`, page reset to 1; the active bar links back to the unfiltered list), so filtering works without JavaScript and is bookmarkable; the numbers also appear as screen-reader text. (3) Sort and star filter are a plain GET form (native selects), and pagination is Previous/Next links with "Page N of M". Default values are left out of URLs. (4) Review text is split into paragraphs on blank lines and rendered as text; spoiler reviews use `SpoilerToggle` (D-123). Dates use a fixed `en-US` UTC format so server and client output match. (5) The rating summary is hidden until the first Approved review; the "N people found this helpful" line appears only when the count is above 0 (voting itself is M5).
- Why: PRD §7.4 and §7.6 describe the behavior but not the URL shape, the no-JS fallback, or the empty states.
- Affects: M4-T15, M5-T02

### D-126 · Admin area shell and review queue page (M4-T11)
- Status: Implementation
- Decision: (1) `/admin` is a layout route; any of `reviews.moderate`, `reports.resolve`, `users.view`, or `audit.view` opens it (Visitors go to `/login`, other Members get a 403 page), and the left nav lists only the sections the viewer's permissions allow. Each admin page's own loader checks its permission again, because React Router runs parent and child loaders in parallel. `/admin` itself redirects to the review queue until the dashboard (M4-T13). (2) The queue page loads `GET /v1/mod/reviews` (20 per page, "Show more" link carries the cursor in the URL). Opening an item is `?review=<id>`; the loader then calls `POST /v1/mod/reviews/:id/claim`, so a reload or shared link renews the claim. A claim held by another Moderator (or a 409) is shown as a notice and the review is read-only. (3) Ages ("Waiting 3 hours") are computed from a `now` the loader supplies, so server and client render the same text. (4) The full text is shown as plain paragraphs with no spoiler toggle, since Moderators must read it all. The side-by-side diff, actions, and shortcuts are M4-T12. (5) The 403 page gets its own title and body in `ErrorPage`.
- Why: PRD §7.10 and DESIGN.md describe the layout and claiming but not the URL shape, where the claim call happens, or how pages guard themselves.
- Affects: M4-T12, M4-T13, M7-T03

### D-127 · Moderation actions, reason picker, comparison, and shortcuts (M4-T12)
- Status: Implementation
- Decision: (1) The `/admin/reviews` route `action` takes JSON `{ intent: 'approve' | 'reject', reviewId, reason? }`, checks `reviews.moderate`, and POSTs to `/v1/mod/reviews/:id/approve|reject` (an empty `{}` body when there is no reason). The API still enforces the claim, so a 409 or 403 comes back as a form error. (2) Reject opens a panel with a saved-phrase select (five phrases in `copy.admin.reviews.phrases`) that fills an editable reason textarea (500 characters); the reason is optional. Approve is one click. When another Moderator holds the claim, the buttons are replaced by a short notice. (3) After a decision the page navigates to the next item in the loaded page (or the previous one when it was last), which the loader then claims. (4) `A` approves, `R` opens the reject panel (it does not submit), and `J`/`K` open the next/previous queue item; all four are ignored while focus is in an input, textarea, select, or editable element, or when Ctrl, Meta, or Alt is held. (5) For an edited review the comparison shows the last approved version and the submitted one side by side (stacked below `md`), with each field labelled Changed or Unchanged in text, not by colour alone. The saved phrases are a starting set; M8-T04 (Community Guidelines) may reword them.
- Why: PRD §7.10 names the actions, phrases, and shortcuts without the phrase list, what `R` does, or where the page goes next.
- Affects: M4-T13, M4-T15

### D-128 · Moderation dashboard (M4-T13)
- Status: Implementation
- Decision: (1) `/admin` (the admin index route) shows the dashboard to holders of `reviews.moderate`; it loads `GET /v1/mod/stats` and shows the Pending count and the age of the oldest Pending review (same "N hours" wording as the queue). (2) The nav gets a "Dashboard" link (exact match) ahead of "Review queue" for the same permission. (3) The open-reports card is a placeholder with a dash and "Reports are not available yet." until M7 adds report counts and the oldest report age. Other admin permissions (such as `users.view` alone) still open the area but have no dashboard until their pages exist, so `/admin` answers them with 403.
- Why: PRD §7.10 describes the dashboard's contents but not who sees it or what the reports card shows before reports exist.
- Affects: M4-T16, M7-T03

### D-129 · Review seed (M4-T14)
- Status: Implementation
- Decision: (1) Sample reviews are seeded by `seed:reviews` in `apps/api` (not a `packages/db` module), run by `db:seed` and `db:reset` after `seed:catalog`, because they need Books and must update Book totals through `applyReviewChange` in one transaction. (2) A repeating list of 21 scenarios gives 2 to 5 reviews on each of the first 40 Books (by slug) from verified, active non-staff accounts: Approved (single and edited, up to 3 versions), an Approved review with a Pending edit, Pending, Rejected with and without a reason, Rejected then resubmitted (Pending or Approved), and Unpublished. (3) Running it again with reviews present does nothing.
- Why: PRD §13 asks for sample reviews in every status; the seed framework runs before any Book exists.
- Affects: M4-T15, M5-T08, M6-T09

### D-130 · E2E database helpers (M4-T15)
- Status: Implementation
- Decision: (1) The `e2e` package depends on `@reprint/db` (workspace) and `drizzle-orm` (already in the PRD §8 stack) so specs can set up state the product does not expose without a seed: `grantModerator` gives a freshly registered Member the Moderator role (CI's e2e database is migrated but not seeded), and `moveReviewToQueueFront` sets a test review's `submitted_at` to the year 2000 so it is on the first page of the oldest-first queue even on a seeded database. (2) Everything else in the specs goes through the UI: registration, email confirmation through Mailpit, writing, editing, deleting, and deciding reviews. (3) `ratings.recompute` mismatches after e2e runs are covered by the aggregate integration tests; the specs do not call it.
- Why: PRD §12 lists the flows but not how a spec gets a Moderator or finds its review in a shared queue.
- Affects: M4-T16, M7 e2e specs

### D-131 · Helpful votes (M5-T01)
- Status: Implementation
- Decision: (1) `helpful_votes` has primary key (`review_id`, `user_id`), an index on `user_id`, and cascading FKs to `reviews` and `users`. (2) `POST /v1/reviews/:id/helpful` needs a verified Member and answers 200 `{ helpful, helpfulCount }`; voting again is a no-op that returns the current count. A review that is not Approved, or whose author deleted their account, answers 404 (it is not public); voting on your own review answers 403. (3) `DELETE` needs only a signed-in Member and works on any existing review, so a vote can be taken back after the review is edited or unpublished; removing a missing vote is a no-op. (4) Both routes lock the review row and change `helpful_count` in the same transaction as the vote. (5) Votes stay on a review when it goes back to Pending or is Unpublished, and count again once it is Approved. (6) `accounts.erase` lowers `helpful_count` on every review the erased Members voted on, before the cascade deletes the votes.
- Why: PRD §7.6 settles who may vote; it leaves the status codes and edit/unpublish behavior open.
- Affects: M5-T02, M6-T08, M6-T06

### D-132 · Helpful button (M5-T02)
- Status: Implementation
- Decision: (1) The viewer's own votes come from a new authenticated `GET /v1/books/:slug/helpful-votes` (`{ reviewIds }`), loaded in the Book route loader, because the public book-reviews list is cached and shared. (2) The button calls a web resource route (`POST`/`DELETE /reviews/:id/helpful`) that forwards to the API with the session cookie, like the other client-side calls. (3) `QueryClientProvider` lives in the root `App`; the vote state is a per-review query seeded from the loader (`initialData`, infinite stale time) with an optimistic `onMutate` and rollback `onError`. (4) Only verified Members see the button, and not on their own reviews; everyone else still sees "N people found this helpful" when N > 0.
- Why: PRD §7.6 and §8 fix the behavior and TanStack Query; they leave where the viewer's votes come from open.
- Affects: M5-T08, M6-T06

### D-133 · Genre endpoints (M5-T03)
- Status: Implementation
- Decision: (1) `GET /v1/genres` returns `{ items }`, a tree of every Genre (roots first, each level by name, nesting to any depth). (2) `GET /v1/genres/:slug?sort=&page=` returns the Genre, its parent link, child links, and 20 Books per page (`hasMore`, no total). It covers the Genre and every Genre below it, not only direct children. (3) `top_rated` is `(5 × m + Σ ratings) / (5 + n)` computed in SQL, with `m` the mean over every Book in the Catalog (0 when nothing is rated), so unreviewed Books sit at `m`; `most_reviewed` is `review_count`; `newest_review` is the latest `decided_at` of an Approved review, Books with none last. Ties go to the more reviewed Book, then the Book ID. (4) Both routes are public and use the Catalog plugin's cache headers.
- Why: PRD §7.5 and §7.6 name the sorts and the weighted average; they leave paging, nesting depth, and tie-breaks open.
- Affects: M5-T05, M5-T05a, M5-T06


### D-134 · Series endpoint (M5-T04)
- Status: Implementation
- Decision: `GET /v1/series/:slug` returns `{ series: { slug, name, description }, items: [{ position, book }] }` with every Book in the Series (no paging, since a Series is short), each `book` a Book summary that carries the RePrint rating. Order is position ascending (decimal allowed), empty positions last, then title, then Book ID. The route is public and uses the Catalog plugin's cache headers. The viewer's shelf status is left to M6.
- Why: PRD §7.5 and §10 name the page and its fields; they leave the response shape, paging, and ordering ties open.
- Affects: M5-T05, M6

### D-135 · Discover rows and cache (M5-T06)
- Status: Implementation
- Decision: (1) `featured_items` (`kind` genre or review, `ref_id`, `position`, unique on `kind + ref_id`) has no foreign key because `ref_id` points at a Genre or a Review by `kind`; the builders join to the target and skip picks whose Genre is gone or whose Review is no longer Approved or its author is deleted. Browse by genre uses only `featured_items` (the older `genres.featured` flag is not read). (2) `GET /v1/discover` returns five keys, `recentlyReviewed`, `topRated`, `mostReviewedThisMonth`, `featuredGenres`, and `featuredReview`; a hidden row is `null`. Book rows hold 12 Books and are hidden below 6; the Genre row and the featured review are hidden when nothing valid is picked. "Recently reviewed" orders by the newest `decided_at` of an Approved review, and "this month" counts Approved reviews decided in the last 30 days. (3) Each row is one Redis key `discover:v1:row:<name>` holding JSON (`null` for hidden) with a 1-hour TTL, plus `discover:v1:site-mean` for `m`, which the `discover.rebuild` job (every 10 minutes) recomputes and passes to Top rated. (4) When a row key is missing, the request builds and stores all rows; when Redis is unreachable it builds them uncached rather than failing. (5) Jobs now get a `redis` client in their context. (6) The route is public and uses the Catalog cache headers.
- Why: PRD §7.2 and §9 name the rows, the 6-Book rule, and the 10-minute rebuild; they leave the key layout, row size, miss behavior, and response shape open.
- Affects: M5-T07, M5-T08, M7-T15


### D-136 · Discover home page (M5-T07)
- Status: Implementation
- Decision: `/` renders the rows from `GET /v1/discover` in the order Recently reviewed, Top rated, Most reviewed this month, Browse by genre (Genre links plus "All genres"), Featured review. A `null` row renders nothing, and when every row is `null` the page shows a short "Nothing to show here yet" line. If the API call fails, the loader logs it and the page renders as if every row were hidden instead of returning an error page. Visitors get a "Sign in / Create an account" prompt under the intro; signed-in Members do not. The featured review shows its text, spoiler toggle, author, and a link to the Book's reviews, without a helpful button (the Book page carries voting).
- Why: PRD §7.2 names the rows and says Visitors differ only by sign-in prompts; it leaves the order, failure behavior, and the featured card's controls open.
- Affects: M5-T09, M6-T03

### D-137 · Discover seed (M5-T08)
- Status: Implementation
- Decision: (1) `seed:discover` in `apps/api` (`modules/discover/seed-discover.ts`) runs after `seed:reviews` in `db:seed` and `db:reset`. It tops up the first eight reviewed Books (by slug) to six Approved reviews each, adds Helpful votes to every Approved review on those Books (the oldest review on the first Book gets the most, so "Most helpful" differs from "Newest"), picks the six Genres with the most Books as featured Genres, and features the most helpful of those reviews. Totals change through `applyReviewChange`, and `helpful_count` is set from the votes. (2) The new reviews are dated relative to the real clock (3 to 25 days ago), not the fixed seed clock, because "Most reviewed this month" counts the last 30 days from today; IDs and choices still come from the fixed seed. (3) Running it again with featured items present does nothing. (4) Redis keeps Discover rows for up to an hour, so after `db:reset` the rows show once the `discover.rebuild` job runs (every 10 minutes) or the cache expires.
- Why: PRD §13 asks for featured Genres, a featured review, and helpful votes in the sample data; Top rated needs Books with 5 or more Approved reviews, which the review seed (D-129) does not produce.
- Affects: M5-T09

### D-138 · Shelving endpoints (M6-T01)
- Status: Implementation
- Decision: `shelf_entries` (`id`, `user_id`, `book_id`, `shelf`, `added_at`, `updated_at`) is unique on (`user_id`, `book_id`); both FKs cascade. `PUT /v1/books/:slug/shelf` with `{ shelf }` upserts, so choosing another Shelf keeps the row and its `added_at` and only moves `shelf` and `updated_at`; `DELETE` removes the entry and succeeds even when none exists. Both return `{ shelf }` (`null` after removal), need only `requireAuth` (unverified Members may shelve), use the `authenticatedWrite` rate limit, and answer 404 for an unknown Book slug. The routes live in `modules/library/`.
- Why: PRD §7.7 and §10 name the routes and the one-entry rule; they leave the response shape, whether re-shelving resets the date added, and delete idempotency open.
- Affects: M6-T02, M6-T04, M6-T08


### D-139 · Viewer shelf on Book responses (M6-T02)
- Status: Implementation
- Decision: `viewerShelf` (`want_to_read|reading|read|null`, optional) is on the Book summary (search, Series, Discover, and the other lists that reuse it) and on the Book detail. Only `GET /books/:slug`, `/search`, `/series/:slug`, and `/discover` fill it: a signed-in viewer gets the Shelf or `null`, a Visitor gets no field. Genre pages and Author pages do not fill it yet. Discover rows stay cached in Redis without it; the field is added per request. A response filled for a signed-in viewer is `Cache-Control: private, max-age=0, must-revalidate`; Visitor responses stay public. Every response from the public cache hook now adds `Vary: Cookie`, so a shared cache never serves one viewer's copy to another or a Visitor copy to a Member.
- Why: PRD §7.5 and §7.7 want the current shelf on cards; they leave the field name, Visitor shape, and caching open.
- Affects: M6-T03

### D-140 · Shelf selector control (M6-T03)
- Status: Implementation
- Decision: `ShelfSelector` is a native labelled `<select>` ("Shelf for {title}") showing the current Shelf, offering Want to Read, Reading, and Read, plus "Remove" once the Book is shelved; with no Shelf it shows an "Add to shelf" placeholder. It changes through two web resource routes: `PUT/DELETE /books/:slug/shelf` (forwards to the API) and `POST /resolve` (stores a search result and returns `{ slug }`). For a not-yet-stored search result it calls `/resolve` first, remembers the slug, then shelves; a later change skips the resolve. A failed change keeps the old Shelf and shows an alert. A Visitor sees a "Sign in to shelve" link to `/login`. The card appears on the Book page header, search results (Books tab), Discover rows, and the Series page; Genre and Author pages do not carry it yet (their responses have no `viewerShelf`). The control seeds from `viewerShelf` at load and later changes live in the component.
- Why: PRD §7.7 asks for one control with "Remove" but leaves the widget, the Visitor prompt, and where the resolve call happens open.
- Affects: M6-T05

### D-141 · Library API (M6-T04)
- Status: Implementation
- Decision: `GET /v1/users/:username/library?shelf=&sort=&page=&pageSize=` returns `{ items: [{ shelf, addedAt, book }], meta, counts }`. `counts` is `{ all, want_to_read, reading, read }` for the whole Library, whatever the `shelf` filter, so the tabs always show every count; `meta.total` follows the filter. `sort` is `added_desc` (default), `added_asc`, `title` (A to Z), or `author` (first credited Author's name, Books with no Author last); ties fall back to title and entry ID. Paging uses the shared page query (`pageSize` default 20, max 50). Only `active` accounts have a Library: unknown, suspended, and deleted usernames return 404, and so does a private Library for anyone but its owner (the same 404, so its existence is not revealed). The response is always `Cache-Control: private` with `Vary: Cookie`, since privacy depends on the viewer. `book` is the shared Book summary, without `viewerShelf` (the entry's `shelf` is the owner's Shelf).
- Why: PRD §7.7 and §10 name the route, filters, and sorts; they leave the response shape, counts, caching, and which accounts count open.
- Affects: M6-T05, M6-T07, M6-T08


### D-142 · Library page (M6-T05)
- Status: Implementation
- Decision: `/u/:username/library` reads `shelf`, `sort`, and `page` from the URL (bad values fall back to the defaults) and renders Shelf tabs (All, Reading, Want to Read, Read) with counts, a GET sort form, and numbered pagination. Cards are in a grid (1 column at base, 2 at `sm`, 3 at `lg`). The owner (the root session's username matches, case-insensitively) gets a `ShelfSelector` on each card seeded from the entry's Shelf; a change or "Remove" takes effect on the next load and the card stays in place until then. When the API answers 404 the page renders "This library is private, or it doesn't exist" with HTTP status 404, so a private Library and an unknown account look the same (D-141). The page is `noindex`.
- Why: PRD §7.7 and `docs/DESIGN.md` leave the grid, the owner's inline control, and the private wording open.
- Affects: M6-T07, M6-T10

### D-143 · Profiles API (M6-T06)
- Status: Implementation
- Decision: `GET /v1/users/:username` returns `{ username, displayName, bio, avatarUrl, joinedAt, reviewCount, helpfulVotes, libraryPublic }`. `reviewCount` counts the Member's Approved Reviews, and `helpfulVotes` is the sum of `helpful_count` over those same Reviews (a Review that is later unpublished stops counting). `libraryPublic` lets the web page decide whether to show the Library tab (the owner always sees it). `GET /v1/users/:username/reviews?page=&pageSize=` lists Approved Reviews newest first (ties by ID) as the public review fields plus the Book summary, with no `author` (it is the profile's Member). Only `active` accounts have a profile: unknown, suspended, and deleted usernames return 404. Nothing depends on the viewer, so both routes use the public cache hook (`Cache-Control: public`, ETag).
- Why: PRD §7.8 and §10 name the routes and totals; they leave the response shapes, what counts as a helpful vote received, and which accounts have a profile open.
- Affects: M6-T07, M6-T08


### D-144 · Profile page (M6-T07)
- Status: Implementation
- Decision: `/u/:username` loads the profile and the first page of Approved Reviews in parallel (`?page=` in the URL; a bad value falls back to page 1). The Reviews tab is the page itself; the Library tab is a link to `/u/:username/library`, shown when `libraryPublic` is true or the viewer is the owner (case-insensitive match on the root session's username). Each review shows its Book card, rating, headline, date, and body (spoilers behind the usual toggle); there is no Helpful button here. A missing avatar shows the display name's initial. The page has a canonical URL, a meta description, and Open Graph tags; any 404 from the profile route renders the 404 page.
- Why: PRD §7.8 names the tabs and totals but not the tab mechanics, review layout, or pagination.
- Affects: M6-T10

### D-145 · Data export (M6-T08)
- Status: Implementation
- Decision: `GET /v1/me/export` returns one JSON document (`memberExportSchema`) with `account`, `profile`, `reviews` (each with its versions, any status), `helpfulVotes` the Member cast, `library`, `notifications`, and `sessions`. Books appear as `{ slug, title }`. It leaves out password and token hashes, Moderator IDs on decisions, and other Members' data. The response is `Cache-Control: no-store` with `Content-Disposition: attachment`. Settings → Security offers a plain download link to the web resource route `/settings/export`, which proxies the API.
- Why: PRD §11 requires a JSON download but names no endpoint or contents.
- Affects: M7-T01 (adds reports to the export)


### D-146 · Library seed (M6-T09)
- Status: Implementation
- Decision: `pnpm --filter api seed:libraries` (run by `db:seed` and `db:reset` after `seed:discover`) gives the first 14 reviewers (username order) a Library of 6 to 13 Books: 2 to 4 they reviewed and 4 to 9 they did not, chosen from the first 120 Books by slug, with Shelves cycled from a random start so every Library covers all three. It sets `libraryPublic` explicitly: the first four are private, the rest public. It lives in `apps/api` beside the other Book-dependent seeds and does nothing when any Shelf entry exists.
- Why: PRD §13 asks for sample data but not its shape; the mix exercises the "independent of reviews" rule and the private Library state.
- Affects: M6-T10

### D-147 · Reports and auto-hide (M7-T01)
- Status: Implementation
- Decision: (1) `review_reports` has one row per reporter per Review (unique), a `reason` (`unmarked_spoiler`, `offensive`, `spam`, `off_topic`, `other`), an optional trimmed `note` (at most 500 characters, required for `other`), a `status` (`open`, `dismissed`, `actioned`), and `resolved_by`, `resolution`, `resolved_at` for M7-T02. Both FKs cascade, so `accounts.erase` removes a Member's reports and the reports on their reviews with no extra step; `resolved_by` is `SET NULL`. (2) `POST /v1/reviews/:id/reports` takes `{ reason, note? }` and returns `{ status: "report_received" }`. It needs a verified Member (401 and 403 otherwise), the `report` rate limit (20 per day), and a Review that is Approved and by a Member who has not deleted their account (anything else is 404, as for helpful votes). Reporting your own review is 403 and a second report is 409. (3) The route locks the Review row, inserts the report, counts open reports, and sets `reviews.hidden_at` (kept if already set) at 3 or more, all in one transaction, so concurrent reports cannot miss the threshold. (4) `hidden_at` removes a Review from the public Book review list, profile reviews and totals, Discover rows and the featured review, and the Genre `newest_review` sort; the Review stays Approved, still counts in the Book's rating (D-046), and its author still sees it as Approved. M7-T02 clears `hidden_at` on dismiss. A hidden review can still receive reports and helpful votes from a page that was already open. (5) The export gains `reports`: the reports the Member filed, with Book, reason, note, and status (not reports on their own reviews, which would reveal other Members).
- Why: PRD §7.9 and §9 set the rules and columns but not the response, the error cases, or what hiding removes.
- Affects: M7-T02, M7-T06, M7-T17

### D-148 · Reports queue, dismiss, and unpublish (M7-T02)
- Status: Implementation
- Decision: (1) `GET /v1/mod/reports` and `POST /v1/mod/reports/:reviewId/dismiss` need `reports.resolve`; `POST /v1/mod/reviews/:id/unpublish` needs `reviews.moderate` (PRD §4). (2) The queue lists Reviews that have open reports, ordered by their oldest open report then Review ID, with the same base64url cursor as the review queue (`moderation/cursor.ts`). Each item has the Review (status, `hidden`, Book, author with ID for M7-T05, content), `openCount`, `oldestReportedAt`, and the open reports (reason, note, reporter, time). A Moderator's own Reviews are left out, and they get 403 on dismiss and unpublish for them. (3) Dismiss closes every open report as `dismissed` (optional reason, kept in `resolution`), clears `hidden_at`, and audits `report.dismiss`; with no open reports it is 409. (4) Unpublish needs an Approved Review (else 409) and a reason (1 to 500 characters). Like a decision, it adds a Review version with status `unpublished` (the seed's shape), sets the Review to Unpublished and clears `hidden_at`, removes it from the Book's aggregates, closes its open reports as `actioned`, notifies the author (`review_unpublished`, with the reason), queues the review-decision email when the author allows it (the template gained `unpublished`), and audits `review.unpublish`, all in one transaction except the email job. (4) `/mod/stats` gains `openReportCount`, `oldestOpenReportAt`, and `oldestOpenReportAgeSeconds`. (5) The review queue's `reportedCount` is the number of reports filed on the reviewer's Reviews, whatever their outcome.
- Why: PRD §7.10 and §10 name the endpoints and actions but not the payloads, the error cases, or what each closes.
- Affects: M7-T06, M7-T17


### D-149 · Admin users API (M7-T03)
- Status: Implementation
- Decision: (1) `GET /v1/admin/users` and `GET /v1/admin/users/:id` need `users.view`. Which view the caller gets depends on `audit.view` (held only by Admins), checked in the handler as a capability, never a role name: the full view adds email, email verification time, sessions (unexpired, with IP), and audit history; the limited view (D-044) has none of those and `email` is null. A search by email is ignored for the limited view (it matches username only) so a search cannot reveal an email. (2) The list is newest first by join time, cursor-paginated with the same opaque cursor as the Moderation queues. `q` is a case-insensitive substring of username or email (`%` and `_` are matched literally); `role` is one role; `joinedFrom` and `joinedTo` are inclusive UTC dates. (3) Status is derived: `unverified` is an `active` account with no verified email, so `active` filters to verified accounts only; `suspended` and `deleted` follow `users.status`. (4) Each item carries Approved review count and reports received (any status, on the user's Reviews). Detail adds Reviews by status, reports filed and received, and the audit history: up to 50 entries that target the user or were done by them, newest first. A suspension reason is not stored yet; M7-T05 adds it with suspend.
- Why: PRD §4 and §7.11 name the fields but not the filters' exact meaning, the limited view's mechanism, or the audit scope.
- Affects: M7-T04, M7-T05, M7-T07

### D-150 · Role management (M7-T04)
- Status: Implementation
- Decision: (1) `PUT` and `DELETE /v1/admin/users/:id/roles/:role` need `roles.assign` and return `200 { userId, roles, changed }`. Only `moderator` and `admin` can be named (anything else is a 400): every account is a Member, so that role is never granted or removed. (2) Both are idempotent: granting a held role or removing one not held returns `changed: false` and writes no audit row. A change writes `role.grant` or `role.remove` (target type `user`) with `{ roles }` before and after, in the same transaction. (3) A deleted account is a 409 and an unknown id a 404. (4) Removing your own Admin role when no other account holds it is a 409; the transaction locks the user row and every Admin grant, so two Admins removing themselves at once cannot both succeed. Removing another Admin's role is never blocked, and neither is a suspended Admin counting as "another Admin" (the PRD says only "last Admin").
- Why: PRD §4 and §7.11 name the endpoints and the last-Admin rule but not the payloads, idempotence, or the locking.
- Affects: M7-T07, M7-T17


### D-151 · Suspensions, session revocation, and verification resend (M7-T05)

- Status: Implementation
- Decision: (1) `POST /v1/admin/users/:id/suspend` (`{ reason, until? }`), `/unsuspend`, and `/revoke-sessions` need `users.suspend`; `/resend-verification` needs `users.view`, because it only mails the account's own address and shows no data (Moderators may use it). Suspending sets `status`, `suspended_until`, and the new nullable `users.suspended_reason`, deletes every session, writes `user.suspend`, and queues the `account-suspended` email (reason and end date) after the commit. `until` must be in the future; an Admin cannot suspend themselves (409), and suspending a deleted or already suspended account is a 409, as is unsuspending an account that is not suspended. Revoking writes `session.revoke` with target type `user` and the number of sessions ended. A resend deletes the earlier unused link, writes `user.resend_verification`, and sends nothing (`sent: false`, no audit row) for a verified account; suspended and deleted accounts are a 409. (2) A suspension with an end date is lifted by the `users.lift_suspensions` job (every 5 minutes, `now` override for tests) and also at login, so a Member is not kept out until the next run. Automatic lifts write no audit row, since no Moderator or Admin acted. (3) The detail response gains `suspendedReason`, shown in the full view only.
- Why: PRD §4, §7.11, and §10 name the actions but not the permissions of the resend, the lift mechanism, or the payloads.
- Affects: M7-T07, M7-T17

### D-152 · Report dialog and Reports queue pages (M7-T06)

- Status: Implementation
- Decision: (1) The report dialog is a native modal `<dialog>` opened from a "Report" button next to the helpful vote on the Book page's review list; it posts to a resource route (`/reviews/:id/report`) that forwards to `POST /v1/reviews/:id/reports`. No dialog library was added. It is shown to verified Members on other Members' reviews, the same rule as the helpful vote (the profile page's review list has no report button yet). (2) `/admin/reports` needs `reports.resolve`. Unpublish needs `reviews.moderate` and "Suspend author" needs `users.suspend`, so each button is shown only to a viewer holding that permission, and the action refuses the call otherwise. Suspend author takes a reason and an optional end date; a date-only value means the end of that day, UTC. (3) The Reports queue link appears in the admin nav for `reports.resolve`; the dashboard card shows the open report count and the oldest report's age from `/v1/mod/stats`.
- Why: PRD §7.9 and §7.10 name the actions but not the permissions behind each button, the dialog pattern, or where the report button appears.
- Affects: M7-T07, M7-T17

### D-153 · Admin users pages (M7-T07)

- Status: Implementation
- Decision: (1) `/admin/users` is a plain GET form, so the search text, role, status, join dates, and cursor all live in the URL; empty or invalid values are dropped rather than shown as an error. It needs `users.view`; the email column and email search appear only with `audit.view` (the full view, D-149). The list is a table with the name linking to the detail page, and "Show more" carries the filters and cursor. (2) `/admin/users/:id` shows the profile, reviews by status, reports, and, in the full view, sessions and audit history. Role buttons need `roles.assign`; Suspend, Unsuspend, and End all sessions need `users.suspend`; Resend verification (shown only for unverified accounts) needs `users.view` (D-151). Each button is hidden without its permission and the action refuses the call otherwise. (3) Suspend takes a reason and an optional end date; a date-only value means the end of that day, UTC (same as the Reports queue). (4) The "Users" nav link appears for `users.view`. The audit history is a short list (action, actor, time); the full table and filters are M7-T08.
- Why: PRD §7.11 lists the actions but not their permissions, the URL state, or the layout.
- Affects: M7-T08, M7-T17

### D-154 · Audit log API and page (M7-T08)

- Status: Implementation
- Decision: (1) `GET /v1/admin/audit` and `/v1/admin/audit.csv` need `audit.view` (Admins only, PRD §4); there is no limited view. (2) Filters are `actor` (exact username), `action`, `targetType`, `targetId`, and inclusive UTC `from` and `to` dates; the list is newest first with the same opaque cursor as the other admin lists. (3) The CSV streams in batches of 500 by walking the same cursor, so it never holds the whole log in memory, and has the columns id, created_at, actor, action, target_type, target_id, ip, before, after (before and after as JSON text). Cells starting with `=`, `+`, `-`, `@`, tab, or carriage return get a leading apostrophe, and cells with commas, quotes, or line breaks are quoted. (4) Reading or exporting the log is not itself audited (PRD §4: reads are not audited). (5) The web page is `/admin/audit`, a plain GET form like `/admin/users`; the export link goes through a resource route (`/admin/audit.csv`) that forwards the filters and the download headers.
- Why: PRD §7.11 says the log can be filtered and exported but does not name the filters, the CSV columns, or the injection rule.
- Affects: M7-T17, M7-T18


### D-155 · Admin Catalog editing (M7-T09)

- Status: Implementation
- Decision: (1) `PATCH /v1/admin/books/:id` needs the new `catalog.manage` permission (migration `0014` adds it as data and grants it to Admin only, D-045; Moderators get 403). (2) The body edits any of `title`, `description` (nullable), `genreIds`, `series` (`{ name, position }`, position decimal or null), and `contributions` (`{ authorId }` or `{ name }`, plus `role`; at least one). Only fields present are changed, and `genreIds`, `series`, and `contributions` replace the whole list. At least one field is required. (3) Every field present is stamped `admin` in `field_origins` and added to `locked_fields` under the names the ingest code already checks (`title`, `description`, `genres`, `series`, `contributions`), even when the value did not change, so an Admin can lock a field on purpose. Genre rows written are `origin = admin`. (4) A Series is matched by case-insensitive name or created; a new Contribution by `name` always creates a new Author (never matched by name, D-100). Unknown Genre or Author IDs, a repeated Series, and a repeated Author and Role are 400s. (5) The slug does not change with the title (it ends in a stable ID fragment). The search vector is rebuilt in the same transaction (D-034). (6) One `book.edit` audit row per request holds the edited fields before and after (Genres as slugs), written in the same transaction. (7) The response is the Book's editable view with `lockedFields` and `fieldOrigins`, for the M7-T13 page.
- Why: The PRD lists what an Admin can edit but not the request shape, the permission name, or how lists are edited.
- Affects: M7-T10, M7-T11, M7-T13

### D-156 · Admin cover upload, Primary Edition choice, and refresh (M7-T10)

- Status: Implementation
- Decision: (1) `POST /v1/admin/books/:id/cover` (multipart, `catalog.manage`) follows the M2 upload rules (sniffed by content, 5 MB cap, EXIF stripped) and stores a WebP at most 600 px wide (never enlarged) under `covers/<id>.webp`. It creates a Cover with origin `upload`, sets it on the Book, stamps `cover` as an admin field, and locks it. An earlier uploaded cover of the Book is deleted; a Source cover is only a reference and is left alone. Audit action `cover.upload`. (2) The Primary Edition is set through `PATCH /v1/admin/books/:id` with `primaryEditionId` (it must be one of the Book's Editions, else 400). It locks `primaryEdition` and is audited as `book.primary_edition` when it is the only field changed, otherwise `book.edit`. (3) `POST /v1/admin/books/:id/refresh` returns 202 `{ status: "refresh_queued" }` after queueing `catalog.refresh` with `interactive: true` and BullMQ priority 1 (page-view refreshes use 10); the job then makes its Source calls at interactive priority with a 15 s timeout per call. Refresh goes through `ingestBook`, so locked fields stay. Audit action `book.refresh`. (4) `toCover` fills `url` for uploaded covers from the storage driver (`configureUploadUrls`, set once in `buildApp`), so the web shows them with no change. (5) `AdminBook` gained `cover` and `primaryEditionId`.
- Why: PRD §7.11 and §10 list these admin actions but not the endpoint shapes, image size, or how a refresh gets priority.
- Affects: M7-T13

### D-157 · Merge queue and Book merge (M7-T11)

- Status: Implementation
- Decision: (1) `GET /v1/admin/books/merge-candidates` (pending only, oldest first, cursor pagination, each item with both Books: slug, title, authors, Edition count, review count, Shelf entry count, cover), `POST /v1/admin/books/merge-candidates/:id/dismiss` (200, 409 if already decided, audited as `merge.dismiss`), and `POST /v1/admin/books/merge` all need `catalog.manage`. (2) The merge body is `{ fromBookId, intoBookId }`: the first Book is removed and the second remains, so the Admin picks the survivor. The request is rejected with 400 when both are the same and 404 when either is unknown. (3) In one transaction, with both Books row-locked in ID order: reviews, Editions, and Book Source links move to the remaining Book; Contributions, Genres (an `admin` origin wins), Series, and Subjects are copied unless the remaining Book already has them; a Shelf entry moves unless the Member already shelved the remaining Book (then the removed Book's entry is dropped with it); the remaining Book keeps its own fields and only fills a missing description, cover, or Primary Edition. (4) It returns 409 before changing anything if one Member reviewed both Books, whatever the review status. (5) The remaining Book's `review_count`, `rating_sum`, and `rating_counts` are recounted from its Approved reviews in the same transaction. (6) Pending candidates that named the removed Book are copied to name the remaining Book; the pair's own candidate goes with the removed Book (cascade), so a `merged` status is never stored. (7) A `book_slug_redirects` table (migration `0015`) maps the old slug to the remaining Book, and earlier redirects to the removed Book move too. `GET /v1/books/:slug` and `/books/:slug/editions` find the Book through a redirect; the web Book page answers an old slug with a 301 to the remaining slug. (8) One `book.merge` audit row holds the removed Book and the moved counts.
- Why: PRD §5.4, §7.11, and §10 say a merge moves reviews and shelves and fails on a shared reviewer, but not the request shape, how conflicts resolve, or how the old URL behaves.
- Affects: M7-T14

### D-158 · Genre, Subject-rule, and Catalog stats endpoints (M7-T12)

- Status: Implementation
- Decision: (1) All need `catalog.manage`. `GET /v1/admin/genres` lists every Genre (archived too) with `bookCount` and `ruleCount`; `POST /v1/admin/genres` (201) takes `slug`, `name`, `description`, `parentId`; `PATCH /v1/admin/genres/:id` edits any of those plus `archived` (true archives, false restores). Slugs are lowercase hyphenated words and unique (409 when taken). The `featured` flag is not editable here (M7-T15 owns featured Genres). (2) "Archive" is the nullable `genres.archived_at` column (migration `0016`); Genres are never deleted. An archived Genre is hidden from `GET /v1/genres`, `/genres/:slug` (404), child links, and Discover's featured Genres, and is skipped by Subject mapping, so a re-ingest drops its `mapping` rows but never `admin` rows. Books keep their existing `book_genres` rows. A new rule or parent cannot name an archived Genre. (3) Genres are two levels deep (PRD §7.5 and the search filter assume it): a parent must be a live top-level Genre, a Genre with children cannot get a parent, and a Genre cannot be its own parent (400). A Genre with live children cannot be archived (409). (4) `GET /v1/admin/subject-rules` lists rules (highest priority first, with the Genre); `POST` takes `pattern`, `genreId`, `priority` (0 to 1000, default 50; 409 for an existing pattern and Genre pair); `DELETE /:id` removes one. Editing a rule is delete plus add. Changes apply to Books on their next ingest or refresh; nothing is remapped in bulk. (5) `GET /v1/admin/catalog/stats` returns `totals` (Books, Editions, Authors) and `monthly`, the last 12 calendar months (UTC, oldest first, `YYYY-MM`) with the Books, Editions, and Authors created in each. (6) Audit actions are the existing `genre.change` and `subject_rule.change`, with before and after values (a create has no before; a delete has no after).
- Why: PRD §5.4, §6, and §7.11 name Genre and rule management and growth stats but not archive semantics, hierarchy limits, or the response shapes.
- Affects: M7-T14, M7-T15


### D-159 · Admin Book edit page (M7-T13)

- Status: Implementation
- Decision: (1) `GET /v1/admin/books/:id` (`catalog.manage`) returns the editable view from D-155 plus the Book's Editions (`id`, `isbn13`, `format`, `language`, `publisherName`, `publishedDate`), so the page can offer the Primary Edition choice; 404 for an unknown Book. (2) `/admin/books/:id` loads that and `GET /v1/admin/genres` (archived Genres are hidden from the choices). Any holder of `catalog.manage` can open the admin area, and the page itself checks the permission (403 otherwise). (3) The form sends only the field groups that changed, because every field sent is locked (D-155); Contributions already on the Book keep their `authorId` and only their role is editable, and a new row creates a new Author by name. A Primary Edition cannot be cleared back to automatic once set. (4) The Cover goes up as multipart through the route action; refresh posts JSON. No nav link is added yet; M7-T14 adds the Catalog section links.
- Why: PRD §7.11 lists the editable fields but not the read endpoint, how locks show, or how the form avoids locking untouched fields.
- Affects: M7-T14


### D-160 · Admin Catalog pages (M7-T14)

- Status: Implementation
- Decision: (1) Three pages under `/admin/catalog`, all needing `catalog.manage` (403 otherwise): the dashboard (`/admin/catalog`, Catalog size and a 12-month growth table from `GET /v1/admin/catalog/stats`), the merge queue (`/admin/catalog/merge`), and Genres and rules (`/admin/catalog/genres`). The admin nav shows all three to holders of `catalog.manage`. (2) A candidate pair shows both Books side by side (Cover, Authors, Edition, review, and Shelf entry counts, an Edit link to `/admin/books/:id`). Merge is a two-step choice: "Keep <title>" opens a confirmation naming which Book is removed, then "Merge Books" posts `{ fromBookId, intoBookId }`; the API's 409 (a Member reviewed both) is shown as the form error. "Not a duplicate" dismisses the pair. Merged and dismissed pairs stay on the page with a status line until the next load. (3) Genres are edited in place (only changed fields are sent), archived and restored with one button, and added with a form; parent choices are live top-level Genres. Subject rules are added (pattern, Genre, priority 0 to 1000, default 50) and removed; editing a rule is remove plus add (D-158). (4) The featured flag stays out of this page (M7-T15).
- Why: PRD §6 and §7.11 name these tools but not how a merge direction is chosen or confirmed.
- Affects: M7-T15

### D-161 · Featured content (M7-T15)

- Status: Implementation
- Decision: (1) Migration `0017` adds `featured.manage` (Moderator, Admin) and `featured.genres` (Admin) as data, per D-045. (2) `GET /v1/admin/featured` (`featured.manage`) returns the featured Genres in order, every live Genre to choose from, the featured review with its Book, and up to 20 Approved reviews to pick from (most helpful first); the PRD lists only the `PUT`. (3) `PUT /v1/admin/featured` takes `genreIds` (an ordered list of at most 12 live Genres, replacing the list; also needs `featured.genres`, checked in a second preHandler that reads the body) and/or `reviewId` (one Approved, not auto-hidden review, or `null` to clear). At least one is required. Everything commits in one transaction with one `featured.change` audit row (before and after hold Genre slugs and the review id). (4) `genres.featured` is kept equal to the picks so the public Genre list agrees. (5) The route then rebuilds the Discover cache directly (best-effort: a Redis failure is logged, and the 10-minute job catches up). (6) `/admin/featured` offers move up/down, add, and remove for Genres (read-only text for Moderators) and a pick list of candidates for the review.
- Why: PRD §7.2 and §7.11 name the content but not how it is read, picked, or kept consistent with `genres.featured`.
- Affects: M7-T17, M7-T18

### D-162 · IP retention job (M7-T16)

- Decision: `privacy.clearOldIps` (daily, 3 attempts; payload takes an optional `now` for tests) calls `clearOldIps` in `modules/audit/retention.ts`. In one transaction it sets `ip` to NULL on `sessions` (by `created_at`) and `audit_log` rows older than 90 days (`IP_RETENTION_DAYS`). The `audit_log_guard` trigger (D-037, D-042) already permits only this update and judges age by the database clock, so the audit cutoff is `least(now - 90 days, database now() - 90 days)`: a `now` override ahead of the database clock is capped instead of aborting the job. No migration was needed. The upper-bound check on the trigger and the DELETE refusal are covered by existing and new integration tests.
- Affects: M7-T16, M7-T18

### D-163 · SEO meta helper (M8-T01)

- Decision: every page route builds its `meta` with `pageMeta` (`apps/web/app/lib/seo.ts`): title, description (falling back to `copy.seo.defaultDescription`), a canonical link, `robots: noindex` when asked, and Open Graph tags for Book, Author, Genre, Series, profile, and home. The canonical URL is the root loader's `origin` (new in the root loader data, from `request.url`) plus the page path with no query string. A Genre page keeps `?page=N` for N > 1, because each page lists different Books. Book, Author, and profile keep the canonical URL their loaders already build. `noindex` covers admin, settings, the auth pages (login, register, forgot and reset password, verify and confirm email), search, resolve, and Libraries. `GET /v1/users/:username` gains `verified` (the email is verified) so the profile page is `noindex` for unverified Members (PRD §11). A route manifest test (`routes/seo.test.ts`) fails when a page route has no canonical URL or description, or has the wrong `noindex`.
- Why: PRD §7.4 and §11 require a canonical URL and description everywhere and `noindex` on admin, unverified, and non-content pages; where `noindex` applies to auth pages and Libraries is not spelled out.
- Affects: M8-T01, M8-T02, M8-T03

### D-164 · JSON-LD structured data (M8-T02)

- Decision: `lib/json-ld.ts` builds the schema.org nodes from the loader data and each loader returns them as `jsonLd`; the route renders them through `components/seo/json-ld.tsx`, a `<script type="application/ld+json">` whose text is `JSON.stringify` output with `<` (and U+2028/U+2029) escaped, so no `dangerouslySetInnerHTML` is needed and the Biome ban stays on. Book pages emit `Book` (Primary Edition ISBN, pages, publisher, format; authors are the `author` and `co_author` Roles only), `AggregateRating` only when the Book has Approved Reviews, and a `Review` for each Review in the list on the page (so it follows the page, sort, and star filter); Author pages emit `Person`. Book (Home › first Genre › Book), Author, Genre (Home › Genres › parent › Genre), and Series pages emit `BreadcrumbList`. All URLs are absolute, from the request origin.

### D-165 · Sitemaps (M8-T03)

- Decision: the daily `sitemaps.build` job (`modules/sitemaps/build.ts`) lists the home page, `/genres`, and every Genre (not archived), Book, Author, Series, and public profile (active and email-verified, the same rule that keeps unverified profiles `noindex`). It splits the list into chunks of at most 50,000 URLs and stores them in Redis (`sitemap:v1:index` and `sitemap:v1:chunk:N`, three-day TTL), writing chunks before the index and deleting chunks left over from a longer earlier build. The API serves the structured data (`GET /v1/sitemaps`, `GET /v1/sitemaps/:number`, 404 before the first build) with paths only; the web app renders the XML because it knows the public origin (`/sitemap.xml`, `/sitemaps/N.xml`). `robots.txt` disallows `/admin` and `/settings` and names the sitemap; other `noindex` pages stay crawlable so crawlers can read the tag.
- Why: Redis needs no new storage or migration, matches the Discover cache (D-135), and keeps the origin out of the worker. Holding all paths in memory during a build is fine at v1 scale; switch to keyset paging if the Catalog reaches millions of rows.

### D-166 · Legal and static pages (M8-T04)

- Decision: About, Terms, Privacy, Community Guidelines, and Contact are server-rendered routes (`/about`, `/terms`, `/privacy`, `/community-guidelines`, `/contact`) built from one `StaticPage` component, with all copy in `copy.legal`. Each shows a `DRAFT – owner review` note. The Contact page shows a placeholder where the contact address goes, because the PRD names no address (the owner supplies it in M8-T14). Community Guidelines list the five report reasons from PRD §7.10 as the rejection reasons. The pages are not added to the sitemap yet.
- Why: one component keeps the five pages consistent and makes the copy easy to translate or replace; the placeholder avoids inventing a mailbox.

### D-167 · Cookieless analytics and success-metric events (M8-T05)

- Decision: the web server reads `VITE_ANALYTICS_DOMAIN` and `VITE_ANALYTICS_SCRIPT_URL` (default Plausible's `script.js`) at request time and the root loader returns them as `analytics` (null when no domain is set, or the URL is invalid). `<Analytics>` adds the script after hydration, from the nonced entry script, so `strict-dynamic` allows it; a queue stub on `window.plausible` keeps events fired before the script loads. The script's origin is added to the CSP `connect-src` and `script-src` (the host is for browsers without `strict-dynamic`). Three custom events (`ANALYTICS_EVENTS` in `lib/analytics.ts`): `Search Result Click` (following a result's title on `/search`, stored or not), `Review Submitted` (a save the server accepted, including a resubmitted edit), and `Shelf Added` (with the Shelf as a prop; removing a Book fires nothing). Events carry no Book, Member, or query data. The `VITE_` names from `.env.example` are kept, though they are read at runtime rather than inlined at build.
- Why: runtime config lets one build serve staging and production with analytics on or off; creating the script client-side avoids threading the nonce through hydration; the events map to the PRD §2 metrics for discovery and reviews.
- Affects: M8-T05

### D-168 · Alert signals and the monitor job (M8-T06)

- Decision: `system.monitor` runs every minute in the worker (`modules/ops/monitor.ts`) and returns the alerts that hold, each reported through `captureAlert` (a Sentry message at `error` level with tag `alert:<signal>` and fingerprint `alert:<signal>`). Signals: `queue_stuck` (more than 1,000 waiting or prioritized jobs, or the oldest of the first 100 older than 15 minutes), `review_queue_stale` (oldest `pending` review older than 48 hours), `source_breaker_open`, and `source_usage_high` (average Source requests per second over the last hour above 70% of `SOURCE_RATE_LIMIT_RPS`). The circuit breaker is per process, so the gateway publishes a Redis key (`source:metrics:breaker-open`) with a TTL of twice the cooldown when it opens, and clears it on the next success; the monitor reads that key. The job context gains `queue`, `sourceRps`, and `alert`. The job has no retry: the next run is a minute away. `docs/runbooks/alerts.md` maps every PRD §11 alert to its signal and the rule the owner sets up.
- Why: the worker and API are separate processes, so breaker state needs a shared place; a stable tag and fingerprint let Sentry rules route and group alerts; "above 70% for an hour" is read as the hour's average, which the per-second counters (kept for two hours) can answer exactly.
- Affects: M8-T06, M8-T07

### D-169 · Admin system dashboard (M8-T07)

- Decision: `GET /v1/admin/system` (`modules/admin/system.ts`) needs `catalog.manage`, which only Admins hold, so no new permission or migration. Requests per second is the average over the last 60 seconds of the per-second counters; the cache hit rate is lifetime hits over lookups (null before the first lookup); queue numbers come from the BullMQ queue, so `buildApp` takes a `queue` option next to `jobs`. The page `/admin/system` re-runs its loader every 30 seconds with `useRevalidator`, and the nav link shows with `catalog.manage`.
- Why: the PRD names the dashboard "Admin only" without a permission; reusing the Admin-only `catalog.manage` avoids a migration for a read-only page. A one-minute average smooths a single quiet second, and the lifetime cache counter is all M3-T07 keeps.
- Affects: M8-T07

### D-170 · Load and web vitals tooling (M8-T08)

- Decision: the k6 scenario (`load/k6/mixed-read-heavy.js`) is a constant-arrival-rate run with a fixed mix (25% search, 5% shelf writes, 70% reads). Writes need signed-in Members, so they come from `LOAD_MEMBERS` (none means no writes). `SPREAD_IPS=true` sends random `X-Forwarded-For` values so one generator can pass the per-IP read limit on a target that trusts the header. `pnpm load:smoke` uses the `k6` binary or falls back to the `grafana/k6` Docker image, at 3 requests per second for 30 seconds with the seeded `member1` and `member2`. The web vitals check is a Playwright spec that runs in the `mobile` project only (CDP throttling is Chromium-only), with the `web-vitals` package (already allowed by D-022's list) added to `e2e` as a dev dependency.
- Why: the PRD gives the targets but not the mix or how to get past its own rate limits; the shelf write is the only cheap authenticated write that needs no email or review state. The smoke rate stays under 300 reads per minute so it works from one machine.
- Affects: M8-T08, M8-T15

### D-171 · ASVS L2 preparation (M8-T10)
- `docs/security/asvs-l2.md` maps the authentication, session, and access-control requirements to code and tests. `apps/api/src/security-docs.test.ts` fails when a test named in the map no longer exists, so the map can't rot silently.
- Gaps found are filed as tasks (M8-T17), not fixed here: they change session behavior, and this task is preparation. The pre-launch sign-off (M8-T15) is the owner's.

### D-172 · Backups and restore drill (M8-T11)
- Decision: `scripts/backup.sh` writes a `pg_dump --format=custom --no-owner --no-privileges` archive and checks it with `pg_restore --list`; `scripts/restore.sh` restores one into an empty database whose name starts with `scratch` or `restore` and prints exact row counts per table. `PG_RUN` lets either script run the Postgres tools elsewhere (the drill uses the Compose container when no Postgres 18 client is installed). `backup.yml` installs `postgresql-client-18` from the PGDG repository, uploads to `daily/` in the backups bucket with the AWS CLI against R2's S3 endpoint, and compares stored and local sizes. The 30-day lifecycle rule is a JSON file applied once by the owner (M8-T13), not by the workflow, so the backup token needs no bucket-admin rights. The drill is a new required CI job, `restore-drill`, also run by `pnpm check` (`pnpm backup:drill`). The secret is `PRODUCTION_DATABASE_URL_DIRECT` (renamed from the `.env.example` placeholder `PRODUCTION_DATABASE_URL`, to match the staging name and because `pg_dump` needs a direct URL).
- Why: the PRD names the layers (Neon PITR, nightly dump to R2 for 30 days, a drill) but not the tooling. Custom format restores selectively and compresses; refusing non-scratch targets prevents restoring over production by mistake. The CI drill is the only automated proof that dumps restore.
- Affects: M8-T13, M8-T15


### D-173 · Absolute session lifetime (M8-T17)
- Decision: `SESSION_MAX_DAYS` (default 90, 1 to 730) is the longest a session lives from `sessions.created_at`. The session lookup in `session-plugin.ts` refuses an older session whatever its sliding `expires_at` says, and clears the cookie; no migration is needed. A value below `SESSION_TTL_DAYS` is raised to it.
- Why: the PRD asks for sessions to end but gives no number. 90 days is three sliding windows, so a regular reader signs in about quarterly and a stolen cookie cannot live forever.
- Affects: `docs/security/asvs-l2.md`, `.env.example`

### D-174 · Security overrides for transitive dependencies
- Status: Implementation
- Decision: When `pnpm audit --audit-level high` fails on a transitive dependency whose parents haven't released a patched range, add a narrow entry under `overrides:` in `pnpm-workspace.yaml` (`<pkg>@<vulnerable-range>: ^<patched>`) with the advisory ID in a comment, instead of `pnpm audit --fix update` (which re-resolves the whole lockfile and rewrites manifest ranges). Remove the entry once every parent requires a patched version. First entry: `source-map-js@<1.2.2` → `^1.2.2` for GHSA-68fv-2mgg-jv7q (high), reached only through build and test tooling (vite > postcss, vitest coverage).
- Why: Keeps a security fix to one package (17 lockfile lines) so it's easy to review and revert, and unblocks the `audit` CI job for every PR.
- Affects: `pnpm-workspace.yaml`, `pnpm-lock.yaml`, the `audit` CI job

### D-175 · Free-tier staging on platform URLs
- Status: Decided (owner)
- Decision: Staging uses free plans: Neon free (database), Render free web service from `render.staging.yaml` (one instance, no pre-deploy command, jobs in-process with `WORKER_IN_PROCESS=true`, local disk for uploads), Render Key Value free, Netlify free (builds stopped; the "Deploy staging" workflow deploys after migrations), and Resend free with the shared `onboarding@resend.dev` sender. No custom domain: the browser only talks to the Netlify site, whose server calls the API and passes the session cookie through, so `COOKIE_DOMAIN` stays unset and the cookie is host-only on the Netlify URL. A scheduled workflow (`keep-staging-warm.yml`, every 10 minutes, only when `STAGING_API_URL` is set) keeps the free API from sleeping, because a cold start takes longer than the Netlify SSR function waits. Sentry is left off. Per-PR previews stay skipped (M1-T21, M1-T22). Production keeps `render.yaml` (paid) per PRD §13; that is an M8-T13 decision.
- Why: The owner wants staging without paid services; this keeps `render.yaml` intact for production while the staging deploy workflow (M1-T18) already supports free-tier staging.
- Affects: `render.staging.yaml`, `.github/workflows/keep-staging-warm.yml`, `docs/deploy.md`, M1-T19 to M1-T22, M8-T12

### D-176 · Visual redesign and light theme (M9)
- Status: Decided (owner). Proposes a change to PRD §8 (dark palette `#0f172a` / `#3b82f6` / `#f8fafc`).
- Decision: The web UI moves to the redesign on the owner's design canvas ("RePrint Redesign"), specified in `docs/DESIGN.md`, and to a light theme, which replaces the dark theme entirely: one theme, no switcher, `color-scheme: light`. Palette: warm off-white background `#fbfaf7`, white surfaces, navy text `#0f172a`, blue accent `#2563eb` with white text, links `#1d4ed8`, and a deep amber `#a8500a` for stars (also the new `warning`). Two new tokens: `ground-deep` (`#f3efe8`, hero bands and footer) and `star`. Every text pair passes 4.5:1 and every UI boundary 3:1 on all four grounds. The redesign also adds a reading serif for titles, review headlines, and descriptions (D-180); cover-first rows; designed generated covers whose colour is picked from the Book's slug; an in-page section nav and Details panel on the Book page; series and author cards; an Editions format filter; and "More by this author" and "More in <Genre>" rows built from existing Author and Genre endpoints. Nothing looks or works like a store: no prices, carts, or buy links.
- Why: The owner asked for higher engagement and easier access to book information, using Open Library, AbeBooks, Barnes & Noble, and Bookshop as references, without becoming a store. After comparing both themes on the canvas, the owner chose light and asked to drop dark altogether. The PRD's brand blue is kept, darkened one step so white text on it passes AA.
- Affects: M9-T01 to M9-T08, `docs/DESIGN.md`, `packages/ui/src/theme.css`, `packages/ui/src/theme.test.ts`, `CLAUDE.md` (repo layout note)

### D-177 · Review excerpts on Discover and in search results
- Status: Decided (owner)
- Decision: Two places show short excerpts of Approved reviews. (1) Discover gets a `justApproved` row: the newest Approved reviews, one per Book, up to 6, built by the same 10-minute `discover.rebuild` job and hidden under 3 items. (2) Each Catalog Book in search results gets `topReview`: its most helpful Approved review (ties to newest), or `null`. Both use one shared `reviewExcerptSchema` (review id, rating, headline, excerpt, author username and display name, approved-at time). The excerpt is the headline if there is one, otherwise the body cut at a word boundary to at most 200 characters with an ellipsis, as plain text. Reviews marked as containing spoilers, and auto-hidden reviews (3 or more open reports, D-046), are never excerpted; anything the Book page's review list would not show is never excerpted either. Source candidates have no excerpt.
- Why: The PRD's Discover and search show Books only; the owner approved showing what readers said, because the moderated reviews are RePrint's differentiator. Skipping spoiler reviews means an excerpt never needs a spoiler toggle.
- Affects: `packages/shared/src/discover-api.ts`, `packages/shared/src/search-api.ts`, `packages/shared/src/reviews.ts`, M9-T03, M9-T05, M9-T07

### D-178 · Shelf counts on Books (withdrawn)
- Status: Withdrawn (owner)
- Decision: No "N readers have shelved it" count and no `books.shelved_count` column. The owner proposed it during the redesign and then decided it is not needed.
- Why: Recorded so the number is not reused and the idea is not re-proposed without the owner.
- Affects: none

### D-179 · Monthly review count on "Most reviewed this month"
- Status: Decided (owner)
- Decision: Each item in Discover's `mostReviewedThisMonth` row carries `recentReviewCount`, the number of Approved reviews in the last `DISCOVER_RECENT_DAYS` (30) that the row is already ranked by. The web shows it as "46 new reviews". The row's item schema becomes `bookSummarySchema.extend({ recentReviewCount })`; other rows keep plain `bookSummarySchema`.
- Why: The row's builder already computes this count; showing it explains the ranking and signals activity.
- Affects: `packages/shared/src/discover-api.ts`, the Discover row builders, M9-T04, M9-T05

### D-180 · Web fonts: Newsreader and Instrument Sans, self-hosted from Google Fonts files
- Status: Decided (owner)
- Decision: Titles, review headlines, and long text use Newsreader (variable, optical size and weight); UI text uses Instrument Sans (variable). Both are Google Fonts under the SIL Open Font License, installed from the Fontsource packages `@fontsource-variable/newsreader` and `@fontsource-variable/instrument-sans`, which repackage the Google Fonts files. They are bundled and served from RePrint's own origin, not from `fonts.googleapis.com`. Only the Latin subsets are imported, the two WOFF2 files used above the fold are preloaded from the root route, `font-display: swap` is kept, and the fallback stacks use metric-adjusted `@font-face` overrides (`size-adjust`, `ascent-override`) so the swap does not push CLS over 0.1. This entry also adds both packages to the allowed dependencies (D-022). It replaces `docs/DESIGN.md`'s earlier "no web fonts" rule.
- Why: The owner asked for Google Fonts. Linking Google's CDN would need `fonts.googleapis.com` and `fonts.gstatic.com` in the CSP (`style-src` and `font-src` are `'self'` in `apps/web/app/lib/csp.server.ts`) and would send every visitor's IP address to Google, against PRD §11 Privacy (collect the minimum; no third-party trackers). Self-hosting the same files avoids both, and keeps the PRD §11 LCP and CLS targets in reach.
- Affects: `apps/web` (root route preloads), `packages/ui/src/theme.css` (`--font-sans`, `--font-serif`), `docs/DESIGN.md`, M9-T01

### D-181 · `accent-hover` token and Latin-only font faces (M9-T01)
- Status: Decided (loop, implementation detail)
- Decision: The primary button's hover colour is a solid `accent-hover` (`#1d4ed8`, 6.7:1 with white text) instead of `accent` at 90% opacity, which over the light ground fell below 4.5:1 (axe `color-contrast`). The web fonts are declared in `apps/web/app/fonts.css` with Latin-only `@font-face` rules pointing at the Fontsource WOFF2 files, plus `Newsreader Fallback` and `Instrument Sans Fallback` faces with metric overrides; `packages/ui/src/theme.css` only names the families in `--font-sans` and `--font-serif`.
- Why: Fontsource's own CSS also declares the Cyrillic, Greek, and Vietnamese subsets, which D-180 excludes. Keeping `@font-face` in the web app keeps the UI package free of file paths.
- Affects: `packages/ui/src/theme.css`, `packages/ui/src/components/button.tsx`, `apps/web/app/fonts.css`, `docs/DESIGN.md`

### D-182 · Excerpt fields: the headline stays separate from the excerpt (M9-T03)
- Status: Decided (loop)
- Decision: `reviewExcerptSchema` carries `headline` (the Review's own, or `null`) and `excerpt` (the body as one line of plain text, whitespace collapsed, cut at the last word boundary that fits 200 characters including a trailing `…`, trailing punctuation dropped). D-177's "the headline if there is one, otherwise the body" is read as "the web shows the headline as the title and the excerpt below it". `approvedAt` is `decided_at`, falling back to `submitted_at`. The excerpt rules live in `excerptOf` and `EXCERPTABLE_REVIEW` (`apps/api/src/modules/reviews/excerpts.ts`); reviews by deleted accounts are also left out (D-043). The Discover cache key is now `discover:v2` because a row was added.
- Why: The D-177 field list names both `headline` and `excerpt`, so they have to be separate fields; the web can still lead with the headline.
- Affects: `packages/shared/src/reviews.ts`, `discover-api.ts`, `search-api.ts`, M9-T05, M9-T07

### D-183 · Discover cache key `discover:v3` for `recentReviewCount`
- Status: Decided (loop)
- Decision: `mostReviewedThisMonth` items use `mostReviewedItemSchema` (`bookSummarySchema` plus `recentReviewCount`, D-179). The row builder takes the count from the same query that ranks the row. The Discover cache key is now `discover:v3`, so rows cached with the old shape are never served against the new response schema.
- Affects: `packages/shared/src/discover-api.ts`, `apps/api/src/modules/discover/`

### D-184 · Search redesign without new API facets (M9-T07)
- Status: Decided (loop)
- Decision: The `/search` filters stay the existing GET form (Genre, language, first-published decade, minimum rating, sort) in a 260 px panel from `lg` and a disclosure below it; the one form is opened on wide screens, so there is no second copy of the fields. DESIGN's Genre checkbox counts and decade chips need facet counts the search API does not return, and numbered pagination needs a total; both are left out, so pagination stays Previous / Next with the page number. The `AuthorMatchCard` comes from a second `GET /v1/search?type=authors` call in the loader (Books tab, page 1, only when the query is searchable); `matchAuthor` accepts an Author whose name contains every word of the query (a single word under 4 letters never matches), and any failure skips the card. The card shows the name only, since `authorSuggestionSchema` has no dates or Book count. Series line and Genre chips on results are also left out: `bookSummarySchema` carries neither.
- Why: Adding facets, totals, or Series and Genre fields to the search response is an API change the task did not scope; it can be a later task if the owner wants it.
- Affects: `apps/web/app/routes/search.tsx`, `apps/web/app/lib/author-match.ts`, `apps/web/app/components/search/`

### D-185 · No inline `style` attributes; widths and cover colours are classes (M9-T08)
- Status: Decided (loop)
- Decision: Components never set `style={…}`. Generated cover colours use 12 whole-string Tailwind classes (`generatedCoverClass`), and star fills and rating bars use a 5%-step width lookup (`widthClass`). A unit test fails if any `.tsx` component sets a `style` prop.
- Why: The CSP is `style-src 'self'` (PRD §11), which blocks style attributes. The M9 components used them, which produced about 150 violations per page on a seeded database; CI's e2e database is empty, so it never saw them. Stars now move in quarter-star steps.
- Affects: `apps/web/app/lib/width-class.ts`, `apps/web/app/lib/cover-color.ts`, `Cover`, `StarRating`, `RatingBreakdown`, `RatingSummary`

### D-186 · `StarRating` sizes to its five stars (M9-T09)
- Status: Decided (loop)
- Decision: The `StarRating` root has `w-max`, so its box is exactly as wide as the five stars even as a stretched flex item.
- Why: The fill is a percentage of the root's width. In the rating breakdown's flex column at phone width the root stretched to the full column, so a 3.0 average filled the whole (wider) box and showed five filled stars.
- Affects: `apps/web/app/components/books/star-rating.tsx`, `e2e/specs/star-rating.spec.ts`

### D-187 · Local e2e on an isolated `reprint-e2e` stack (M9-T10)
- Status: Decided (loop)
- Decision: `pnpm test:e2e` runs `e2e/run.mjs`. Without `CI` or `E2E_STACK=external` it starts or reuses Compose project `reprint-e2e` (`docker-compose.e2e.yml`: Postgres 25432, Redis 26379, Mailpit 21025/28025), migrates it, and runs Playwright with the apps on 25173/23000. `DATABASE_URL_DIRECT` is set too, so a `.env` value cannot redirect the migration to the dev database. CI is unchanged.
- Why: local runs wrote test Books, Members, and reviews into the `reprint` database used by `pnpm dev`. Separate ports also stop specs from reusing a running dev server.
- Affects: `e2e/run.mjs`, `e2e/package.json`, `docker-compose.e2e.yml`, `docs/local-dev.md`

### D-188 · Match the redesign canvas (M9-T11)
- Status: Decided (owner asked for it; details are implementation)
- Decision: The shell, Discover, Book page, and search results now follow the owner's design canvas ("RePrint Redesign") board by board, at desktop and phone widths. Choices the canvas left to code: (1) `Button` is a pill (`rounded-full`, semibold, 44 px default) everywhere, including admin pages, and `@reprint/ui` must be rebuilt for the web app to see it. (2) The shelf control keeps its native `<select>` in every look; the new `icon` (bookmark on a cover), `outline`, and `primary` variants draw the button and lay the invisible select over it, so keyboard and screen reader use is unchanged. A Visitor gets a link to `/login` in the same shape. (3) The header search box shows the current query on `/search`, so the results page drops its second search field; sort moves above the results as its own GET form with an Apply button, and the filter panel keeps D-184's fields. (4) Discover shows the top 5 of "Most reviewed this month" and 3 "Just approved" excerpts, as drawn; "Recently reviewed" (PRD §7.2) stays, below them. Genre tiles fan three generated colours picked from the Genre's slug (decoration only). (5) On phones the hero's search field and "Try" chips are hidden (the header search sits right above), "Create account" moves out of the header (the sign-up pitch and log-in page still offer it), and the main links sit behind a menu button. (6) Initials avatars stand in for reviewer photos, coloured by username from a fixed class list (no inline styles, D-185).
- Not matched, because the API does not send the data: reviewer totals ("38 reviews · 412 helpful votes") and the "edition read" tag on review cards, "See all" and arrow buttons on Top rated (no such page), and D-184's facet counts and numbered pagination on search.
- Why: The owner reported that the M9 build did not look like the canvas.
- Affects: `packages/ui/src/components/button.tsx`, `apps/web/app/components/{shell,books,reviews,search}/`, `apps/web/app/copy/index.ts`, `apps/web/app/lib/avatar.ts`
