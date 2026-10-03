# Backup and restore runbook (PRD §11)

Three layers protect production data:

1. **Neon point-in-time restore** (7 days or more). Fastest for "undo the last hour"; use Neon's console to branch the database at a past time.
2. **Nightly logical dump** to the R2 backups bucket, kept 30 days. This is the layer here. It survives losing the Neon project.
3. **A restore drill** before launch and every quarter after (below).

## Nightly dump

`.github/workflows/backup.yml` runs at 03:17 UTC. It installs the Postgres 18 client tools, runs `scripts/backup.sh` against `PRODUCTION_DATABASE_URL_DIRECT` (a direct, non-pooled URL; `pg_dump` fails through a pooler), checks the archive is readable, uploads it to `s3://<bucket>/daily/reprint-<UTC timestamp>.dump`, and compares the stored size with the local size. A failed run emails the repository owner through GitHub; check **Actions → Backup** after the first night and after every change to the secrets. With no secrets it logs a notice and succeeds.

The dump is Postgres custom format (`pg_dump --format=custom --no-owner --no-privileges`). It holds personal data (emails, password hashes, IP addresses): R2 encrypts it at rest, and the API token must be scoped to the backups bucket only. Never download a dump to a shared machine.

### One-time setup (the owner, in M8-T13)

1. Create a private R2 bucket for backups (not the images bucket, and no public access or custom domain).
2. Apply the 30-day lifecycle rule in `docs/runbooks/backup-lifecycle.json`:
   `aws s3api put-bucket-lifecycle-configuration --bucket <bucket> --lifecycle-configuration file://docs/runbooks/backup-lifecycle.json --endpoint-url https://<account-id>.r2.cloudflarestorage.com` (with the R2 token in `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`, and `AWS_DEFAULT_REGION=auto`). Or add the same rule (prefix `daily/`, delete after 30 days) in the Cloudflare dashboard under the bucket's **Settings → Object lifecycle rules**.
3. Create an R2 API token with Object Read & Write on that bucket only, and set the five values listed in `docs/deploy.md`.
4. Run the workflow once by hand (**Actions → Backup → Run workflow**) and confirm a `daily/` object appears.

## Restore a dump into a scratch database

Never restore over the live database. `scripts/restore.sh` refuses any database whose name does not start with `scratch` or `restore`, and any database that already has tables.

1. Download the dump: `aws s3 cp s3://<bucket>/daily/<file>.dump . --endpoint-url https://<account-id>.r2.cloudflarestorage.com` (same environment variables as above).
2. Create an empty scratch database on a Postgres 18 server you control (a local one, or a Neon branch): `createdb scratch_restore` (or `create database scratch_restore;`). The role needs permission to create the `pg_trgm`, `unaccent`, and `citext` extensions, which the dump enables.
3. Restore: `bash scripts/restore.sh <file>.dump postgres://user:pass@host:5432/scratch_restore`. It runs `pg_restore --exit-on-error` and prints `schema.table<TAB>rows` for every table.
4. Check the result: the table count matches production, and row counts are close to production's (they differ by whatever changed after 03:17 UTC). For a precise check, run the same count query on a Neon branch taken at the dump time.
5. Point a staging API at the scratch database (`DATABASE_URL`) and open `/v1/ready`, a Book page, and the sign-in page.

To recover production from a dump, restore into a new Neon database first (steps 2 and 3, with a name starting `restore`), check it, then switch `DATABASE_URL` and `DATABASE_URL_DIRECT` on Render to it. Redis holds only caches, queues, and rate limits; it is rebuilt by the app and the worker. Uploaded covers and avatars live in R2 and are not part of the dump (R2 objects survive a database loss).

## Restore drill

Done before launch (M8-T15) and every quarter. Follow the steps above with the newest dump, then record it here:

| Date | Dump file | Restored by | Time taken | Result and notes |
| --- | --- | --- | --- | --- |
| (to be filled in at the first drill) | | | | |

## Automated check

`pnpm backup:drill` (CI job `restore-drill`) backs up a freshly migrated and seeded local database with `scripts/backup.sh`, restores it with `scripts/restore.sh` into a throwaway database, and fails unless every table has identical row counts. Without Postgres 18 client tools installed it runs them in the Compose `postgres` container. This guards the scripts, not the production credentials or the R2 bucket; only the owner's drill covers those.
