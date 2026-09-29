# M6 · Libraries and profiles

## Goal

Give Members a reason to come back: three shelves, a Library page, and a public profile showing their approved reviews. Libraries stay secondary. Shelving is one control, never required for reviewing, and never changes a review.

## PRD sections covered

§3 (milestone 6), §5.3 (Shelf, Shelf entry, Library), §6 (a Book is stored when a Member shelves it), §7.5 (the viewer's shelf status on Series pages), §7.7 (all), §7.8 (all), §9 (`shelf_entries`), §10 (Library and Profiles endpoints), §11 (data export as JSON), §12 (component: shelf selector; e2e: shelve and view a library), §13 (seeded libraries).

## Deliverables

- `shelf_entries` and `PUT/DELETE /books/:slug/shelf` (unverified Members allowed).
- `viewerShelf` on Book, search, Series, and Discover responses, with private caching when viewer data is present.
- `ShelfSelector` on the book page, search results (resolving candidates first), Discover cards, and Series page.
- `GET /users/:username/library` with tabs, counts, sorts, and privacy; the web `/u/:username/library` page.
- `GET /users/:username`, `/users/:username/reviews`; the web `/u/:username` profile.
- `GET /me/export` (JSON) and a settings button.
- Seed shelves; `e2e/library.spec.ts`.

## Acceptance criteria

1. A signed-in Member (verified or not) can put a Book on Want to Read, Reading, or Read from the book page, search results, Discover cards, or a Series page; choosing another shelf replaces it; "Remove" takes it off.
2. Shelving a "not yet on RePrint" search result stores the Book first.
3. Shelving never creates a review, and reviewing never shelves.
4. `/u/<username>/library` shows All, Reading, Want to Read, and Read tabs with counts, sorted by date added (newest or oldest), title, or author.
5. A private library is hidden from everyone but its owner, and the profile shows no Library tab to others.
6. `/u/<username>` shows avatar, display name, username, bio, join date, approved review total, helpful votes received, and the Reviews tab (Approved only, newest first).
7. A Member can download their data as JSON from settings, and it contains only their own data.
8. `e2e/library.spec.ts` passes with axe checks.

## Implementation choices (recorded in `docs/DECISIONS.md`)

- `GET /v1/me/export` is added (the PRD requires the feature but lists no endpoint).
- A private library returns 404 to others, so its existence isn't revealed.
- Responses with viewer-specific fields use `Cache-Control: private`.

## Out of scope

- Custom shelves, reading progress, and dates (out of v1).
- Following or activity feeds (out of v1).
- Reports in the export (added by M7-T01).

## Human prerequisites

- None.
