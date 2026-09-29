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

