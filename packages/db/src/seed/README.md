# Seed framework

`pnpm db:seed` adds sample data to the local database. `pnpm db:reset` drops every table, re-applies migrations, then seeds. Both refuse to run when `NODE_ENV=production` or when `DATABASE_URL` points at a non-local host (`localhost`, `127.0.0.1`, `::1`, `*.localhost`).

## Determinism

Modules must not use `Math.random()`, `Date.now()`, or `newId()`. Use the `random` helper on the context: `random.id()` (UUIDv7 from a fixed clock), `random.int()`, `random.pick()`, `random.next()`, and `random.now()`. One seed (`SEED`) drives the whole run, so two resets give the same rows and the same IDs. Adding a module changes the random sequence for modules after it, so append modules at the end unless a milestone needs an earlier slot.

## Adding a module

1. Create `src/seed/modules/<name>.ts` exporting a `SeedModule` (`{ name, run({ db, random }) }`).
2. Add it to `seedModules` in `src/seed/registry.ts`. That list is the run order; a module can rely on rows from modules above it.
3. Make it safe to run once after a reset. `db:seed` on a database that is already seeded is not supported; use `db:reset`.

All modules run in one transaction, so a failure leaves the database unchanged.

## Catalog data

`pnpm db:seed` and `pnpm db:reset` (the root scripts) also run `pnpm --filter api seed:catalog`, which loads about 500 Books through the API's ingest service (D-114). It lives in `apps/api` because ingest does. Running `seed:catalog` alone is safe to repeat.

## Review data

The root scripts then run `pnpm --filter api seed:reviews` (D-129): about 150 reviews across 40 Books in every status, with edited reviews that have several versions. It lives in `apps/api` because it uses `applyReviewChange` to keep each Book's totals right. It does nothing when any review already exists.

## Discover data

Then `pnpm --filter api seed:discover` (D-137) tops up eight Books to six Approved reviews, adds Helpful votes, and picks featured Genres and a featured review. It does nothing when any featured item exists. Discover rows are cached in Redis for up to an hour, so after a reset they appear once the `discover.rebuild` job runs.

