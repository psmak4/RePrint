# Series import: whole Series from the Source

- Date: 2026-10-10
- Status: Design approved by the owner; spec awaiting review
- Decisions to record: D-199 (this design, owner decision; proposes a PRD §6 change)

## Problem

The Hitchhiker's Guide's Book page says "Series · Book 1 of 1" and its Series card lists only itself. RePrint learns Series only from free-text `series` lines on Editions (D-193), so it knows a Book's Series name and position but not the other Books in it. "of 1" appears because the completeness check (positions 1..N all stored) is trivially true with one Book.

Readers should see how long a Series is and which Books are in it, in reading order.

## What the Source offers

Open Library added Series records in 2026. Checked on live data:

- A work record has `series: [{ series: { key: "/series/OL326782L" }, position: "1" }]`.
- `/series/OL326782L.json` gives the name ("The Hitchhiker's Guide to the Galaxy"). Search results also carry `series_key`, `series_name`, and `series_position` (parallel arrays), including the byline search the adapter already makes for each Book, so no extra request is needed for a Book's own Series.
- `search.json?q=series_key:OL326782L` returns every member work with `series_position`, title, authors, first publish year, and cover, in the search-result shape the adapter already parses. Hitchhiker's: 6 members, positions 1 to 6.
- Coverage is partial: Dune, Harry Potter, A Song of Ice and Fire, and The Lord of the Rings have Series records; The Hunger Games, Earthsea, and the Hainish Cycle do not.

## Decisions (owner)

1. **Import every member as a Book** (approach B). The other members become ordinary Catalog Books. This goes beyond PRD §6 ("stores only the Books its Members actually use", "grows with use"); D-199 records it and proposes the PRD change. PRD.md is not edited.
2. **No cap** on how many members are imported.
3. **One level only.** A Series is imported in full only when a Book that a Member reached belongs to it. A Book imported as a Series member records all its Series memberships but does not start imports of its other Series.
4. **The current Book is gently highlighted** in Series lists (tinted background and border, `aria-current="page"`), with no "You're here" label.

"Reached" means the Book was stored or refreshed through `resolve` (opening a search result, an ISBN lookup, shelving or reviewing a candidate) or `refresh` (the 30-day refresh on view, or an admin's Refresh now). Series-member imports and the seed script do not count.

## Design

### 1. Source adapter

- `BookCandidate.book.series[]` entries gain an optional `sourceLink` (`entityType: 'series'`). Open Library fills them from the search result's `series_key`, `series_name`, and `series_position` (the byline search already made for each Book). When a work has Series records, they replace the Edition-text heuristic (D-193); works without any keep the heuristic, which carries no `sourceLink`. `seriesReported` is true when the work has Series records or its Editions were read.
- `SourceAdapter` gains an optional method:

  ```ts
  /** Every member of a Series in reading order, or `null` when the Source has no such Series. */
  getSeriesMembers?(sourceId: string): Promise<SeriesMembers | null>
  ```

  `SeriesMembers` is `{ name: string; members: { sourceId: string; position: number | null; title: string }[] }`. Open Library reads both from `search.json?q=series_key:<id>`, paging 100 at a time until all are read; the name is the member results' `series_name` for that key. A position that is not a number (or is missing) becomes `null`. An empty result is `null`.
- The stub Source implements it for one fixture Series so e2e and integration tests can exercise the flow; the seed Source does not.
- Source vocabulary and IDs stay inside `catalog/sources/open-library/`; everything outside sees `sourceId` strings and RePrint terms.

### 2. Storage

- A Series that came from a Source record gets a `source_links` row (`entity_type = 'series'`). Ingest finds the Series by that link first, then by case-insensitive name (so a Series stored from the heuristic is linked, not duplicated), else creates it.
- New nullable columns on `series` (one expand migration):
  - `source_member_count integer`: how many members the Source lists.
  - `members_synced_at timestamptz`: when the member list was last imported.
- D-194's replace rule is unchanged: a Source that reports its Series list as whole replaces the Book's memberships.

### 3. Import flow

- After `resolve` or `refresh` stores a Book, and whenever a stored Book's page is viewed, each of its Series that has a Source link and was not synced in the last 30 days gets a `catalog.series-sync` job at background priority. Jobs use BullMQ deduplication (`catalog.series-sync-<seriesId>`): a Series already waiting or syncing is not queued twice, and once a sync has run, `members_synced_at` keeps it from being due again. (Amended during implementation: the view trigger and deduplication replace a per-day `jobId`, which blocked a second sync on the same day and left Books stored before this change unsynced until their next refresh.)
- The job:
  1. Calls `getSeriesMembers` through the shared rate limiter at background priority, so interactive searches and first views go first.
  2. Sets `source_member_count`.
  3. For each member not already linked to a Catalog Book, fetches it with `getBook` and stores it through `ingestBook`; the sync has no job queue, so imported members do not queue Series syncs (rule 3). Members already in the Catalog are not fetched again, but the sync adds their membership and position if missing, unless an admin locked that Book's Series. (Amended: without this, a Book stored before its Series record was missing from the list until its own refresh.)
  4. Sets `members_synced_at` when the list was read, even if some members failed.
- A member that fails (Source error, invalid record) is logged and skipped; the next sync retries it. A failure to read the list fails the job, which BullMQ retries with backoff.
- New releases arrive on a later sync (at most every 30 days per Series).
- (Amended after the final review.) The sync job only reads the list, records the count first, links stored members, and queues one `catalog.series-member` job per missing member, so a long Series never holds a worker and each member retries on its own. One level only is enforced by `books.series_import_only` on Books a member job creates: they queue no syncs on refresh or view until a Member opens them from search. An unreadable list page fails the job; a missing Series is recorded as synced. The Book page loads only the 8 Books around the current one (`GET /series/:slug?around=`), and the Series page's note follows an `adding` flag (a sync in the last day left Books out).

### 4. Display

- **Header pill:** "Series name · Book N of M" when `source_member_count` is known, where M is that count; otherwise "Series name · Book N". The trivial-completeness rule is removed.
- **Series card (Book page side column):** the Series name, then members in reading order: position, title, small cover, each linking to its Book. The current Book is gently highlighted (`aria-current="page"`, no label). A Series longer than 8 shows the 8 around the current Book plus "See all M" linking to the Series page.
- **Series page (`/series/:slug`):** every stored member in reading order with position, RePrint rating, and the viewer's Shelf (PRD §7.5). While stored members are fewer than `source_member_count`, a note says "Still adding Books from this Series."
- The `youAreHere` copy is removed.

### 5. Errors, limits, and operations

- No cap (decision 2). A franchise Series of hundreds of Books becomes hundreds of background imports at 2 requests per second, about 4 requests per Book. The admin System page already shows queue depth and the rate limiter.
- No cascade (decision 3), so one view cannot pull in a web of Series.
- Pages never wait on the import: they show what is stored (PRD §6).

### 6. Testing

- **Contract:** recorded fixtures for the Hitchhiker's byline search (with its Series fields) and member search; the paging of members; non-numeric positions become `null`.
- **Unit:** position parsing; Series lookup order (source link, then name).
- **Integration:**
  - `resolve` queues a sync and the job imports the missing members.
  - Members imported by the job queue no syncs.
  - A Series synced within 30 days is not queued.
  - A member that fails is skipped and the rest are stored.
  - The migration adds the two columns.
- **Component:** header pill with and without a member count; Series card ordering, highlight with `aria-current`, and the "See all" cut; Series page "Still adding" note. Axe on each.
- **E2E:** with the stub Source, opening a Series Book leads to its Series page listing all members once the job has run.

### 7. Docs

- D-199 in `docs/DECISIONS.md` (owner decision; proposes changing PRD §6 to allow importing the full Series of a reached Book).
- TASKS entries in `docs/TASKS.md`, a PROGRESS note, and DESIGN.md for the Series card highlight.
- No new environment variables.

## Out of scope

- Series without a Source record (The Hunger Games, Earthsea): they keep the name-only heuristic.
- A second Source for Series (PRD §6 mentions Hardcover).
- Admin editing of Series membership beyond what exists.
