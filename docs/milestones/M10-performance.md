# M10 · Performance

## Goal

Make RePrint's busiest pages cheaper to serve and faster to load before launch, without changing what anyone sees. A performance review on 2026-10-14 found that Catalog search scans whole tables, that the Book page makes many API calls in a chain, each of which reads the session and counts against the rate limit again, and that every page downloads Zod and the whole copy file. This milestone fixes those and a set of smaller inefficiencies, then measures the result against the baseline below.

## PRD sections covered

§6 (how search works, keeping the Catalog current), §7.2 to §7.5 (Discover, search, Book, Author, Genre, and Series pages), §9 (data model and indexes), §10 (API conventions), §11 (performance targets: API reads ≤ 200 ms, search ≤ 300 ms, Book page LCP ≤ 2.5 s, INP ≤ 200 ms at p95), §12 (test layers).

## Baseline (local, 2026-10-14, owner's dev database: 588 Books, 146 Authors, 2,382 Editions)

| Measure | Baseline |
| --- | --- |
| Catalog search plan (`searchCatalogBooks`, `searchCatalogAuthors`) | With `enable_seqscan = off`, Postgres still scans all of `books` (no usable index) and reads every row of `authors` and `series`. The trigram indexes are on raw `title` and `name`, but the queries compare `lower(unaccent(...))` with `similarity()` and `like '%…%'`, which no index serves |
| API requests per Book page view | Visitor 8, Member 11 (plus the root loader's 2), in 3 rounds in the Book loader; the root and Book loaders each call `GET /v1/auth/session` |
| Database queries and Redis commands per Visitor Book page view | About 22 queries and 21 Redis commands (each API GET is one `anonymousRead` count, so a Visitor reaches the 300 a minute limit after about 37 Book pages) |
| Session read per authenticated API request | 2 queries, one after the other (session and Member, then permissions) |
| Client JS, gzip (entry + root + route chunks) | Discover 198 KB, Book 251 KB, search 187 KB, log in 192 KB |
| Shared chunk loaded by the root route | 158 KB raw, 45 KB gzip: Zod 91 KB, copy 45 KB (admin 23 KB of the 62 KB source), `@reprint/shared` 20 KB |
| Markdown chunk on Book and Author pages | 118 KB raw, 35 KB gzip (`react-markdown`, micromark, mdast/hast) |

How the numbers were taken: `EXPLAIN (costs off)` with `set enable_seqscan = off`; `pg_stat_database.xact_commit` and Redis `total_commands_processed` read before and after one `curl` of a Book page with its own `x-forwarded-for`; a production web build with sourcemaps, attributing each chunk's bytes to its sources. M10-T13 repeats them and records how in `docs/performance.md`.

## Deliverables

- Search and suggestions that use indexes (expression trigram indexes on normalized names and an immutable `unaccent` wrapper), with the same matches and ranking.
- One session lookup per web request, a Book loader that waits only where it must, and a one-query session read in the API.
- Light Book page rails (More by this Author, More in Genre) that never queue an Author sync (D-205), and a Genre "Top rated" sort that reuses the cached site mean.
- A root bundle without Zod or admin and legal copy, and Markdown rendered without shipping a parser to the browser.
- Narrower column lists for Book cards and details, batched Edition lookups when storing a Book, independent queries run together, bulk job queuing, a configurable database pool, and small fixes.
- Re-measured numbers and a repeatable method in `docs/performance.md`.

## Acceptance criteria

1. Search and suggestion queries use indexes: an integration test reads their plans with sequential scans disabled and finds the new indexes, and every existing search test passes unchanged.
2. A document request for any page calls `GET /v1/auth/session` at most once, and the Book loader makes its requests in two rounds.
3. A Book page view queues no `catalog.author-sync`; an Author page view still does when due (D-203, D-205).
4. The root route's JS contains no Zod and no admin or legal copy, and the Book and Author pages' JS contains no Markdown parser.
5. API responses are unchanged: the OpenAPI spec does not change except where a task records an addition in `docs/DECISIONS.md`, and existing integration and contract tests pass.
6. M10-T13 records every baseline measure again, each lower than the baseline, and the web vitals check still meets PRD §11.
7. `pnpm check` and `pnpm test:e2e` pass.

## Implementation choices (recorded in `docs/DECISIONS.md`)

- D-205: a Book page view does not import its Author's bibliography (owner).
- Later tasks add entries for the `unaccent` wrapper and trigram thresholds (M10-T01), the Book page rail API shape (M10-T06), and the Markdown rendering approach that replaces `react-markdown` on the client (M10-T08, amends D-202).

## Out of scope

- A single combined endpoint for the whole Book page. Revisit after M10-T13 if the two-round loader is still too slow.
- Caching API responses in the web server, or a CDN in front of the API.
- Changing rate limits (PRD §11) or the response-schema serialization the PRD requires (§10).
- Production load testing (M8-T15).
