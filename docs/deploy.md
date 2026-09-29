# Deployment

Staging deploys automatically on every merge to `main` (PRD §12 step 6). Staging infrastructure doesn't exist yet (M1-T19 is deferred, D-070), so the workflow currently exits with a notice. This page lists everything the config reads so the owner can set it up later.

## What deploys where

| Piece | Config | Host |
| --- | --- | --- |
| API (`apps/api`, ≥ 2 instances, pre-deploy `pnpm db:migrate`) | `render.yaml` → `reprint-api` | Render, Virginia |
| Worker (`node dist/worker.js`) | `render.yaml` → `reprint-worker` | Render, Virginia |
| Redis | `render.yaml` → `reprint-redis` (Key Value, `noeviction`) | Render, Virginia |
| Web app (`apps/web`, SSR as a Netlify function) | `apps/web/netlify.toml`, adapter enabled in `vite.config.ts` when `NETLIFY` is set | Netlify |
| Database | Neon (US East), Postgres 18 | Neon |

`.github/workflows/deploy-staging.yml` runs on push to `main` (and manually): migrate staging → Render deploy hooks (API, worker) → `netlify deploy --build --prod` → smoke test `/v1/ready` and `/` (retries for 10 minutes, because free Render services sleep). If any value below is missing it logs `Staging deploy skipped` as a notice and succeeds.

## GitHub Actions secrets and variables

| Name | Kind | Used for |
| --- | --- | --- |
| `STAGING_DATABASE_URL_DIRECT` | secret | Neon direct (non-pooled) URL for `pnpm db:migrate` |
| `RENDER_DEPLOY_HOOK_API_STAGING` | secret | Render deploy hook URL for the API (includes `?key=`) |
| `RENDER_DEPLOY_HOOK_WORKER_STAGING` | secret | Render deploy hook URL for the worker; optional when the API runs the worker (`WORKER_IN_PROCESS=true`) |
| `NETLIFY_AUTH_TOKEN` | secret | Netlify CLI deploy |
| `NETLIFY_SITE_ID` | variable or secret | Netlify site to deploy |
| `STAGING_WEB_URL` | variable | Smoke test target, for example `https://staging.reprint.com` |
| `STAGING_API_URL` | variable | Smoke test target, for example `https://api.staging.reprint.com` |
| `TURBO_TOKEN` | secret | Optional Turborepo remote cache |
| `TURBO_TEAM` | variable or secret | Optional Turborepo remote cache |

## Render (Blueprint) values

Created from `render.yaml`; `sync: false` values are entered in the Render dashboard, never committed: `DATABASE_URL` (Neon pooled), `DATABASE_URL_DIRECT` (Neon direct, used by the pre-deploy migration), `WEB_ORIGINS` (the staging web origin), `SENTRY_DSN`. Add the remaining variables from `.env.example` for the features that exist by then (`COOKIE_DOMAIN`, email, storage, Source). `REDIS_URL` comes from the Key Value instance. Set `APP_ENV=staging` (the Blueprint default) or `production` on the production Blueprint.

Render deploys are triggered only by the workflow (`autoDeployTrigger: "off"`), so migrations always run first. The pre-deploy command needs a paid Render plan. Free-tier staging (D-070) has no pre-deploy command or worker; run migrations from the workflow only, remove `preDeployCommand`, and set `WORKER_IN_PROCESS=true` on the API.

## Netlify

Link the site with base directory `apps/web`. Set `API_INTERNAL_URL`, `API_ORIGIN`, `VITE_API_ORIGIN`, `APP_ENV`, and `VITE_SENTRY_DSN` in the site's environment (see `.env.example`). Static assets under `/assets/*` are cached immutably.

## Rollback

Redeploy the previous commit: run the workflow manually from an earlier commit's ref, or use Render's and Netlify's "redeploy" for the earlier build. Migrations follow expand then contract (PRD §12), so old code runs against the new schema and the database is not rolled back.
