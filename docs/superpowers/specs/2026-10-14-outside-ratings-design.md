# Outside ratings: Open Library readers' ratings on the Book page

- Date: 2026-10-14
- Status: Design approved by the owner; spec awaiting review
- Decisions to record: D-204 (this design, owner decision; proposes a PRD addition)

## Problem

Most Books have no RePrint reviews yet, so a reader opening one sees an empty rating summary. The owner wants other sources' reader opinions included in a Book's data, kept distinct from RePrint's own moderated reviews. Open Library is the first such source because RePrint already reads it.

## What the Source offers

Checked on live data on 2026-10-14:

- Open Library has **no review text**. Its public data is star ratings and reading-log counts. Its "Community Reviews" are structured tags (pace, mood) that need a signed-in account, so they are out of reach.
- Every search result carries `ratings_average`, `ratings_count`, and `ratings_count_1` to `ratings_count_5`, including the byline search the adapter already makes for each Book (no extra request). The Hobbit: 4.29 from 500 ratings (16 one-star to 270 five-star).
- One search can ask for many Books at once: `key:(/works/A OR /works/B OR …)` returned all three Books asked for, 100 a page.

## Decisions (owner)

1. **Display only.** Outside ratings never affect anything RePrint computes or ranks.
2. **Book page only.** One labeled line in the Reviews section; tiles, search, lists, Discover, Series and Author pages show RePrint ratings only.
3. **Always shown**, however few ratings the Source has.
4. **Existing Books are filled in by a one-time script**, not left for their next 30-day refresh.
5. Reading-log counts (want to read, already read) are out of scope.

## Design

### 1. Source adapter

- `BookCandidate` gains an optional `sourceRating: { average: number; count: number; distribution: [n1, n2, n3, n4, n5] }` (shared schema; RePrint vocabulary). Open Library fills it from the byline search result's `ratings_*` fields; a result with no ratings, or a count of 0, gives `null`. Search candidates (the search page) do not carry it.
- `SourceAdapter` gains an optional method for the backfill:

  ```ts
  /** The current rating for each Book asked for, by Source ID (`null`: the Source has none). Books the Source did not return are left out. */
  getBookRatings?(sourceIds: string[]): Promise<Map<string, SourceRating | null>>
  ```

  Open Library asks `search.json?q=key:(/works/… OR …)&fields=key,ratings_average,ratings_count,ratings_count_1,…,ratings_count_5&limit=100` for up to 100 IDs a request (callers chunk). A malformed ID is skipped; an unreadable response throws `SourceError`.
- The stub Source gives The Hobbit a rating (so e2e can see it) and implements `getBookRatings`.
- Source vocabulary and IDs stay inside `catalog/sources/open-library/`.

### 2. Storage

- New table `source_ratings` (one expand migration): `book_id` (FK to `books`, cascade, indexed), `source` (Source name, as in `source_links`), `average numeric(3,2)`, `count integer`, `counts integer[5]` (one to five stars), `fetched_at timestamptz`; primary key (`book_id`, `source`).
- Ingest (resolve, refresh, Series and Author imports, the seed path) upserts the row when the candidate has a `sourceRating`, deletes it when the candidate says `null`, and leaves it alone when the candidate does not report ratings (`undefined`).
- These are Source data, not RePrint ratings: they never touch `books.review_count`, `rating_sum`, or `rating_counts`, and the nightly aggregate check ignores them.

### 3. API

- `GET /v1/books/:slug` gains `outsideRatings: { sourceName: string; average: number; count: number; distribution: number[] }[]` (optional in the shared schema, so a mismatched deploy still parses). `sourceName` is the Source's display name ("Open Library"), never its internal name or an ID. Empty when there are none.
- No other endpoint changes: review lists, Book summaries (tiles, search, rails, Series, Author, Library, Discover) and JSON-LD stay RePrint-only.

### 4. Display

- In the Book page's Reviews section, below the RePrint rating summary and visually separate (its own small panel, sans type, muted), one line per outside rating: **"Open Library readers · ★ 4.3 · 500 ratings"** (one decimal; "1 rating" singular), and a "Show breakdown" button (`aria-expanded`) revealing its own five bars with a text alternative, like the RePrint breakdown.
- Shown whenever the row exists, however small the count (decision 3). With no RePrint reviews, the RePrint empty state is unchanged and the outside line still shows under it.
- Attribution is text only; no link to the Source (PRD §5: Source IDs never appear in pages).

### 5. Backfill script

- `pnpm --filter api catalog:backfill-ratings` (needs `DATABASE_URL`, `REDIS_URL`, and the Source settings) builds the same catalog runtime as the worker, so requests go through the shared gateway (rate limit, User-Agent, circuit breaker) at background priority.
- It walks stored Books that have a Source link for the active Source, 100 at a time, calls `getBookRatings` once per batch, and upserts or deletes `source_ratings` rows the way ingest does. Books the Source did not return are left as they are. It prints how many rows it wrote and removed. Safe to run again.
- A Source failure on a batch is logged and the script moves on; it exits non-zero if any batch failed, so it can be re-run.
- Run once per environment (`docs/deploy.md`, "One-time data steps"). Locally it runs against the developer's database; staging and production are the owner's to run.

### 6. Testing

- **Contract/unit:** the adapter reads `ratings_*` into `sourceRating` (recorded Hobbit and Le Guin fixtures already carry them; a work with no ratings gives `null`); `getBookRatings` batches, skips malformed IDs, throws on an unreadable page.
- **Integration:** ingest stores, updates, and removes the row and leaves RePrint aggregates untouched; `GET /v1/books/:slug` returns `outsideRatings` with the display name; Book summaries and JSON-LD carry nothing from it; the backfill writes, updates, removes, and leaves unreturned Books alone.
- **Component:** the outside line, singular/plural, the breakdown toggle and its text alternative, the empty-RePrint state with the line under it; axe.
- **E2E:** the stub Hobbit shows its Open Library line on the Book page, separate from the RePrint summary.

### 7. Docs

- D-204 in `docs/DECISIONS.md` (owner decision; proposes a PRD §5/§7.4 addition: "A Book page may show a Source's reader ratings, labeled with the Source, separate from RePrint ratings and never counted in them").
- `docs/deploy.md` one-time step, DESIGN.md (the outside-ratings panel), PROGRESS.

## Out of scope

- Review text from any source (Open Library has none).
- Other outside sources (Hardcover, Google Books, NYT links): the table and API shape allow them later.
- Reading-log counts.
