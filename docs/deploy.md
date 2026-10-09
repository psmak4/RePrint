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
| `PRODUCTION_DATABASE_URL_DIRECT` | secret | Neon direct (non-pooled) production URL for the nightly backup (`backup.yml`) |
| `R2_ACCOUNT_ID` | variable or secret | Cloudflare account ID for the R2 endpoint (backup) |
| `R2_BUCKET_BACKUPS` | variable or secret | R2 bucket that holds the dumps (backup) |
| `R2_BACKUPS_ACCESS_KEY_ID`, `R2_BACKUPS_SECRET_ACCESS_KEY` | secret | R2 API token with read and write on the backups bucket only (backup) |
| `TURBO_TOKEN` | secret | Optional Turborepo remote cache |
| `TURBO_TEAM` | variable or secret | Optional Turborepo remote cache |

`.github/workflows/backup.yml` runs nightly (03:17 UTC) and on demand. See `docs/runbooks/restore.md`. If any backup value is missing it logs `Backup skipped` as a notice and succeeds.

## Render (Blueprint) values

Created from `render.yaml`; `sync: false` values are entered in the Render dashboard, never committed: `DATABASE_URL` (Neon pooled), `DATABASE_URL_DIRECT` (Neon direct, used by the pre-deploy migration), `WEB_ORIGINS` (the staging web origin), `SENTRY_DSN`. Add the remaining variables from `.env.example` for the features that exist by then (`COOKIE_DOMAIN`, storage, Source). The worker needs the same `STORAGE_DRIVER`, `IMAGE_BASE_URL`, and `R2_*` values as the API, because `accounts.erase` deletes avatar files. For email set `EMAIL_TRANSPORT=resend`, `RESEND_API_KEY`, and `EMAIL_FROM` on both the API and the worker (the API needs them when `WORKER_IN_PROCESS=true`); startup fails if the transport is `resend` and the key is missing. `REDIS_URL` comes from the Key Value instance. Set `APP_ENV=staging` (the Blueprint default) or `production` on the production Blueprint.

Render deploys are triggered only by the workflow (`autoDeployTrigger: "off"`), so migrations always run first. The pre-deploy command needs a paid Render plan. Free-tier staging uses `render.staging.yaml` instead (D-175): no pre-deploy command or worker, migrations run from the workflow only, and `WORKER_IN_PROCESS=true` on the API. Steps are in **Free-tier staging setup** below.

## Netlify

Link the site with base directory `apps/web`. Set `API_INTERNAL_URL`, `API_ORIGIN`, `VITE_API_ORIGIN`, `APP_ENV`, `VITE_SENTRY_DSN`, and (to turn analytics on) `VITE_ANALYTICS_DOMAIN` and `VITE_ANALYTICS_SCRIPT_URL` in the site's environment (see `.env.example`). Static assets under `/assets/*` are cached immutably.

## Free-tier staging setup (owner, step by step)

Staging runs entirely on free plans (D-070, D-175) at the platforms' own URLs; no custom domain is needed. The browser only ever talks to the Netlify site: the web server calls the API and passes its session cookie through, so leave `COOKIE_DOMAIN` unset and the cookie belongs to the Netlify host.

Write down these values as you go (the names below are used in later steps):
`NEON_POOLED`, `NEON_DIRECT`, `API_URL` (e.g. `https://reprint-api-staging.onrender.com`), `WEB_URL` (e.g. `https://reprint-staging.netlify.app`), `RENDER_HOOK`, `NETLIFY_SITE_ID`, `NETLIFY_TOKEN`, `RESEND_KEY`, `INVITE_CODES`.

1. **Neon (database).** Sign up at neon.tech, then create a project named `reprint-staging` in an AWS US East region, Postgres 18 (17 if 18 isn't offered; note it in `docs/DECISIONS.md`). From **Connect**, copy the pooled connection string (`NEON_POOLED`) and, with "Connection pooling" off, the direct one (`NEON_DIRECT`).
2. **Resend (email).** Sign up at resend.com and create an API key with "Sending access" (`RESEND_KEY`). Until you verify a domain, Resend only delivers to your own sign-up address, so test registrations should use that address.
3. **Render (API and Redis).** Sign up at render.com with GitHub and allow access to `psmak4/RePrint`. Choose **New → Blueprint**, pick the repo, and set **Blueprint path** to `render.staging.yaml`. When it asks for the `sync: false` values, enter:
   - `DATABASE_URL` = `NEON_POOLED`, `DATABASE_URL_DIRECT` = `NEON_DIRECT`
   - `WEB_ORIGINS` and `WEB_URL` = `WEB_URL` (pick your Netlify site name now, e.g. `reprint-staging`, so you know the URL; update both later if it differs)
   - `IMAGE_BASE_URL` = `API_URL` + `/v1/uploads` (Render shows the service URL after creation; edit it then if needed)
   - `SIGNUP_INVITE_CODES` = a few codes of your choice (`INVITE_CODES`), `RESEND_API_KEY` = `RESEND_KEY`

   After it's created, open the `reprint-api-staging` service → **Settings → Deploy Hook**, and copy the URL (`RENDER_HOOK`).
4. **Netlify (web app).** Sign up at netlify.com with GitHub. **Add new site → Import an existing project**, pick the repo, set **Base directory** to `apps/web` (the build command and publish folder come from `netlify.toml`), and name the site to match `WEB_URL`. Then:
   - **Site configuration → Environment variables:** `API_INTERNAL_URL` = `API_URL`, `API_ORIGIN` = `API_URL`, `APP_ENV` = `staging`.
   - **Site configuration → Build & deploy → Continuous deployment:** set builds to **Stopped**. The GitHub workflow deploys after migrations; Netlify's own builds would race it.
   - Copy the **Site ID** from Site configuration → General (`NETLIFY_SITE_ID`), and create a personal access token under User settings → Applications (`NETLIFY_TOKEN`).
5. **GitHub (deploy settings).** In the repo: **Settings → Secrets and variables → Actions**.
   - Secrets: `STAGING_DATABASE_URL_DIRECT` = `NEON_DIRECT`, `RENDER_DEPLOY_HOOK_API_STAGING` = `RENDER_HOOK`, `NETLIFY_AUTH_TOKEN` = `NETLIFY_TOKEN`.
   - Variables: `NETLIFY_SITE_ID`, `STAGING_API_URL` = `API_URL`, `STAGING_WEB_URL` = `WEB_URL`. Setting `STAGING_API_URL` also turns on `keep-staging-warm.yml`.
6. **First deploy.** Repo → **Actions → Deploy staging → Run workflow** on `main`. It migrates Neon, deploys Render and Netlify, and smoke-tests both URLs (allow up to 10 minutes on the first run). Then open `WEB_URL`.
7. **First Admin (optional).** On your machine, with `DATABASE_URL` set to `NEON_DIRECT` for that one command only: `pnpm --filter api seed:admin -- --email … --username …` (it reads the password from stdin).

Free-tier limits to expect: the API sleeps after ~15 minutes idle (the keep-warm workflow pings it every 10), uploads such as avatars disappear on each redeploy, the Redis instance is small and not persisted, email only reaches your own address, and there are no per-PR preview environments (M1-T21 and M1-T22 stay skipped).

## Rollback

Redeploy the previous commit: run the workflow manually from an earlier commit's ref, or use Render's and Netlify's "redeploy" for the earlier build. Migrations follow expand then contract (PRD §12), so old code runs against the new schema and the database is not rolled back.

## Audit log database role (D-117)

The `audit_log` trigger refuses UPDATE and DELETE on every database, including local. In staging and production, also run the app and worker as a role that cannot do more than the trigger allows. Migrations run through `DATABASE_URL_DIRECT` as the owner role; `DATABASE_URL` should be a separate role. After creating it (once per environment, by the owner), run:

```sql
REVOKE ALL ON audit_log FROM app_role;
GRANT INSERT, SELECT ON audit_log TO app_role;
-- Only for the daily privacy.clearOldIps job (D-042); the trigger still limits it to rows over 90 days old.
GRANT UPDATE (ip) ON audit_log TO app_role;
```

Foreign-key `SET NULL` on `actor_id` (account erase) runs as the table owner, so it needs no grant. Re-run the `GRANT` lines after a migration that creates tables, since new tables need their own grants.
