# M5 · Discovery

## Goal

Make RePrint browsable. Build the Discover home page, Genre and Series pages, weighted rankings, and helpful votes, so the best reviews rise to the top. A visitor who arrives with no book in mind should find one in a couple of clicks.

## PRD sections covered

§3 (milestone 5), §5.3 (Helpful vote), §7.2 (Discover rows, caching, hidden sparse rows), §7.5 (Genre and Series pages), §7.6 (helpful votes, sort by votes with newest tiebreak, weighted average for rankings), §9 (`helpful_votes`, `featured_items`), §10 (`/genres`, `/genres/:slug`, `/series/:slug`, `/discover`, `/reviews/:id/helpful`), §13 (seed fills Discover).

## Deliverables

- `helpful_votes` and `POST/DELETE /reviews/:id/helpful` with `helpful_count` kept in the same transaction; the web helpful button.
- `GET /genres` (tree) and `/genres/:slug` (with child Genres; sorts: top rated by weighted average, most reviewed, newest review).
- `GET /series/:slug` (reading order, position, rating).
- `featured_items`, row builders, the `discover.rebuild` job every 10 minutes, `GET /discover`.
- Web: `/` Discover, `/genres`, `/genres/:slug`, `/series/:slug`.
- Seed: featured Genres, a featured review, helpful votes.

## Acceptance criteria

1. A verified Member can mark someone else's Approved review helpful once and remove the vote; their own reviews and non-Approved reviews can't be voted on; the review shows "N people found this helpful".
2. "Most helpful" sorts by vote count, with ties broken by newest.
3. Discover shows Recently reviewed (one card per Book), Top rated on RePrint (weighted, ≥ 5 approved reviews), Most reviewed this month (last 30 days), Browse by genre (12 featured Genres plus a link to all), and Featured review.
4. Any row with fewer than 6 Books is hidden. Rows are rebuilt every 10 minutes and served from cache.
5. Visitors see the same Discover page as Members, apart from sign-in prompts.
6. A Genre page includes Books from child Genres and sorts three ways. A Series page lists Books in reading order with positions (decimal positions are allowed; empty positions go last).
7. With the seed loaded, every Discover row is visible locally, and axe passes on Discover, Genre, and Series pages.

## Implementation choices (recorded in `docs/DECISIONS.md`)

- Site-wide mean `m` for the weighted average is recomputed with each Discover rebuild and cached.
- Discover rows are cached in Redis under one versioned key per row.
- Until M7's admin UI exists, featured items come from the seed or direct DB edits in local dev.

## Out of scope

- Shelf status on Series pages and shelf controls on Discover cards (M6).
- The admin UI for choosing featured content (M7-T15).
- Personalized recommendations and following users (out of v1).

## Human prerequisites

- None.
