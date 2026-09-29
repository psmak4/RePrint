# M1 · Foundation

## Goal

Stand up the monorepo, local services, database tooling, both app skeletons, the design system, and a CI pipeline strong enough that the loop can safely merge its own PRs. At the end, every command in `CLAUDE.md` works, and every later milestone only adds features on top of it.

## PRD sections covered

§3 (milestone 1), §8 (layout, stack, key decisions), §9 (conventions), §10 (conventions: validation, Problem Details, Origin check, OpenAPI, `/health`, `/ready`), §11 (security headers, logging, Sentry, Gitleaks, audit, Renovate), §12 (test layers, pipeline steps 1–6, migration rule), §13 (environments, local setup, Render, Netlify).

## Deliverables

- pnpm + Turborepo monorepo: `apps/web`, `apps/api`, `packages/{shared,db,email,ui,config}`, `e2e/`.
- `packages/config`: tsconfig bases (strict) and a Biome config that bans `dangerouslySetInnerHTML`.
- `docker-compose.yml`: Postgres 18 (pg_trgm, unaccent, citext), Redis, Mailpit.
- `packages/db`: Drizzle, postgres.js, migrations, drift check, Testcontainers helper, and a seed framework with `db:reset`.
- `packages/shared`: Problem Details, pagination, permission names, and a 90% coverage gate.
- `apps/api`: Fastify 5 on `/v1`, a Zod env config, pino with request IDs, Problem Details errors, helmet, CORS, Origin check, `/health`, `/ready`, a BullMQ worker (`dist/worker.js`), OpenAPI generation, and `/v1/docs` outside production.
- `apps/web`: React Router 8 SSR, Tailwind v4, shadcn/ui via `packages/ui`, a server API client, an app shell with the dark theme, a copy module, and CSP with nonces.
- `docs/DESIGN.md`: grid, type scale, spacing, tokens, component inventory, and page templates.
- CI (`.github/workflows/ci.yml`): lint, format, typecheck, `db:check`, unit, integration, build with OpenAPI drift, Gitleaks, `pnpm audit`, and Playwright + axe e2e.
- Sentry wiring (no-op without a DSN) and Renovate config.
- Deployment config (`render.yaml`, `netlify.toml`, a staging deploy workflow), plus per-PR previews once the owner has created the accounts.

## Acceptance criteria

1. From a fresh clone: `pnpm install && docker compose up -d --wait && pnpm db:reset && pnpm check` passes.
2. `pnpm dev` serves the web app on `:5173` (SSR HTML visible in view-source) and the API on `:3000`; `GET /v1/health` → 200; `GET /v1/ready` → 200, or 503 when Redis is down.
3. A validation error returns an RFC 9457 Problem Details body; a non-GET request with a foreign `Origin` returns 403.
4. `pnpm db:check` fails on schema drift; `pnpm openapi:check` fails on a stale spec; both run in CI.
5. `pnpm test:e2e` passes the home page smoke spec in Chromium, WebKit, and mobile, with zero serious or critical axe issues.
6. CI is green on PRs, and `main` is protected, requiring the CI checks (HUMAN M1-T03).
7. A scratch file using `dangerouslySetInnerHTML` fails `pnpm lint`.
8. Every stated command in `CLAUDE.md` exists in `package.json` and works.
9. (If the owner has done M1-T19/M1-T21) merges to `main` auto-deploy to staging and pass the smoke tests, and PRs get preview environments with e2e running against them.

## Implementation choices (the PRD is silent; recorded in `docs/DECISIONS.md`)

- Local domains: `www.reprint.localhost:5173` and `api.reprint.localhost:3000` with `COOKIE_DOMAIN=reprint.localhost`; SSR calls the API via `API_INTERNAL_URL`. If WebKit can't resolve `*.localhost`, fall back to plain `localhost` with a host-only cookie.
- UUIDv7 is generated in the app (works on Postgres 17 too), not by Postgres 18's `uuidv7()`.
- The OpenAPI spec comes from Zod through a type-provider library (see DECISIONS for the choice).
- Until preview environments exist, e2e runs in CI against a locally built stack with Docker services.
- Redis 7 in Docker (Render Key Value is Redis-compatible).

## Out of scope

- Any feature tables beyond what tooling needs (users come in M2, the Catalog in M3).
- Production infrastructure and the release workflow (M8).
- Real email sending (M2) and Source calls (M3).

## Human prerequisites

- **M1-T03:** enable branch protection on `main` (required checks from `docs/ci.md`).
- **M1-T19:** create Neon staging (Postgres 18, or 17 as fallback), Render Blueprint, Netlify site, Resend (sandbox), Sentry projects, and staging DNS; add deploy secrets to GitHub.
- **M1-T21:** enable Netlify deploy previews, Render PR previews, and Neon branching.
- **M1-T23:** install the Renovate GitHub app.
- Optional: Turborepo remote cache secrets (`TURBO_TOKEN`, `TURBO_TEAM`).
