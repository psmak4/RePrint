# Author bibliography: every work by an Author from the Source

- Date: 2026-10-13
- Status: Design approved by the owner; spec awaiting review
- Decisions to record: D-203 (this design, owner decision; proposes a PRD §6 change, as D-199 did)

## Problem

An Author page lists only the Books already in the Catalog, which is usually the one or two Books a Member happened to open. Readers want an Author's full list of books.

## What the Source offers

Checked on live data on 2026-10-13:

- `search.json?q=author_key:<id>&sort=editions` lists every work crediting the Author, most Editions first, in the search-result shape the adapter already parses (`key`, `title`, `author_key`, `edition_count`, ...), 100 a page.
- J. R. R. Tolkien: 350 works credit him; 318 list him first. Of those, 9 have no Editions, 194 have one (mostly translations filed as separate works, box sets, colouring books, and duplicate records), and 115 have two or more. The top results are The Hobbit (482 Editions), The Fellowship of the Ring, The Two Towers, The Return of the King, and The Lord of the Rings.

## Decisions (owner)

1. **Import the whole bibliography** as ordinary Catalog Books (not a live list of not-yet-stored results, and not a search link). This goes beyond PRD §6 ("stores only the Books its Members actually use"); D-203 records it and proposes the PRD change. PRD.md is not edited.
2. **Trigger: an Author page view**, at most every 30 days per Author, and only for an Author with at least one Book a Member reached, so crawlers cannot cascade through imported co-authors.
3. **No cap** on how many works are imported.
4. **Written by them:** only works that list the Author first.
5. **Skip only works with no Editions.** Everything with at least one Edition is imported (Tolkien: 309 works).
6. **One level only**, as for Series (D-199): a Book a bibliography import brings in starts no imports of its own (no Series syncs, and it does not make its Authors eligible) until a Member reaches it.
7. **Author page:** the Written list loads 24 at a time with "Show more"; ties in review count are ordered by the Source's Edition count, then title. More duplicate candidates in the merge queue are accepted.

"Reached" is D-199's and D-200's meaning: the Book was stored or refreshed through `resolve` (opening a search result, an ISBN lookup, shelving or reviewing a candidate) or `refresh`, or a Member opened it from search.

## Design

### 1. Source adapter

- `SourceAdapter` gains an optional method:

  ```ts
  /** The works an Author wrote (listed first), most Editions first; `[]` when the Source lists none. */
  getAuthorWorks?(sourceId: string): Promise<AuthorWork[]>
  ```

  `AuthorWork` is `{ sourceId: string; title: string; editionCount: number }`. Open Library reads `search.json?q=author_key:<id>&sort=editions&limit=100&page=N` until every page is read, keeps docs whose first `author_key` is the Author and whose `edition_count` is at least 1, and returns them in that order. An unreadable page throws `SourceError` (a partial list would look complete); an Author the Source has no works for returns `[]`.
- The stub Source implements it for Tolkien: The Hobbit and The Fellowship of the Ring (already stub Books) and one new stub Book, The Silmarillion (no Series), so e2e and integration tests can watch a work arrive. The seed Source does not implement it.
- Source vocabulary and IDs stay inside `catalog/sources/open-library/`.

### 2. Storage

- New nullable columns on `authors` (one expand migration):
  - `works_synced_at timestamptz`: when the bibliography was last read.
  - `source_work_count integer`: how many works the last read found (after decisions 4 and 5).
- `books.series_import_only` becomes the general "imported by a sync, not yet reached" mark for both Series and bibliography imports. The column keeps its name (renaming it would break the previous code version during a deploy); the Drizzle property becomes `importOnly`, and its comment and D-203 say so. `resolve`'s reach clears it as before.

### 3. Import flow

- `GET /v1/authors/:slug` checks, after loading the page data, whether the Author is due: it has a Source link for the active Source, `works_synced_at` is null or older than 30 days, and at least one Book it is credited on (any Role) has `import_only = false`. If so it queues `catalog.author-sync` (`{ authorId }`) at background priority with BullMQ deduplication `catalog.author-sync-<authorId>`. Queuing failures are logged, never shown; the page never waits.
- The `catalog.author-sync` job:
  1. Calls `getAuthorWorks` through the shared rate limiter at background priority.
  2. Sets `source_work_count`.
  3. Queues one `catalog.author-work` job (`{ authorId, sourceId }`, deduplicated by both, 5 attempts with backoff, background priority) for each work not already linked to a Catalog Book.
  4. Sets `works_synced_at`.
  An unreadable list fails the job, which BullMQ retries; an Author without a Source link or a Source without `getAuthorWorks` is a no-op logged as such.
- The `catalog.author-work` job fetches the work with `getBook` and its Authors with `getAuthor`, and stores it through `ingestBook` with the import-only mark (decision 6). A work stored meanwhile is skipped. A Source failure throws so the job retries; a work the Source no longer has is logged and skipped.
- New works arrive on a later sync (at most every 30 days per Author, and only when the page is viewed).

### 4. Display

- **Order:** an Author's Books in each Role are ordered by RePrint review count, then `books.source_edition_count` (D-191; unknown last), then title, then ID.
- **Written list:** the first 24, and a "Show more" link (`?page=N`, a plain link that works without JavaScript) that shows the first 24 × N with a count of how many remain, landing at the list. Other Roles (co-written, translated, illustrated, ...) are short and stay whole. The API takes `?page=N` (1 to 50) and returns `writtenTotal` with the Written items.
- **Adding note:** while the stored Written count is below `source_work_count` and the last sync was within a day, a note under the Written heading says "Still adding Books by this author." (the Series page pattern, `adding` in the response).
- The Author page shows only stored Books (PRD §6): imported Books are ordinary Books with their own pages, ratings, and shelves.

### 5. Errors, limits, and operations

- No cap (decision 3). A 300-work Author is about 1,200 Source requests at the gateway's background rate, so roughly 10 to 20 minutes before the list is complete; a very prolific Author can take hours. Interactive searches and first views always go first. The admin System page already shows queue depth and the rate limiter.
- One level (decision 6), so one view cannot pull in a web of Authors and Series.
- Open Library files many translations and reissues as separate works; possible duplicates go to the merge queue as they do today. This is accepted (decision 7).

### 6. Testing

- **Contract:** a recorded fixture of an Author's works search (two pages); first-author and Edition filters; order; an unreadable later page throws.
- **Integration:**
  - The Author route queues a sync only when due (Source link, 30 days, a reached Book); a crawler-style view of an Author whose only Books are import-only queues nothing.
  - The sync records the count, queues only missing works, and sets `works_synced_at`; an unreadable list fails.
  - A work job stores the Book import-only; that Book queues no Series syncs on view and does not make its co-authors due.
  - Ordering by review count, then Edition count; Written paging and `writtenTotal`; `adding`.
  - The migration adds the two columns.
- **Component:** Written list with "Show more" and the remaining count; the adding note; axe.
- **E2E:** with the stub Source, reach The Hobbit, open Tolkien's page, and see The Silmarillion on it once the job has run.

### 7. Docs

- D-203 in `docs/DECISIONS.md` (owner decision; proposes PRD §6 wording: "RePrint stores the Books its Members use, plus the other Books in their Series and the other works of their Authors when the Source lists them").
- A PROGRESS note, DESIGN.md for the Written list and the adding note.
- No new environment variables.

## Out of scope

- Works where the Author is not listed first (anthologies, co-written books led by someone else, introductions).
- A live, not-yet-stored list of an Author's works.
- Cleaning up Open Library's duplicate and translated works beyond the merge queue.
