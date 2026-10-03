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
