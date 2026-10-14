# Outside Ratings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show Open Library readers' star ratings on the Book page, labeled and separate from RePrint's moderated ratings, and fill them in for stored Books with a one-time script.

**Architecture:** The Open Library adapter reads `ratings_*` from the byline search it already makes (now asking for those fields) into `candidate.book.sourceRating`. Ingest writes it to a new `source_ratings` table through one helper, which the backfill script also uses. The backfill reads ratings 100 Books per request through a new optional adapter method, behind the shared gateway. `GET /v1/books/:slug` returns `outsideRatings` with a display name, and the Book page shows one muted, labeled line per Source with a "Show breakdown" toggle. Nothing RePrint computes reads the table.

**Tech Stack:** Drizzle + Postgres 18 (drizzle-kit), Zod shared schemas, Fastify 5, React Router 8 SSR, Tailwind v4 (no inline styles, D-185), Vitest + Testing Library + axe, Testcontainers, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-14-outside-ratings-design.md`

## Global Constraints

- Display only: `source_ratings` never feeds `books.review_count`, `rating_sum`, `rating_counts`, weighted rankings, Discover, search sort or filters, Book summaries, or JSON-LD.
- Book page only; shown whenever a row exists, however few ratings.
- The API exposes a display name ("Open Library") and numbers only: no Source name, Source ID, or link.
- Source vocabulary and IDs stay inside `apps/api/src/catalog/sources/open-library/` (`pnpm vocabulary:check`).
- Expand-only migration; new response fields are optional in the shared schema.
- No inline `style` (D-185): bar widths use `widthClass`.
- User-facing strings live in `apps/web/app/copy/index.ts`.
- The backfill goes through `createCatalogRuntime` (shared rate limit, User-Agent, circuit breaker) at background priority.
- Commands run on Node 24 (the session's `n24` wrapper).

## Review Focus

1. **A Book with both RePrint reviews and an outside rating:** the RePrint average, count, and breakdown are unchanged by the outside row: Task 1 ingest test and Task 3 route test.
2. **A refresh where the Source has no ratings** (count 0) removes the row; **a Source that does not report ratings** (stub Books without one, the seed Source) leaves it: Task 1 tests.
3. **A backfill batch that fails** is skipped, the rest still run, and the script exits non-zero: Task 5 test.
4. **No RePrint reviews but an outside rating:** the Book page shows the outside line, and JSON-LD has no `aggregateRating`: Task 4 tests.
5. **"1 rating"** reads singular; the average shows one decimal (4.29 → "4.3"): Task 4 component test.

---

### Task 1: The `source_ratings` table, the shared rating type, and ingest

**Files:**
- Modify: `packages/db/src/schema/catalog.ts` (new table, after `sourceLinks`)
- Create: `packages/db/drizzle/0023_<generated>.sql` (+ meta, generated)
- Modify: `packages/shared/src/catalog.ts` (`sourceRatingSchema`, `bookCandidateBookSchema.sourceRating`)
- Create: `apps/api/src/catalog/source-ratings.ts`
- Modify: `apps/api/src/catalog/ingest/ingest.ts` (call the helper after `addLink(tx, 'book', …)`)
- Test: `apps/api/src/catalog/ingest/ingest.integration.test.ts`

**Interfaces:**
- Produces: `sourceRatings` table (`bookId`, `source`, `average: number`, `count: number`, `counts: number[]`, `fetchedAt: Date`; PK `bookId, source`); `sourceRatingSchema` / `type SourceRating = { average: number; count: number; distribution: number[] }` in `@reprint/shared`; `BookCandidate['book']['sourceRating']?: SourceRating | null`; `saveSourceRating(tx: Tx, input: { bookId: string; source: string; rating: SourceRating | null | undefined; now: Date }): Promise<'saved' | 'removed' | 'unchanged'>` where `Tx = Parameters<Parameters<Database['transaction']>[0]>[0]`.

- [ ] **Step 1: Add the shared type**

In `packages/shared/src/catalog.ts`, before `bookCandidateBookSchema`:

```ts
/** A Source's own reader ratings for a Book (D-204): shown beside RePrint ratings, never counted in them. */
export const sourceRatingSchema = z.object({
  average: z.number().min(0).max(5),
  count: z.number().int().min(1),
  /** Ratings at 1 to 5 stars, in that order. */
  distribution: z.array(z.number().int().min(0)).length(5),
})
export type SourceRating = z.infer<typeof sourceRatingSchema>
```

and inside `bookCandidateBookSchema`, after `sourceEditionCount`:

```ts
  /** The Source's reader ratings: `null` when it has none, absent when it did not say (D-204). */
  sourceRating: sourceRatingSchema.nullable().optional(),
```

Run: `pnpm --filter @reprint/shared build`

- [ ] **Step 2: Add the table**

In `packages/db/src/schema/catalog.ts`, after `sourceLinks`:

```ts
/**
 * A Source's own reader ratings for a Book (D-204), one row per Book per Source. Shown on the Book
 * page beside RePrint ratings and never counted in them (`books.rating_*` stay RePrint-only).
 */
export const sourceRatings = pgTable(
  'source_ratings',
  {
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    average: numeric('average', { precision: 3, scale: 2, mode: 'number' }).notNull(),
    count: integer('count').notNull(),
    /** Ratings at 1 to 5 stars, index 0 being one star. */
    counts: integer('counts').array().notNull(),
    fetchedAt: timestamptz('fetched_at').notNull(),
  },
  (t) => [
    // Leads with `book_id`, so the foreign key is indexed.
    primaryKey({ columns: [t.bookId, t.source] }),
    check('source_ratings_count_check', sql`${t.count} > 0`),
  ],
)
```

Run: `pnpm db:generate && cat packages/db/drizzle/0023_*.sql && pnpm db:check && pnpm exec biome check --write packages/db/drizzle && pnpm --filter @reprint/db build`
Expected: one `CREATE TABLE "source_ratings"` with the FK and check; `db:check` OK. (Format the generated meta so lint passes on the committed tree.)

- [ ] **Step 3: Write the failing ingest tests**

In `ingest.integration.test.ts` (it has `db`, a `stub` Source, and `truncateAllTables` per test; reuse its existing helpers for loading stub candidates), import `sourceRatings` from `@reprint/db` and add:

```ts
describe('outside ratings (D-204)', () => {
  const rating = { average: 4.29, count: 500, distribution: [16, 18, 41, 155, 270] }

  async function duneWith(sourceRating: unknown) {
    const dune = await stub.getBook('stub-book-dune')
    if (!dune) throw new Error('no dune')
    return ingestBook(db, {
      source: stub,
      candidate: { ...dune, book: { ...dune.book, sourceRating } } as typeof dune,
    })
  }
  const stored = () => db.select().from(sourceRatings)

  it('stores the Source rating apart from the Book’s RePrint aggregates', async () => {
    const { bookId } = await duneWith(rating)
    expect(await stored()).toMatchObject([
      { bookId, source: 'stub', average: 4.29, count: 500, counts: [16, 18, 41, 155, 270] },
    ])
    const [book] = await db.select().from(books).where(eq(books.id, bookId))
    expect(book).toMatchObject({ reviewCount: 0, ratingSum: 0, ratingCounts: [0, 0, 0, 0, 0] })
  })

  it('replaces it on a later read, and removes it when the Source has none', async () => {
    await duneWith(rating)
    await duneWith({ ...rating, average: 4.1, count: 501 })
    expect(await stored()).toMatchObject([{ average: 4.1, count: 501 }])
    await duneWith(null)
    expect(await stored()).toEqual([])
  })

  it('leaves it alone when the Source does not report ratings', async () => {
    await duneWith(rating)
    await duneWith(undefined)
    expect(await stored()).toHaveLength(1)
  })
})
```

Run: `pnpm --filter api exec vitest run --config vitest.integration.config.ts src/catalog/ingest/ingest.integration.test.ts -t "outside ratings"`
Expected: FAIL (no rows stored).

- [ ] **Step 4: Write the helper**

Create `apps/api/src/catalog/source-ratings.ts`:

```ts
import { type Database, sourceRatings } from '@reprint/db'
import type { SourceRating } from '@reprint/shared'
import { and, eq } from 'drizzle-orm'

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

/**
 * Stores, replaces, or removes a Source's reader rating for a Book (D-204): `null` means the Source
 * has none, so the row goes; `undefined` means it did not say, so nothing changes.
 */
export async function saveSourceRating(
  tx: Tx,
  input: { bookId: string; source: string; rating: SourceRating | null | undefined; now: Date },
): Promise<'saved' | 'removed' | 'unchanged'> {
  const { bookId, source, rating, now } = input
  if (rating === undefined) return 'unchanged'
  if (rating === null) {
    const removed = await tx
      .delete(sourceRatings)
      .where(and(eq(sourceRatings.bookId, bookId), eq(sourceRatings.source, source)))
      .returning({ bookId: sourceRatings.bookId })
    return removed.length > 0 ? 'removed' : 'unchanged'
  }
  const values = {
    average: Math.round(rating.average * 100) / 100,
    count: rating.count,
    counts: rating.distribution,
    fetchedAt: now,
  }
  await tx
    .insert(sourceRatings)
    .values({ bookId, source, ...values })
    .onConflictDoUpdate({ target: [sourceRatings.bookId, sourceRatings.source], set: values })
  return 'saved'
}
```

In `ingest.ts` import it and, right after `await addLink(tx, 'book', book.id, source.name, candidate.sourceLink.sourceId)`:

```ts
    // The Source's reader ratings, kept apart from RePrint's (D-204).
    await saveSourceRating(tx, {
      bookId: book.id,
      source: source.name,
      rating: candidate.book.sourceRating,
      now,
    })
```

- [ ] **Step 5: Run the ingest tests**

Run: `pnpm --filter api exec vitest run --config vitest.integration.config.ts src/catalog/ingest`
Expected: PASS, existing tests included.

- [ ] **Step 6: Commit**

```bash
git add packages/db packages/shared/src/catalog.ts apps/api/src/catalog/source-ratings.ts apps/api/src/catalog/ingest
git commit -m "feat(catalog): store a Source's reader ratings apart from RePrint's (D-204)"
```

---

### Task 2: Open Library and stub ratings

**Files:**
- Create: `apps/api/src/catalog/sources/open-library/ratings.ts`
- Modify: `apps/api/src/catalog/sources/open-library/adapter.ts` (`bylinePath` fields, `getBookRatings`)
- Modify: `apps/api/src/catalog/sources/open-library/record.ts` (`toFullBook` sets `sourceRating`)
- Modify: `apps/api/src/catalog/sources/open-library/record-fixtures.ts` (byline paths)
- Modify: `apps/api/src/catalog/sources/open-library/__fixtures__/work-left-hand-byline.json`, `work-hitchhiker-byline.json` (re-recorded)
- Modify: `apps/api/src/catalog/sources/types.ts` (optional method)
- Modify: `apps/api/src/catalog/sources/stub/stub-adapter.ts`
- Test: `apps/api/src/catalog/sources/open-library/adapter.test.ts`, `stub/stub-adapter.test.ts`

**Interfaces:**
- Consumes: Task 1 `SourceRating`.
- Produces: `SourceAdapter.getBookRatings?(sourceIds: string[]): Promise<Map<string, SourceRating | null>>`; Open Library `getBook` candidates carry `book.sourceRating` (`SourceRating | null`); stub Hobbit has `{ average: 4.29, count: 500, distribution: [16, 18, 41, 155, 270] }`.

- [ ] **Step 1: Ask the byline search for its fields**

Create `open-library/ratings.ts`:

```ts
import type { SourceRating } from '@reprint/shared'
import { z } from 'zod'

const RATING_FIELDS = [
  'ratings_average',
  'ratings_count',
  'ratings_count_1',
  'ratings_count_2',
  'ratings_count_3',
  'ratings_count_4',
  'ratings_count_5',
]

/**
 * The fields the byline search asks for: what the adapter reads from it, plus the ratings, which
 * Open Library leaves out by default (D-204).
 */
export const BYLINE_FIELDS = [
  'key',
  'title',
  'subtitle',
  'author_key',
  'author_name',
  'cover_i',
  'cover_width',
  'cover_height',
  'cover_edition_key',
  'first_publish_year',
  'language',
  'series_key',
  'series_name',
  'series_position',
  ...RATING_FIELDS,
].join(',')

/** How many Books one ratings search asks for. */
export const RATINGS_BATCH_SIZE = 100

/** One search for the ratings of up to `RATINGS_BATCH_SIZE` works (D-204). */
export function ratingsSearchPath(workIds: string[]): string {
  const params = new URLSearchParams({
    q: `key:(${workIds.map((id) => `/works/${id}`).join(' OR ')})`,
    fields: ['key', ...RATING_FIELDS].join(','),
    limit: String(RATINGS_BATCH_SIZE),
  })
  return `/search.json?${params.toString()}`
}

const ratingsDocSchema = z.object({
  ratings_average: z.number().min(0).max(5).optional(),
  ratings_count: z.number().int().min(0).optional(),
  ratings_count_1: z.number().int().min(0).optional(),
  ratings_count_2: z.number().int().min(0).optional(),
  ratings_count_3: z.number().int().min(0).optional(),
  ratings_count_4: z.number().int().min(0).optional(),
  ratings_count_5: z.number().int().min(0).optional(),
})

/** A search result's ratings in RePrint terms, or `null` when it has none (D-204). */
export function toSourceRating(raw: unknown): SourceRating | null {
  const doc = ratingsDocSchema.safeParse(raw)
  if (!doc.success) return null
  const { ratings_average: average, ratings_count: count } = doc.data
  if (!count || average === undefined) return null
  return {
    average,
    count,
    distribution: [
      doc.data.ratings_count_1 ?? 0,
      doc.data.ratings_count_2 ?? 0,
      doc.data.ratings_count_3 ?? 0,
      doc.data.ratings_count_4 ?? 0,
      doc.data.ratings_count_5 ?? 0,
    ],
  }
}
```

In `adapter.ts` change `bylinePath` to:

```ts
export function bylinePath(workId: string): string {
  const params = new URLSearchParams({ q: `key:/works/${workId}`, fields: BYLINE_FIELDS, limit: '1' })
  return `/search.json?${params.toString()}`
}
```

In `record-fixtures.ts` replace the two byline entries' `path` with the new path, built by hand from `bylinePath` (print them with `pnpm --filter api exec tsx -e "import('./src/catalog/sources/open-library/adapter.ts').then((m) => console.log(m.bylinePath('OL59800W'), m.bylinePath('OL2163649W')))"`). Then re-record only those two (live, two read-only requests):

```bash
pnpm --filter api exec tsx -e "import('./src/catalog/sources/open-library/record-fixtures.ts').then(async (m) => console.log(await m.recordFixtures({ userAgent: 'RePrint/0.0.0 (ops@reprint.com)', requests: m.FIXTURE_REQUESTS.filter((r) => r.name.endsWith('-byline')) })))"
pnpm exec biome check --write apps/api/src/catalog/sources/open-library/__fixtures__
pnpm --filter api exec vitest run src/catalog/sources/open-library
```

Expected: both files written with `ratings_*` fields; every existing adapter test still passes. If a re-recorded value moved (a cover edition, a Series), pin the recorded value and ledger a ruling.

- [ ] **Step 2: Write the failing adapter tests**

Append to `adapter.test.ts`:

```ts
describe('Open Library ratings (D-204)', () => {
  it('reads the byline result’s ratings into the Book', async () => {
    const book = await adapter.getBook('OL59800W')
    expect(book?.book.sourceRating?.count).toBeGreaterThan(0)
    expect(book?.book.sourceRating?.distribution).toHaveLength(5)
    expect(
      book?.book.sourceRating?.distribution.reduce((sum, n) => sum + n, 0),
    ).toBe(book?.book.sourceRating?.count)
  })

  it('gives null for a work with no ratings', () => {
    expect(toSourceRating({ key: '/works/OL1W', ratings_count: 0 })).toBeNull()
    expect(toSourceRating({ key: '/works/OL1W' })).toBeNull()
  })

  it('reads many Books in one search, skipping malformed IDs', async () => {
    const asked: string[] = []
    const many = createOpenLibraryAdapter({
      fetch: async (input) => {
        asked.push(new URL(String(input)).searchParams.get('q') ?? '')
        return Response.json({
          numFound: 2,
          docs: [
            { key: '/works/OL1W', ratings_average: 4.5, ratings_count: 2, ratings_count_4: 1, ratings_count_5: 1 },
            { key: '/works/OL2W', ratings_count: 0 },
          ],
        })
      },
    })
    const ratings = await many.getBookRatings?.(['OL1W', 'OL2W', '../x'])
    expect(asked).toEqual(['key:(/works/OL1W OR /works/OL2W)'])
    expect(ratings?.get('OL1W')).toEqual({ average: 4.5, count: 2, distribution: [0, 0, 0, 1, 1] })
    expect(ratings?.get('OL2W')).toBeNull()
    expect(ratings?.has('../x')).toBe(false)
  })

  it('throws when a ratings search cannot be read', async () => {
    const broken = createOpenLibraryAdapter({ fetch: replay('{"docs": 4}') })
    await expect(broken.getBookRatings?.(['OL1W'])).rejects.toBeInstanceOf(SourceError)
  })
})
```

(import `toSourceRating` from `./ratings.js`.)

Run: `pnpm --filter api exec vitest run src/catalog/sources/open-library/adapter.test.ts -t "ratings"`
Expected: FAIL (`sourceRating` undefined; `getBookRatings` undefined).

- [ ] **Step 3: Implement**

In `types.ts` import `SourceRating` from `@reprint/shared` and add to `SourceAdapter`, after `getAuthorBooks?`:

```ts
  /**
   * The current reader rating for each Book asked for, by Source ID; `null` when the Source has
   * none, and Books it did not return are left out (D-204). Throws when a page cannot be read.
   */
  getBookRatings?(sourceIds: string[]): Promise<Map<string, SourceRating | null>>
```

In `record.ts` import `toSourceRating` from `./ratings.js` and in `toFullBook`'s `book`, after `sourceEditionCount,` add `sourceRating: toSourceRating(bylineDoc),`.

In `adapter.ts` import `{ BYLINE_FIELDS, RATINGS_BATCH_SIZE, ratingsSearchPath, toSourceRating }` from `./ratings.js` and `type SourceRating` from `@reprint/shared`, and add after `getAuthorBooks`:

```ts
    async getBookRatings(sourceIds): Promise<Map<string, SourceRating | null>> {
      const ids = sourceIds.filter((id) => workIdSchema.safeParse(id).success)
      const found = new Map<string, SourceRating | null>()
      for (let start = 0; start < ids.length; start += RATINGS_BATCH_SIZE) {
        const body = searchResponseSchema.safeParse(
          await getJson(ratingsSearchPath(ids.slice(start, start + RATINGS_BATCH_SIZE))),
        )
        if (!body.success) throw new SourceError('Open Library returned an unreadable ratings search')
        for (const doc of body.data.docs) {
          const key = z.object({ key: z.string().regex(/^\/works\/OL\d+W$/) }).safeParse(doc)
          if (key.success) found.set(key.data.key.replace('/works/', ''), toSourceRating(doc))
        }
      }
      return found
    },
```

Run: `pnpm --filter api exec vitest run src/catalog/sources/open-library`
Expected: PASS.

- [ ] **Step 4: Stub ratings, test first**

Append inside `describe('stub Source', …)` in `stub-adapter.test.ts`:

```ts
  it('rates The Hobbit and answers ratings for its Books (D-204)', async () => {
    const stub = createStubSource()
    expect((await stub.getBook('stub-book-hobbit'))?.book.sourceRating?.count).toBe(500)
    const ratings = await stub.getBookRatings?.(['stub-book-hobbit', 'stub-book-dune', 'nope'])
    expect(ratings?.get('stub-book-hobbit')?.average).toBe(4.29)
    expect(ratings?.get('stub-book-dune')).toBeNull()
    expect(ratings?.has('nope')).toBe(false)
  })
```

Run: `pnpm --filter api exec vitest run src/catalog/sources/stub` → FAIL. Then in `stub-adapter.ts` add:

```ts
/** The Hobbit's reader ratings, so the Book page can show an outside rating in specs (D-204). */
const HOBBIT_RATING = { average: 4.29, count: 500, distribution: [16, 18, 41, 155, 270] }
```

wrap the Hobbit entry: `'stub-book-hobbit': withRating(bookCandidate(…unchanged…), HOBBIT_RATING),` with

```ts
function withRating(candidate: BookCandidate, sourceRating: SourceRating): BookCandidate {
  return { ...candidate, book: { ...candidate.book, sourceRating } }
}
```

and after `getAuthorBooks`:

```ts
    async getBookRatings(sourceIds) {
      const found = new Map<string, SourceRating | null>()
      for (const id of sourceIds) {
        const book = BOOKS[id]
        if (book) found.set(id, book.book.sourceRating ?? null)
      }
      return found
    },
```

(import `type SourceRating` from `@reprint/shared`.) Run: `pnpm --filter api exec vitest run src/catalog/sources && pnpm vocabulary:check` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/catalog/sources
git commit -m "feat(catalog): read Open Library readers' ratings in the adapters (D-204)"
```

---

### Task 3: `outsideRatings` on the Book API

**Files:**
- Modify: `packages/shared/src/catalog-api.ts` (`outsideRatingSchema`, `bookDetailSchema.outsideRatings`)
- Modify: `apps/api/src/catalog/sources/index.ts` (`SOURCE_DISPLAY_NAMES`)
- Modify: `apps/api/src/modules/catalog/read.ts` (`loadBookDetail`)
- Test: `apps/api/src/modules/catalog/catalog.integration.test.ts`
- Modify: `apps/api/openapi.json` (regenerated)

**Interfaces:**
- Consumes: Task 1 `sourceRatings`, `sourceRatingSchema`.
- Produces: `outsideRatingSchema` / `type OutsideRating = SourceRating & { sourceName: string }`; `BookDetail.outsideRatings?: OutsideRating[]`; `SOURCE_DISPLAY_NAMES: Readonly<Record<string, string>>`.

- [ ] **Step 1: Schema**

In `catalog-api.ts` (import `sourceRatingSchema` from `./catalog.js`):

```ts
/** A Source's reader rating as the Book page shows it, under the Source's display name (D-204). */
export const outsideRatingSchema = sourceRatingSchema.extend({ sourceName: z.string().min(1) })
export type OutsideRating = z.infer<typeof outsideRatingSchema>
```

and in `bookDetailSchema`'s `extend`, after `rating`:

```ts
  /** Other Sources' reader ratings, shown apart from RePrint's and never counted in them (D-204). */
  outsideRatings: z.array(outsideRatingSchema).optional(),
```

Run: `pnpm --filter @reprint/shared build`

- [ ] **Step 2: Failing route test**

In `catalog.integration.test.ts`, import `sourceRatings` from `@reprint/db`; inside `describe('GET /v1/books/:slug', …)`:

```ts
  it('returns outside ratings under the Source’s display name, apart from RePrint’s (D-204)', async () => {
    const { slug, bookId } = await ingest('stub-book-dune', 'stub-author-herbert')
    await stack.db.db
      .update(books)
      .set({ reviewCount: 1, ratingSum: 5, ratingCounts: [0, 0, 0, 0, 1] })
      .where(eq(books.id, bookId))
    await stack.db.db.insert(sourceRatings).values([
      { bookId, source: 'stub', average: 4.29, count: 500, counts: [16, 18, 41, 155, 270], fetchedAt: new Date() },
      { bookId, source: 'unknown-source', average: 1, count: 1, counts: [1, 0, 0, 0, 0], fetchedAt: new Date() },
    ])
    const body = bookDetailSchema.parse(
      (await app.inject({ method: 'GET', url: `/v1/books/${slug}` })).json(),
    )
    expect(body.outsideRatings).toEqual([
      { sourceName: 'Open Library', average: 4.29, count: 500, distribution: [16, 18, 41, 155, 270] },
    ])
    expect(body.rating).toEqual({ average: 5, count: 1, distribution: [0, 0, 0, 0, 1] })
  })
```

Run: `pnpm --filter api exec vitest run --config vitest.integration.config.ts src/modules/catalog/catalog.integration.test.ts -t "outside ratings"`
Expected: FAIL (`outsideRatings` undefined).

- [ ] **Step 3: Implement**

In `sources/index.ts` after `sourceTextCleaners`:

```ts
/**
 * The name readers see for each Source's data (D-204). The stub stands in for Open Library in local
 * runs and specs, so it shows the same name.
 */
export const SOURCE_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  [OPEN_LIBRARY]: 'Open Library',
  stub: 'Open Library',
}
```

In `read.ts` import `sourceRatings` from `@reprint/db` and `SOURCE_DISPLAY_NAMES` from `../../catalog/sources/index.js`; add to `loadBookDetail`'s `Promise.all` a fifth query `db.select().from(sourceRatings).where(eq(sourceRatings.bookId, book.id))` (name it `outsideRows`), and to the returned object after `rating`:

```ts
    // Other Sources' reader ratings, under a name readers know; never mixed into `rating` (D-204).
    outsideRatings: outsideRows
      .flatMap((row) => {
        const sourceName = SOURCE_DISPLAY_NAMES[row.source]
        return sourceName
          ? [{ sourceName, average: row.average, count: row.count, distribution: row.counts }]
          : []
      })
      .sort((a, b) => a.sourceName.localeCompare(b.sourceName)),
```

- [ ] **Step 4: Run and regenerate OpenAPI**

Run: `pnpm --filter api exec vitest run --config vitest.integration.config.ts src/modules/catalog && pnpm --filter api build && pnpm openapi:check`
Expected: PASS; `openapi.json` gains `outsideRatings`; check reports up to date.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/catalog-api.ts apps/api/src/catalog/sources/index.ts apps/api/src/modules/catalog apps/api/openapi.json
git commit -m "feat(api): Book detail returns other Sources' reader ratings (D-204)"
```

---

### Task 4: The Book page's outside-ratings panel

**Files:**
- Modify: `apps/web/app/copy/index.ts` (`copy.redesign.outsideRatings`)
- Create: `apps/web/app/components/books/outside-ratings.tsx`
- Test: `apps/web/app/components/books/outside-ratings.test.tsx`
- Modify: `apps/web/app/components/books/book-page.tsx` (render under the summary card)
- Test: `apps/web/app/components/books/book-page.test.tsx`, `apps/web/app/lib/json-ld.test.ts`

**Interfaces:**
- Consumes: Task 3 `OutsideRating`, `BookDetail.outsideRatings`.
- Produces: `OutsideRatings({ ratings }: { ratings: OutsideRating[] })`.

- [ ] **Step 1: Copy**

In `copy.redesign`, add:

```ts
    outsideRatings: {
      heading: 'Ratings elsewhere',
      label: (source: string) => `${source} readers`,
      average: (average: string) => `Average ${average} out of 5`,
      count: (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'rating' : 'ratings'}`,
      show: 'Show breakdown',
      hide: 'Hide breakdown',
      breakdown: (source: string) => `${source} readers’ ratings by stars`,
      bar: (stars: number, n: number) =>
        `${stars} ${stars === 1 ? 'star' : 'stars'}: ${n.toLocaleString('en-US')}`,
    },
```

- [ ] **Step 2: Failing component tests**

Create `outside-ratings.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import axe from 'axe-core'
import { afterEach, describe, expect, it } from 'vitest'
import { OutsideRatings } from './outside-ratings.js'

afterEach(cleanup)

const openLibrary = {
  sourceName: 'Open Library',
  average: 4.29,
  count: 500,
  distribution: [16, 18, 41, 155, 270],
}

describe('OutsideRatings (D-204)', () => {
  it('shows one labeled line per Source with the average to one decimal', () => {
    render(<OutsideRatings ratings={[openLibrary]} />)
    const panel = screen.getByRole('region', { name: 'Ratings elsewhere' })
    expect(panel.textContent).toContain('Open Library readers')
    expect(panel.textContent).toContain('4.3')
    expect(panel.textContent).toContain('500 ratings')
    expect(within(panel).getByText('Average 4.3 out of 5')).toBeTruthy()
  })

  it('reads 1 rating in the singular', () => {
    render(<OutsideRatings ratings={[{ ...openLibrary, count: 1, distribution: [0, 0, 0, 0, 1] }]} />)
    expect(screen.getByRole('region').textContent).toContain('1 rating')
    expect(screen.getByRole('region').textContent).not.toContain('1 ratings')
  })

  it('reveals its own breakdown, with a text alternative for each bar', () => {
    render(<OutsideRatings ratings={[openLibrary]} />)
    const toggle = screen.getByRole('button', { name: 'Show breakdown' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('list')).toBeNull()
    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'Hide breakdown' }).getAttribute('aria-expanded')).toBe('true')
    const list = screen.getByRole('list', { name: 'Open Library readers’ ratings by stars' })
    expect(within(list).getByText('5 stars: 270')).toBeTruthy()
    expect(within(list).getByText('1 star: 16')).toBeTruthy()
  })

  it('renders nothing without ratings', () => {
    const { container } = render(<OutsideRatings ratings={[]} />)
    expect(container.textContent).toBe('')
  })

  it('has no axe violations, open or closed', async () => {
    const { container } = render(<OutsideRatings ratings={[openLibrary]} />)
    expect((await axe.run(container)).violations).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Show breakdown' }))
    expect((await axe.run(container)).violations).toEqual([])
  })
})
```

Run: `pnpm --filter web exec vitest run app/components/books/outside-ratings.test.tsx` → FAIL (module missing).

- [ ] **Step 3: The component**

Create `outside-ratings.tsx`:

```tsx
import type { OutsideRating } from '@reprint/shared'
import { useId, useState } from 'react'
import { copy } from '../../copy/index.js'
import { widthClass } from '../../lib/width-class.js'

const text = copy.redesign.outsideRatings

function OutsideRatingLine({ rating }: { rating: OutsideRating }) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const average = rating.average.toFixed(1)
  const max = Math.max(...rating.distribution, 1)
  return (
    <div className="flex flex-col gap-3">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold text-foreground">{text.label(rating.sourceName)}</span>
        <span aria-hidden="true">·</span>
        <span>
          <span aria-hidden="true">
            <span className="text-star">★</span> {average}
          </span>
          <span className="sr-only">{text.average(average)}</span>
        </span>
        <span aria-hidden="true">·</span>
        <span>{text.count(rating.count)}</span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((value) => !value)}
          className="font-semibold text-link underline underline-offset-[3px]"
        >
          {open ? text.hide : text.show}
        </button>
      </p>
      <ul
        id={listId}
        hidden={!open}
        aria-label={text.breakdown(rating.sourceName)}
        className="flex max-w-sm flex-col gap-1"
      >
        {[5, 4, 3, 2, 1].map((stars) => {
          const n = rating.distribution[stars - 1] ?? 0
          return (
            <li
              key={stars}
              className="grid grid-cols-[36px_minmax(0,1fr)_48px] items-center gap-2.5 text-sm"
            >
              <span aria-hidden="true">{stars} ★</span>
              <span aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-[#ece8e0]">
                <span className={`block h-full rounded-full bg-star ${widthClass(n / max)}`} />
              </span>
              <span aria-hidden="true" className="text-right">
                {n.toLocaleString('en-US')}
              </span>
              <span className="sr-only">{text.bar(stars, n)}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * Other Sources' reader ratings (D-204), in their own muted panel under RePrint's summary: labeled
 * with the Source, never mixed into RePrint's numbers, and no link to the Source.
 */
export function OutsideRatings({ ratings }: { ratings: OutsideRating[] }) {
  if (ratings.length === 0) return null
  return (
    <section
      aria-label={text.heading}
      className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-raised p-[18px] text-[15px] text-muted-foreground md:px-7"
    >
      {ratings.map((rating) => (
        <OutsideRatingLine key={rating.sourceName} rating={rating} />
      ))}
    </section>
  )
}
```

(The test queries `queryByRole('list')` as absent while closed: a `hidden` list is not in the accessibility tree, so it passes.)

Run: `pnpm --filter web exec vitest run app/components/books/outside-ratings.test.tsx` → PASS.

- [ ] **Step 4: On the Book page, test first**

In `book-page.test.tsx` add inside `describe('BookPage header', …)` (or a new `describe`):

```tsx
  it('shows Open Library readers’ rating under the review summary, even with no RePrint reviews (D-204)', () => {
    renderPage({
      outsideRatings: [
        { sourceName: 'Open Library', average: 4.29, count: 500, distribution: [16, 18, 41, 155, 270] },
      ],
    })
    const panel = screen.getByRole('region', { name: 'Ratings elsewhere' })
    expect(panel.textContent).toContain('Open Library readers')
    expect(screen.queryByRole('region', { name: 'Rating breakdown' })).toBeNull()
  })
```

Run: `pnpm --filter web exec vitest run app/components/books/book-page.test.tsx -t "Open Library readers"` → FAIL. Then in `book-page.tsx` import `OutsideRatings` and wrap the `summary` prop's content in a fragment, adding after the existing summary `<div>`:

```tsx
                {book.outsideRatings && book.outsideRatings.length > 0 ? (
                  <OutsideRatings ratings={book.outsideRatings} />
                ) : null}
```

(`ReviewsList` renders `summary` whether or not there are reviews, so the panel shows on an unreviewed Book.) Run the test again → PASS.

- [ ] **Step 5: JSON-LD stays RePrint-only, test**

In `json-ld.test.ts`, inside the `bookJsonLd` describe, add:

```ts
  it('never takes outside ratings into aggregateRating (D-204)', () => {
    const node = bookJsonLd(
      origin,
      {
        ...book,
        rating: { average: null, count: 0, distribution: [0, 0, 0, 0, 0] },
        outsideRatings: [
          { sourceName: 'Open Library', average: 4.29, count: 500, distribution: [16, 18, 41, 155, 270] },
        ],
      },
      [],
    )
    expect(node).not.toHaveProperty('aggregateRating')
  })
```

Run: `pnpm --filter web exec vitest run app/lib/json-ld.test.ts` → PASS (it pins existing behavior; `bookJsonLd` reads only `book.rating`). Then `pnpm --filter web typecheck` → clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app
git commit -m "feat(web): Book page shows Open Library readers' rating apart from RePrint's (D-204)"
```

---

### Task 5: The one-time backfill

**Files:**
- Create: `apps/api/src/catalog/backfill-ratings.ts`
- Test: `apps/api/src/catalog/backfill-ratings.integration.test.ts`
- Create: `apps/api/src/scripts/backfill-ratings.ts`
- Modify: `apps/api/package.json` (`catalog:backfill-ratings`)
- Modify: `docs/deploy.md` ("One-time data steps")

**Interfaces:**
- Consumes: Task 1 `saveSourceRating`; Task 2 `getBookRatings`; Task 1 of D-203 `Call`, `direct` from `./import-book.js`.
- Produces: `backfillSourceRatings(options: { db: Database; source: SourceAdapter; call?: Call; batchSize?: number; now?: Date; log?: (message: string, detail: Record<string, unknown>) => void }): Promise<{ saved: number; removed: number; failedBatches: number }>`.

- [ ] **Step 1: Failing tests**

Create `backfill-ratings.integration.test.ts`:

```ts
import { books, createDb, sourceRatings } from '@reprint/db'
import { startTestDatabase, type TestDatabase, truncateAllTables } from '@reprint/db/testing'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { backfillSourceRatings } from './backfill-ratings.js'
import { ingestBook } from './ingest/ingest.js'
import { createStubSource } from './sources/stub/stub-adapter.js'
import { SourceError } from './sources/types.js'

let database: TestDatabase
let db: ReturnType<typeof createDb>['db']
let closeDb: () => Promise<void>
const stub = createStubSource()

beforeAll(async () => {
  database = await startTestDatabase()
  const client = createDb(database.url)
  db = client.db
  closeDb = client.close
})
afterAll(async () => {
  await closeDb?.()
  await database?.stop()
})
beforeEach(() => truncateAllTables(database.sql))

/** Stores Dune and the Hobbit, then forgets their ratings, as Books stored before D-204 would be. */
async function storeWithoutRatings() {
  for (const id of ['stub-book-dune', 'stub-book-hobbit']) {
    const candidate = await stub.getBook(id)
    if (!candidate) throw new Error(`no ${id}`)
    await ingestBook(db, { source: stub, candidate })
  }
  await db.delete(sourceRatings)
}

const ratingsByTitle = async () =>
  (
    await db
      .select({ title: books.title, count: sourceRatings.count })
      .from(sourceRatings)
      .innerJoin(books, eq(books.id, sourceRatings.bookId))
  ).map((row) => [row.title, row.count])

describe('backfillSourceRatings (D-204)', () => {
  it('fills in the ratings the Source has and removes those it no longer has', async () => {
    await storeWithoutRatings()
    const [dune] = await db.select({ id: books.id }).from(books).where(eq(books.title, 'Dune'))
    await db.insert(sourceRatings).values({
      bookId: dune?.id ?? '',
      source: 'stub',
      average: 3,
      count: 2,
      counts: [0, 0, 2, 0, 0],
      fetchedAt: new Date(),
    })
    expect(await backfillSourceRatings({ db, source: stub })).toEqual({
      saved: 1,
      removed: 1,
      failedBatches: 0,
    })
    expect(await ratingsByTitle()).toEqual([['The Hobbit', 500]])
  })

  it('leaves Books the Source did not return as they are, and is safe to run again', async () => {
    await storeWithoutRatings()
    const partial = { ...stub, getBookRatings: async () => new Map() }
    expect(await backfillSourceRatings({ db, source: partial })).toEqual({
      saved: 0,
      removed: 0,
      failedBatches: 0,
    })
    await backfillSourceRatings({ db, source: stub })
    expect(await backfillSourceRatings({ db, source: stub })).toMatchObject({ failedBatches: 0 })
    expect(await ratingsByTitle()).toEqual([['The Hobbit', 500]])
  })

  it('skips a batch the Source fails on, carries on, and reports it', async () => {
    await storeWithoutRatings()
    const logged: string[] = []
    const flaky = {
      ...stub,
      getBookRatings: async (ids: string[]) => {
        if (ids.includes('stub-book-dune')) throw new SourceError('Open Library is down')
        return stub.getBookRatings?.(ids) ?? new Map()
      },
    }
    const result = await backfillSourceRatings({
      db,
      source: flaky,
      batchSize: 1,
      log: (message) => logged.push(message),
    })
    expect(result).toEqual({ saved: 1, removed: 0, failedBatches: 1 })
    expect(logged).toHaveLength(1)
    expect(await ratingsByTitle()).toEqual([['The Hobbit', 500]])
  })
})
```

Run: `pnpm --filter api exec vitest run --config vitest.integration.config.ts src/catalog/backfill-ratings.integration.test.ts` → FAIL (module missing).

- [ ] **Step 2: Implement**

Create `backfill-ratings.ts`:

```ts
import { type Database, sourceLinks } from '@reprint/db'
import type { SourceRating } from '@reprint/shared'
import { and, asc, eq, gt } from 'drizzle-orm'
import { type Call, direct } from './import-book.js'
import { saveSourceRating } from './source-ratings.js'
import type { SourceAdapter } from './sources/types.js'

/**
 * Fills in or refreshes the Source's reader ratings for every stored Book linked to it (D-204), a
 * batch of Books per request. Books the Source did not return are left as they are; a batch the
 * Source fails on is logged and skipped, so the run can be repeated.
 */
export async function backfillSourceRatings(options: {
  db: Database
  source: SourceAdapter
  call?: Call
  batchSize?: number
  now?: Date
  log?: (message: string, detail: Record<string, unknown>) => void
}): Promise<{ saved: number; removed: number; failedBatches: number }> {
  const { db, source } = options
  const call = options.call ?? direct
  const batchSize = options.batchSize ?? 100
  const now = options.now ?? new Date()
  const totals = { saved: 0, removed: 0, failedBatches: 0 }
  const getBookRatings = source.getBookRatings?.bind(source)
  if (!getBookRatings) return totals
  for (let after = ''; ; ) {
    const links = await db
      .select({ id: sourceLinks.id, sourceId: sourceLinks.sourceId, bookId: sourceLinks.entityId })
      .from(sourceLinks)
      .where(
        and(
          eq(sourceLinks.entityType, 'book'),
          eq(sourceLinks.source, source.name),
          after ? gt(sourceLinks.id, after) : undefined,
        ),
      )
      .orderBy(asc(sourceLinks.id))
      .limit(batchSize)
    const last = links.at(-1)
    if (!last) break
    after = last.id
    let ratings: Map<string, SourceRating | null>
    try {
      ratings = await call(() => getBookRatings(links.map((link) => link.sourceId)))
    } catch (error) {
      totals.failedBatches += 1
      options.log?.('could not read ratings for a batch of Books', {
        err: error,
        first: links[0]?.sourceId,
      })
      continue
    }
    await db.transaction(async (tx) => {
      for (const link of links) {
        if (!ratings.has(link.sourceId)) continue
        const result = await saveSourceRating(tx, {
          bookId: link.bookId,
          source: source.name,
          rating: ratings.get(link.sourceId) ?? null,
          now,
        })
        if (result === 'saved') totals.saved += 1
        if (result === 'removed') totals.removed += 1
      }
    })
    if (links.length < batchSize) break
  }
  return totals
}
```

Run the tests → PASS (3).

- [ ] **Step 3: The script and its docs**

Create `apps/api/src/scripts/backfill-ratings.ts`:

```ts
import { createDb } from '@reprint/db'
import { Redis } from 'ioredis'
import { backfillSourceRatings } from '../catalog/backfill-ratings.js'
import { createCatalogRuntime } from '../catalog/runtime.js'
import { loadWorkerEnv } from '../config/env.js'

/**
 * One-time (and safe to repeat): fills in the Source's reader ratings for Books stored before
 * D-204, through the shared gateway at background priority. `pnpm --filter api catalog:backfill-ratings`
 */
async function main(): Promise<void> {
  const env = loadWorkerEnv()
  const { db, close } = createDb(env.DATABASE_URL, { max: 1 })
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1 })
  try {
    const catalog = createCatalogRuntime(env, redis)
    const result = await backfillSourceRatings({
      db,
      source: catalog.source,
      call: catalog.background,
      log: (message, detail) => console.error(message, detail),
    })
    console.log(
      `Saved ${result.saved} ratings and removed ${result.removed}; ${result.failedBatches} batches failed.`,
    )
    if (result.failedBatches > 0) process.exitCode = 1
  } finally {
    await close()
    redis.disconnect()
  }
}

await main()
```

(The worker imports `{ Redis } from 'ioredis'` the same way.) Add to `apps/api/package.json` scripts: `"catalog:backfill-ratings": "tsx --env-file-if-exists=../../.env src/scripts/backfill-ratings.ts",`. In `docs/deploy.md` under "One-time data steps" add:

```markdown
- **Outside ratings (D-204).** `pnpm --filter api catalog:backfill-ratings` (needs `REDIS_URL` and the Source settings as well) fills in Open Library readers' ratings for stored Books, 100 per request through the shared rate limit. It prints how many it saved and removed, and exits non-zero if a batch failed; run it again to retry.
```

Run: `pnpm --filter api typecheck` → clean.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/catalog/backfill-ratings.ts apps/api/src/catalog/backfill-ratings.integration.test.ts apps/api/src/scripts/backfill-ratings.ts apps/api/package.json docs/deploy.md
git commit -m "feat(catalog): one-time backfill of Open Library readers' ratings (D-204)"
```

---

### Task 6: End to end, docs, the gate, and the local backfill

**Files:**
- Create: `e2e/specs/outside-ratings.spec.ts`
- Modify: `docs/DECISIONS.md` (D-204), `docs/DESIGN.md`, `docs/PROGRESS.md`

- [ ] **Step 1: The e2e spec**

```ts
import { expect, test } from '@playwright/test'
import { expectNoA11yViolations } from '../support/a11y.js'
import { useOwnClientIp } from '../support/identity.js'

// The stub Source rates The Hobbit 4.29 from 500 readers; the Book page shows it apart (D-204).
test('a Book page shows Open Library readers’ rating apart from RePrint’s', async ({ page }) => {
  await useOwnClientIp(page)
  await page.goto('/search?q=hobbit')
  await page.getByRole('main').getByRole('link', { name: /The Hobbit/ }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'The Hobbit' })).toBeVisible()
  const panel = page.getByRole('region', { name: 'Ratings elsewhere' })
  await expect(panel).toContainText('Open Library readers')
  await expect(panel).toContainText('500 ratings')
  await panel.getByRole('button', { name: 'Show breakdown' }).click()
  await expect(panel.getByRole('list', { name: 'Open Library readers’ ratings by stars' })).toBeVisible()
  await expectNoA11yViolations(page)
})
```

Run: `pnpm build && docker compose -p reprint-e2e -f docker-compose.yml -f docker-compose.e2e.yml down -v && node e2e/run.mjs specs/outside-ratings.spec.ts --retries=0` → 3 passed.

- [ ] **Step 2: Docs**

- D-204 in `docs/DECISIONS.md`: owner decision (2026-10-14); the decisions from the spec (display only, Book page only, always shown, backfill script, reading-log counts out); what Open Library offers (ratings, no review text; the byline search now names its fields because the default set omits ratings); storage in `source_ratings`; never counted in RePrint aggregates, rankings, Discover, search, summaries, or JSON-LD; no Source link; proposed PRD §5/§7.4 addition from the spec; Affects list.
- `docs/DESIGN.md`: in the Book page row or the Reviews section notes, "Ratings elsewhere" panel (muted, under the RePrint summary, one line per Source, "Show breakdown" with its own bars).
- `docs/PROGRESS.md`: a `### 2026-10-14 · Outside ratings · owner request · feat/outside-ratings` entry with what was built, deviations (ledgered rulings), and test counts.

- [ ] **Step 3: The full gate**

Run: `pnpm check`, then on a fresh e2e stack `node e2e/run.mjs`. Expected: both pass; record counts in PROGRESS.

- [ ] **Step 4: Run the backfill locally**

The owner's local catalog came from live Open Library. With their local services up (`reprint-postgres-1` on 5432, Redis on 6379) and the default local URLs from `.env.example` (never read `.env`): `DATABASE_URL=postgres://reprint:reprint@localhost:5432/reprint REDIS_URL=redis://localhost:6379 SOURCE_MODE=live pnpm --filter api catalog:backfill-ratings`, then once more to confirm it saves the same rows again and removes none. Record the printed counts in PROGRESS. If `loadWorkerEnv` needs settings that only the owner's `.env` has, stop and hand the command to the owner to run after pulling.

- [ ] **Step 5: Commit**

```bash
git add e2e docs
git commit -m "test(e2e): Open Library readers' rating on the Book page; D-204 docs"
```
