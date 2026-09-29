# M8 · Launch readiness

## Goal

Make v1 findable, measurable, recoverable, and provably safe: SEO and structured data, legal pages, cookieless analytics, alerting, backups with a restore drill, a load test, an accessibility audit, a security review, and a tag-driven production release. After this milestone, the owner can tag `v1.0.0`.

## PRD sections covered

§2 (metrics via analytics events), §3 (milestone 8), §6 (headroom dashboard, circuit-breaker alert), §7.4 (SEO: schema.org Book, AggregateRating, Review, Open Graph), §7.13 (legal and static pages), §11 (SEO, accessibility, privacy, performance targets, reliability and observability, alerts, backups, ASVS), §12 (load test with k6, axe on every page, release pipeline step 7), §13 (production environment, DNS, CDN, Resend domain).

## Deliverables

- Canonical URL, meta description, Open Graph, and `noindex` rules on every route.
- JSON-LD for Book, AggregateRating, Review, Person, and BreadcrumbList.
- Nightly chunked sitemaps, `/sitemap.xml`, and `robots.txt`.
- Terms, Privacy (GDPR/CCPA), Community Guidelines, About, and Contact pages (draft copy, then owner-approved).
- Cookieless analytics with success-metric events (PRD §2).
- The `system.monitor` job and `docs/runbooks/alerts.md`; the `/admin/system` dashboard (Source rps, cache hit rate, breaker, queues).
- k6 scenario, `pnpm load:smoke`, web vitals check, `docs/performance.md`.
- Axe coverage of every page type; `docs/a11y.md` with the manual screen-reader script.
- `docs/security/asvs-l2.md` with gaps closed.
- Nightly backup workflow to R2, `scripts/restore.sh`, `docs/runbooks/restore.md`.
- `release.yml`: tag → migrate → API and worker → web → smoke tests → Sentry release and source maps.

## Acceptance criteria

1. Every page has a canonical URL and meta description; admin, settings, auth, and unverified-Member profile pages are `noindex`.
2. The book page's JSON-LD validates as `Book` with `AggregateRating` and `Review`; Author pages emit `Person`; breadcrumbs emit `BreadcrumbList`.
3. The nightly sitemap job produces an index plus chunks covering Books, Authors, Genres, Series, and public profiles.
4. Legal pages exist, are linked in the footer, and have owner-approved copy (M8-T14).
5. Analytics sets no cookies (verified in e2e) and records search → book click, review submitted, and shelf added.
6. The monitor job raises a tagged Sentry event for each PRD §11 alert condition (queue stuck, oldest pending review > 48 h, breaker open, Source usage > 70% for an hour); the owner has routed them to email and Slack.
7. `pnpm load:smoke` passes locally; the full k6 run against staging meets 200 rps for 10 minutes with < 1% errors and the p95 targets (owner-run, M8-T15).
8. Axe reports zero serious or critical issues on every page type; the owner completes the VoiceOver and NVDA pass.
9. The ASVS L2 checklist is complete and signed off; `pnpm audit` and Gitleaks are clean.
10. A backup restores successfully into a scratch database (drill recorded); tagging `v*` deploys production in order and runs smoke tests.

## Implementation choices (recorded in `docs/DECISIONS.md`)

- JSON-LD is rendered through a small safe `<JsonLd>` component (serializes and escapes `<`) so the `dangerouslySetInnerHTML` ban stays intact.
- Alerts are raised as Sentry events with stable tags; routing to email and Slack is configured by the owner in Sentry.
- Backups run as a scheduled GitHub Actions workflow (`pg_dump` → R2), not on Render.
- Web vitals are measured with Playwright plus the `web-vitals` library in a dedicated spec (a dependency decision is recorded).
- Analytics provider defaults to Plausible (owner to confirm).

## Out of scope

- Post-launch features (following, feeds, MFA, a second Source).
- Actually tagging `v1.0.0` (the owner's call after this milestone).

## Human prerequisites

- **M8-T13:** production Neon (PITR ≥ 7 days), Render, Netlify, Cloudflare DNS (`www`, `api`, `img`), R2 buckets, Resend `mail.reprint.com` (SPF, DKIM, DMARC), Sentry alert routing, uptime monitor, GitHub production secrets, first Admin.
- **M8-T14:** final legal and static page copy.
- **M8-T15:** staging load test, screen-reader pass, ASVS sign-off, restore drill.
