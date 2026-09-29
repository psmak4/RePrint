# M3 · Book catalog

## Goal

Build RePrint's own Catalog and the path by which Books enter it: the domain model, the Source adapter interface with an Open Library adapter proven by a contract suite, a protected Source gateway, and federated search. Visitors can search, open book and author pages served only from the Catalog, and pull in a Book that isn't on RePrint yet.

## PRD sections covered

§3 (milestone 3), §5 (all vocabulary and rules), §6 (all: Sources, provider interface, storage, keeping current, search, protecting the Source, covers), §7.3 (search), §7.4 (book page, except reviews, ratings, and structured data), §7.5 (Author page), §9 (Catalog tables), §10 (Catalog endpoints except `/genres`, `/series`, `/discover`), §12 (unit, adapter contract, integration; e2e search to book page), §13 (500 seeded Books, fixtures by default).

## Deliverables

- `packages/shared` Catalog schemas, ISBN-10→13, slug generation.
- Catalog tables (books, editions, authors, contributions, series, book_series, genres, book_genres, subjects, book_subjects, subject_genre_rules, source_links, source_records, merge_candidates) with FTS and trigram indexes; the Genre list plus starter mapping rules as reference data.
- `apps/api/src/catalog/sources/`: the interface, the contract suite, the stub Source, and the Open Library adapter with recorded fixtures. `SOURCE_MODE=fixtures|live|stub`.
- Source gateway: one Redis rate limiter (`SOURCE_RATE_LIMIT_RPS`), interactive-over-background priority, circuit breaker, `User-Agent: RePrint/<version> (ops@reprint.com)`, request and cache counters.
- Ingest: matching (Source link → ISBN-13 → shared ID), merge candidates for title+author-only matches, field origins, locked fields, per-field priorities, Primary Edition choice, Subject→Genre mapping, `source_records` (30-day purge), and a stale refresh job (> 30 days).
- Endpoints: `GET /books/:slug`, `/books/:slug/editions`, `/authors/:slug`, `/search`, `/search/suggest`, plus `POST /books/resolve` (candidate refs). Public caching with SWR and ETag.
- Web: Cover with generated fallback, BookCard, header search with suggestions, `/search`, `/books/:slug`, the resolve/retry route, `/authors/:slug`. The footer credits Open Library (from M1).
- Seed: about 500 Books. E2E: `search.spec.ts`.

## Acceptance criteria

1. The Open Library adapter passes the shared contract suite on recorded fixtures (works, editions, authors, search, missing cover, ISBN-10 only).
2. No Source vocabulary or Source ID appears outside `apps/api/src/catalog/sources/<name>/`: the guard script passes, and API responses contain no Source IDs.
3. Searching "left hand of darkness" returns Catalog Books and "not yet on RePrint" candidates; a repeat search within 24 h doesn't call the Source (counter test).
4. With the Source stubbed to take 2 s (or the breaker open), search returns Catalog results alone with the "more results may be available later" note, and stored book pages still render.
5. Opening a "not yet on RePrint" result stores the Book with its Editions and Authors and redirects to `/books/<slug>`; on Source failure, "We couldn't load this book right now" with a retry button appears.
6. ISBN search (10 or 13 digits) goes straight to the Book.
7. Re-ingesting the same Source record creates no duplicates; a title+author-only match creates a merge candidate; admin-locked fields survive refresh.
8. Suggestions start at 2 characters after 250 ms and never hit the Source.
9. Book pages show the header, description (collapsed after 6 lines), Editions, "More by this author", and fallbacks for missing data. Author pages group Books by role.
10. `pnpm db:reset` loads about 500 Books; `e2e/search.spec.ts` passes with axe checks.

## Implementation choices (recorded in `docs/DECISIONS.md`)

- Candidates not yet in the Catalog are referenced by an opaque `ref` (random ID → candidate payload in Redis, 24 h TTL), so no Source ID leaves the API. `POST /v1/books/resolve { ref }` stores the Book and returns its slug. The web route is `/books/resolve/:ref`.
- `search_vector` is maintained by the ingest service (it spans Editions, Authors, and Series), not a generated column.
- Staging and production rate limits come from `SOURCE_RATE_LIMIT_RPS` (1 and 2).
- ISBN queries return an `isbnMatch` field that the web follows with a redirect.

## Out of scope

- Reviews, ratings UI, and rating-based sorts with real data (M4). Genre and Series pages and Discover (M5). Shelves (M6).
- Admin Catalog editing, merge UI, Genre management, and the Catalog size dashboard (M7). Source headroom dashboard and alerts (M8).
- JSON-LD structured data (M8). Book pages get canonical, meta description, and Open Graph tags here.
- Hardcover or any second Source (not in v1).

## Human prerequisites

- None. Live Open Library calls are opt-in locally (`SOURCE_MODE=live`) and don't need an account. Recording fixtures needs internet access only.
