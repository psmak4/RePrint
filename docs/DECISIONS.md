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
