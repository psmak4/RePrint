# Performance

Targets are PRD §11 (p95, production). Two tools check them: k6 for API latency and load, Playwright for the Book page's Core Web Vitals.

| Measure | Target | Checked by |
| --- | --- | --- |
| API read endpoints | 200 ms or less | `load/k6/mixed-read-heavy.js` (`kind:read`) |
| API write endpoints | 400 ms or less | same (`kind:write`) |
| Search | 300 ms or less | same (`kind:search`) |
| Load | 200 requests per second, mixed read-heavy, 10 minutes, under 1% errors | same, default settings |
| Book page LCP | 2.5 s or less on a mid-range phone over 4G | `e2e/specs/web-vitals.spec.ts` |
| Interaction to Next Paint | 200 ms or less | same |
| Cumulative Layout Shift | 0.1 or less | same |

## k6 scenario

`load/k6/mixed-read-heavy.js` uses a constant arrival rate, so slow responses don't lower the offered load. The mix per request: 25% search (`/v1/search`, `/v1/search/suggest`), 5% writes (`PUT` then `DELETE /v1/books/:slug/shelf` as a signed-in Member), and 70% reads (Book, Discover, Book reviews, Genres list, Genre page). `setup()` reads Book and Genre slugs from `/v1/discover` and `/v1/genres`, and logs in the Members from `LOAD_MEMBERS`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `BASE_URL` | `http://localhost:3000` | API origin |
| `WEB_ORIGIN` | `http://www.reprint.localhost:5173` | Sent as `Origin` on every request (the API checks it on writes); must be in the target's `WEB_ORIGINS` |
| `RATE` / `DURATION` | `200` / `10m` | Arrival rate per second and run length |
| `MAX_VUS` | `400` | Upper bound on virtual users |
| `LOAD_MEMBERS` | empty | `email:password,email:password` of existing verified or unverified Members. Empty means no write traffic, and the write threshold then has no samples |
| `SPREAD_IPS` | `false` | `true` sends a random `X-Forwarded-For` per request. Needs `TRUST_PROXY` on the target |

Thresholds: `errors` and `http_req_failed` under 1%, plus the three p95 targets above. A 429 counts as an error.

### Rate limits shape the run

The PRD §11 limits apply to the load generator too: 300 anonymous reads per minute per IP, and 120 writes per minute per Member. A full run from one machine therefore needs either `SPREAD_IPS=true` against a target that trusts `X-Forwarded-For` (staging behind its proxy), or several generator IPs, and enough Members in `LOAD_MEMBERS` that the writes (about 10 per second, so at least 6 Members) stay under their limit. The owner decides how to do this for the staging run (M8-T15); never point the full run at production.

### Local smoke run

```
docker compose up -d --wait && pnpm db:reset      # seeded Books and the Members member1 and member2
pnpm dev                                          # or any API on :3000
pnpm load:smoke
```

`pnpm load:smoke` (`scripts/load-smoke.sh`) runs the same script for 30 seconds at 3 requests per second with the seeded Members, and fails if a threshold is crossed. It uses the `k6` binary when installed (`brew install k6`) and the `grafana/k6` Docker image otherwise. Override `BASE_URL`, `RATE`, `DURATION`, `MAX_VUS`, and `LOAD_MEMBERS` through the environment. The smoke run proves the script and thresholds work; it says nothing about capacity.

### Full run (owner, before launch)

```
k6 run -e BASE_URL=https://<staging API> -e WEB_ORIGIN=https://<staging web> \
  -e LOAD_MEMBERS="a@x.test:pw,b@x.test:pw,..." -e SPREAD_IPS=true \
  load/k6/mixed-read-heavy.js
```

Record the results below.

| Date | Target | Result | Notes |
| --- | --- | --- | --- |
| _none yet_ | | | |

## Web vitals check

`e2e/specs/web-vitals.spec.ts` loads The Hobbit's Book page (found by ISBN search) in the `mobile` Playwright project (Pixel 7, Chromium) with Chrome DevTools throttling: 150 ms latency, 1.6 Mbit/s down, 750 kbit/s up (Lighthouse's slow 4G), the CPU slowed 4 times, and the cache off. The `web-vitals` package records LCP, CLS, and INP in the page; INP comes from typing into the header search box after hydration. The test fails above the targets in the table, and prints the numbers (`Book page web vitals: {...}`). It runs in `pnpm test:e2e` with the rest of the specs. The test runs against the production builds the e2e stack serves, with local services, so it catches regressions (bundle size, layout shift, slow handlers) but is not a substitute for real-device numbers from production; compare against RUM later.

First recorded run (local, 2026-10-02): LCP 516 ms, CLS 0, INP 40 ms.

If it fails: LCP usually means a bigger bundle or an uncached API call in the Book loader; CLS means an image or banner without reserved space; INP means a slow handler in the search combobox.

## Page-view cost (M10)

M10 cut what the busiest pages cost to serve and download. These are the before and after figures, and how to take them again.

### How it is measured

Give the stack a database and a Redis of its own, so other traffic does not land in the counts:

```
docker compose exec -T postgres sh -c 'pg_dump -U reprint -Fc reprint > /tmp/p.dump && createdb -U reprint reprint_perf && pg_restore -U reprint -d reprint_perf --no-owner /tmp/p.dump; rm /tmp/p.dump'
docker compose exec -T postgres psql -U reprint -d postgres -c "alter database reprint_perf set log_statement = 'all'"
docker run -d --rm --name reprint-perf-redis -p 6390:6379 redis:7
```

Then run the built API against them (`DATABASE_URL=…/reprint_perf`, `REDIS_URL=redis://localhost:6390`, `TRUST_PROXY=true`, `PORT=3998`), the counting proxy in front of it (`PORT=3999 API_URL=http://localhost:3998 node apps/web/scripts/perf/count-api-requests.mjs`), and the built web app pointed at the proxy (`API_INTERNAL_URL=http://localhost:3999`, `PORT=5199`). Measure a page as a Visitor, and as a Member with `--cookie "rp_session=<token>"` (a session row you add to the copy):

```
WEB_URL=http://localhost:5199 REDIS_CONTAINER=reprint-perf-redis PROXY_URL=http://localhost:3999 \
  node apps/web/scripts/perf/measure-page-view.mjs /books/<slug> --runs 5
```

It prints the API requests the web server made, the SQL statements Postgres logged, the Redis commands, and the fastest time, each the smallest of the runs. Statements come from the statement log, not `pg_stat_database`: since Postgres 15 a connection reports its counters only every few seconds, so short windows undercount. `node apps/web/scripts/perf/search-timing.mjs` (with `API_URL`) times suggestions and a Genre-filtered search. `pnpm bundle:check` prints each main page's JavaScript. Afterwards: `dropdb reprint_perf` and `docker stop reprint-perf-redis`.

### Results (2026-10-14)

Taken on a copy of the owner's local database (853 Books, 194 Authors), before M10 (`2c7931d`) and after it, with the same setup and the same Book (`a-harbor-for-ashford-a6bf8d`, which has an Author, a Series, and Genres). Each cell is API requests / SQL statements / Redis commands for one page view, the smallest of 5 runs.

| Page | Visitor before | Visitor after | Member before | Member after |
| --- | --- | --- | --- | --- |
| Discover | 3 / 0 / 10 | 2 / 0 / 7 | 6 / 22 / 1 | 5 / 15 / 1 |
| Book | 8 / 28 / 32 | 5 / 24 / 16 | 11 / 59 / 8 | 8 / 40 / 1 |
| Author | 2 / 7 / 6 | 2 / 7 / 6 | 3 / 16 / 0 | 3 / 13 / 0 |
| Search (`q=dune`) | 4 / 7 / 14 | 4 / 13 / 14 | 5 / 21 / 2 | 5 / 22 / 2 |

- The Book page asks the API for everything in one round (it took three, with the root loader's two beside them), and asks for the session once. On localhost a round costs well under a millisecond, so page times differ by no more than run-to-run noise there; in production each round crosses from the web host to the API host.
- Discover's Visitor view reads only Redis (its rows are cached). Most Redis commands are the per-IP read limit, one per API request a Visitor's page makes.
- Search runs a few more statements: each search sets its trigram thresholds in its own transaction (begin, `set_config`, commit; D-206). In exchange it uses its indexes:

| API time (median of 7, mean over 8 queries) | 853 Books before | after | 50,853 Books before | after |
| --- | --- | --- | --- | --- |
| Suggestions (`/v1/search/suggest`) | 7.5 ms | 5.6 ms | 336 ms | 28 ms |
| Catalog search with a Genre filter | 6.3 ms | 5.2 ms | 6.7 ms | 14.8 ms |

The 50,853-Book copy adds 50,000 generated Books and 10,000 generated Authors to the same data. Before M10 every suggestion scanned all of them; after, the indexes serve it. A search with a selective filter is slower there (the matches are gathered before the filter applies), still far inside the 300 ms target.

| JavaScript (gzip, entry + root + route) | Before | After |
| --- | --- | --- |
| Discover | 198 KB | 161 KB |
| Book | 251 KB | 167 KB |
| Search | 187 KB | 150 KB |
| Log in | 192 KB | 180 KB |

The JavaScript every page loads no longer holds Zod or the admin, legal, and settings copy (a 45 KB gzip chunk before); Discover, Book, and search load no Zod at all (forms load it when opened); and the Book, Author, and Series pages no longer load a Markdown parser (35 KB gzip). `pnpm bundle:check` keeps all three that way. Elsewhere: a signed-in API request reads its session in 1 query, not 2 (`session.integration.test.ts`); storing a Book with 50 Editions takes 31 statements, not 325 (`ingest.integration.test.ts`).
