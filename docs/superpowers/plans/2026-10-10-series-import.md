# Series Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a Member reaches a Book in an Open Library Series, import every member of that Series in the background and show the whole Series, in reading order, on the Book page and the Series page.

**Architecture:** The Open Library adapter reads Series records from the search result it already fetches for each Book, and gains `getSeriesMembers` (one search by `series_key`). Ingest links Series to their Source record and reports which Series need a sync. `resolve` and `refresh` queue a `catalog.series-sync` job, which imports missing members through the normal ingest path without queuing further syncs. The web shows "Book N of M" from the Source's member count and lists every stored member.

**Tech Stack:** TypeScript, Fastify 5, Drizzle (Postgres 18), BullMQ, Zod, React Router 8, Vitest, Testcontainers, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-10-series-import-design.md`

## Global Constraints

- Source vocabulary and IDs (`series_key`, `OL…L`, "work") only inside `apps/api/src/catalog/sources/open-library/`; Source IDs only in `source_links` (CLAUDE.md, PRD §5).
- Migrations: generate with `pnpm db:generate`; nullable columns only (expand), never hand-edit an applied migration.
- All Source calls through the shared rate limiter; Series imports at background priority (`catalog.background`), behind interactive requests.
- No cap on members imported. One level only: Books imported by a Series sync never queue a Series sync.
- A Series is synced at most once per 30 days (`STALE_AFTER_MS`).
- Pages never wait on a Source (PRD §6).
- No inline `style` attributes (D-185); user-facing strings in `apps/web/app/copy/`.
- Every new endpoint field validated by Zod; regenerate `apps/api/openapi.json` (`pnpm build` writes it; `pnpm check` checks drift).
- `pnpm check` must pass before each commit that changes code; node 24 (`source ~/.nvm/nvm.sh && nvm use 24`).
- Do not edit `PRD.md`.

## Review Focus

1. **A member already in the Catalog by ISBN but not by Source link** (stored from another candidate). The sync fetches it, and `ingestBook` must match it by ISBN instead of creating a duplicate Book. Test in Task 5: pre-store the Fellowship's ISBN under another Source ID; after the sync there is still one Book with that ISBN.
2. **The Book being viewed is itself a member.** The sync must not re-import it or fail on it. Test in Task 5: syncing the Series of a stored Book calls `getBook` only for the others.
3. **A Series whose name matches one stored by the old heuristic.** It must link to the existing Series, not create "Dune" twice. Test in Task 4.
4. **A member whose Source record fails or is invalid.** The rest still import and `members_synced_at` is set. Test in Task 5.
5. **Positions that are not plain numbers** ("1-3", "Book 2", "") become `null` and sort last; "2.5" stays 2.5. Test in Task 2.

---

## File Structure

- `packages/db/src/schema/catalog.ts`: two new `series` columns. New migration `packages/db/drizzle/0020_*.sql`.
- `packages/shared/src/catalog.ts`: candidate Series entries gain `sourceLink`.
- `packages/shared/src/series-api.ts`: Series detail gains `memberCount`.
- `apps/api/src/catalog/sources/types.ts`: `SeriesMembers` type and optional `getSeriesMembers`.
- `apps/api/src/catalog/sources/open-library/series.ts` (new): parse Series fields from a search result; parse positions; `seriesMembersPath`.
- `apps/api/src/catalog/sources/open-library/search.ts`, `record.ts`, `adapter.ts`: use them.
- `apps/api/src/catalog/sources/stub/stub-adapter.ts`: a two-Book stub Series.
- `apps/api/src/catalog/ingest/ingest.ts`: Series lookup by Source link; `seriesToSync` in the result.
- `apps/api/src/catalog/series-sync.ts` (new): `syncSeries` and `queueSeriesSyncs`.
- `apps/api/src/catalog/resolve.ts`, `refresh.ts`, `modules/catalog/resolve.ts`, `jobs/registry.ts`, `jobs/worker-runtime.ts`: trigger and run the job.
- `apps/api/src/modules/catalog/routes.ts`: `memberCount` in the Series response.
- `apps/web/app/routes/book.tsx`, `components/books/book-page.tsx`, `series-card.tsx`, `series-page.tsx`, `copy/index.ts`: display.

---

### Task 1: Storage and shared types

**Files:**
- Modify: `packages/db/src/schema/catalog.ts` (the `series` table)
- Create: `packages/db/drizzle/0020_<generated>.sql` (via `pnpm db:generate`)
- Modify: `packages/shared/src/catalog.ts` (`bookCandidateBookSchema.series`)
- Modify: `apps/api/src/catalog/sources/types.ts`

**Interfaces:**
- Produces: `series.sourceMemberCount: number | null`, `series.membersSyncedAt: Date | null`; candidate `series[i].sourceLink?: SourceLink` (entityType `'series'`); `SeriesMembers`; `SourceAdapter.getSeriesMembers?(sourceId: string): Promise<SeriesMembers | null>`.

- [ ] **Step 1: Add the columns**

In `packages/db/src/schema/catalog.ts`, import `timestamptz` from `./helpers.js` if not imported, and add to the `series` table after `fieldOrigins`:

```ts
  /** How many members the Source lists for this Series (D-199); `null` when unknown. */
  sourceMemberCount: integer('source_member_count'),
  /** When the Source's member list was last imported (D-199). */
  membersSyncedAt: timestamptz('members_synced_at'),
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`
Expected: a new `packages/db/drizzle/0020_*.sql` containing two `ALTER TABLE "series" ADD COLUMN` statements (both nullable), plus the snapshot and journal updates.

- [ ] **Step 3: Extend the candidate schema**

In `packages/shared/src/catalog.ts`, change the candidate `series` entry:

```ts
  series: z.array(
    z.object({
      name: z.string().trim().min(1),
      position: z.number().min(0).nullable(),
      /** The Source's own Series record, when it has one (D-199). */
      sourceLink: sourceLinkSchema.optional(),
    }),
  ),
```

Update the `seriesReported` comment to: `True when the Source read the records its Series come from (its Series records or its Editions), so \`series\` is its whole list and replaces the Book's. Otherwise Series are only added, never removed (D-194).`

- [ ] **Step 4: Add the adapter method and type**

In `apps/api/src/catalog/sources/types.ts`, add above `SourceAdapter`:

```ts
/** A Series as its Source lists it: every member in reading order (D-199). */
export interface SeriesMembers {
  name: string
  members: { sourceId: string; position: number | null; title: string }[]
}
```

and inside `SourceAdapter`, after `getAuthor`:

```ts
  /** Every member of a Series in reading order, or `null` when the Source has no such Series. */
  getSeriesMembers?(sourceId: string): Promise<SeriesMembers | null>
```

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter @reprint/shared build && pnpm --filter @reprint/db build && pnpm typecheck && pnpm db:check`
Expected: all pass.

```bash
git add packages/db packages/shared/src/catalog.ts apps/api/src/catalog/sources/types.ts
git commit -m "feat(catalog): Series member count, sync time, and Source links on candidates (D-199)"
```

---

### Task 2: Open Library reads Series records

**Files:**
- Create: `apps/api/src/catalog/sources/open-library/series.ts`
- Create: `apps/api/src/catalog/sources/open-library/series.test.ts`
- Modify: `apps/api/src/catalog/sources/open-library/search.ts` (`searchDocSchema`, `toBookCandidate`)
- Modify: `apps/api/src/catalog/sources/open-library/record.ts` (`toFullBook`)
- Modify: `apps/api/src/catalog/sources/open-library/adapter.ts` (`seriesReported`)
- Modify: `apps/api/src/catalog/sources/open-library/record-fixtures.ts`, add fixtures
- Test: `apps/api/src/catalog/sources/open-library/adapter.test.ts`

**Interfaces:**
- Consumes: Task 1 candidate `sourceLink`.
- Produces: `toPosition(text: string | undefined): number | null`; `seriesOfDoc(doc: { series_key?: string[]; series_name?: string[]; series_position?: string[] }): { name: string; position: number | null; sourceLink: SourceLink }[]`; `seriesMembersPath(seriesId: string, page: number): string`; `SERIES_PAGE_SIZE = 100`.

- [ ] **Step 1: Write the failing unit tests**

`apps/api/src/catalog/sources/open-library/series.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { seriesMembersPath, seriesOfDoc, toPosition } from './series.js'

describe('toPosition', () => {
  it('keeps whole and decimal numbers and drops everything else', () => {
    expect(toPosition('1')).toBe(1)
    expect(toPosition(' 2.5 ')).toBe(2.5)
    expect(toPosition('1-3')).toBeNull()
    expect(toPosition('Book 2')).toBeNull()
    expect(toPosition('')).toBeNull()
    expect(toPosition('-1')).toBeNull()
    expect(toPosition(undefined)).toBeNull()
  })
})

describe('seriesOfDoc', () => {
  it('pairs each Series key with its name and position', () => {
    expect(
      seriesOfDoc({
        series_key: ['OL326782L', 'OL1L'],
        series_name: ["The Hitchhiker's Guide to the Galaxy", 'Other'],
        series_position: ['1', 'x'],
      }),
    ).toEqual([
      {
        name: "The Hitchhiker's Guide to the Galaxy",
        position: 1,
        sourceLink: { source: 'open_library', entityType: 'series', sourceId: 'OL326782L' },
      },
      {
        name: 'Other',
        position: null,
        sourceLink: { source: 'open_library', entityType: 'series', sourceId: 'OL1L' },
      },
    ])
  })

  it('skips keys without a name or with a malformed key, and handles missing arrays', () => {
    expect(seriesOfDoc({ series_key: ['OL1L', 'bad'], series_name: ['', 'Name'] })).toEqual([])
    expect(seriesOfDoc({})).toEqual([])
  })
})

describe('seriesMembersPath', () => {
  it('searches by Series key, 100 a page', () => {
    expect(seriesMembersPath('OL326782L', 1)).toBe(
      '/search.json?q=series_key%3AOL326782L&limit=100',
    )
    expect(seriesMembersPath('OL326782L', 2)).toBe(
      '/search.json?q=series_key%3AOL326782L&limit=100&page=2',
    )
  })
})
```

- [ ] **Step 2: Run to see them fail**

Run: `cd apps/api && pnpm exec vitest run src/catalog/sources/open-library/series.test.ts`
Expected: FAIL, module `./series.js` not found.

- [ ] **Step 3: Implement `series.ts`**

```ts
import type { SourceLink } from '@reprint/shared'
import { SOURCE_NAME } from './search.js'

/** How many Series members one search page holds. */
export const SERIES_PAGE_SIZE = 100

const SERIES_ID = /^OL\d+L$/

/** A Series position as a number: whole or decimal (2.5); anything else ("1-3", "Book 2") is `null`. */
export function toPosition(text: string | undefined): number | null {
  const trimmed = text?.trim() ?? ''
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null
  return Number(trimmed)
}

/** The Series records a search result names, from its parallel `series_*` arrays (D-199). */
export function seriesOfDoc(doc: {
  series_key?: string[]
  series_name?: string[]
  series_position?: string[]
}): { name: string; position: number | null; sourceLink: SourceLink }[] {
  return (doc.series_key ?? []).flatMap((key, index) => {
    const name = doc.series_name?.[index]?.trim()
    if (!SERIES_ID.test(key) || !name) return []
    return [
      {
        name,
        position: toPosition(doc.series_position?.[index]),
        sourceLink: { source: SOURCE_NAME, entityType: 'series' as const, sourceId: key },
      },
    ]
  })
}

/** The search for a Series' members, `SERIES_PAGE_SIZE` a page; `page` starts at 1. */
export function seriesMembersPath(seriesId: string, page: number): string {
  const params = new URLSearchParams({ q: `series_key:${seriesId}`, limit: String(SERIES_PAGE_SIZE) })
  if (page > 1) params.set('page', String(page))
  return `/search.json?${params.toString()}`
}
```

If importing `SOURCE_NAME` from `search.js` creates a cycle once Step 5 imports `seriesOfDoc` into `search.ts`, move `SOURCE_NAME` into a new `apps/api/src/catalog/sources/open-library/source-name.ts` (`export const SOURCE_NAME = 'open_library'`), re-export it from `search.ts`, and import it from there in both files.

- [ ] **Step 4: Run the unit tests**

Run: `cd apps/api && pnpm exec vitest run src/catalog/sources/open-library/series.test.ts`
Expected: PASS.

- [ ] **Step 5: Fill `series` on candidates from search results**

In `search.ts`, add to `searchDocSchema`:

```ts
  series_key: z.array(z.string()).optional(),
  series_name: z.array(z.string()).optional(),
  series_position: z.array(z.string()).optional(),
```

and in `toBookCandidate`, replace `series: [],` with `series: seriesOfDoc(doc),` (import `seriesOfDoc` from `./series.js`).

- [ ] **Step 6: Prefer Series records in full Books**

In `record.ts` `toFullBook`, replace `series: toSeries(seriesTexts),` with:

```ts
      // Series records win over Series text guessed from Editions (D-193, D-199).
      series: base.book.series.length > 0 ? base.book.series : toSeries(seriesTexts),
```

and add to the returned `book`: nothing else. In `adapter.ts` `getBook`, change `seriesReported: editions.read` to:

```ts
        book: {
          ...candidate.book,
          seriesReported: editions.read || candidate.book.series.some((s) => s.sourceLink),
        },
```

- [ ] **Step 7: Record the Hitchhiker's fixtures**

In `record-fixtures.ts`, add to `FIXTURE_REQUESTS`:

```ts
  // A Book with an Open Library Series record, and that Series' members (D-199).
  { name: 'work-hitchhiker', path: '/works/OL2163649W.json' },
  { name: 'work-hitchhiker-byline', path: '/search.json?q=key%3A%2Fworks%2FOL2163649W&limit=1' },
  { name: 'work-hitchhiker-editions', path: '/works/OL2163649W/editions.json?limit=50' },
  { name: 'edition-hitchhiker-cover', path: '/books/OL17837787M.json' },
  { name: 'series-hitchhiker', path: '/search.json?q=series_key%3AOL326782L&limit=100' },
```

Record only these five with a generic User-Agent (never a personal email), pretty-printed like the recorder:

```bash
cd apps/api/src/catalog/sources/open-library/__fixtures__
for pair in "work-hitchhiker|/works/OL2163649W.json" \
  "work-hitchhiker-byline|/search.json?q=key%3A%2Fworks%2FOL2163649W&limit=1" \
  "work-hitchhiker-editions|/works/OL2163649W/editions.json?limit=50" \
  "edition-hitchhiker-cover|/books/OL17837787M.json" \
  "series-hitchhiker|/search.json?q=series_key%3AOL326782L&limit=100"; do
  name="${pair%%|*}"; path="${pair#*|}"
  curl -s -A "RePrint fixture recorder" "https://openlibrary.org$path" | python3 -m json.tool > "$name.json"
  sleep 0.5
done
cd - && pnpm format
```

- [ ] **Step 8: Write the failing contract test**

In `adapter.test.ts`, inside `describe('Open Library getBook, getEditions, and getAuthor', ...)`:

```ts
  it('reads a Series record from the search result, ahead of Edition text', async () => {
    const book = await adapter.getBook('OL2163649W')
    expect(book?.book.series).toEqual([
      {
        name: "The Hitchhiker's Guide to the Galaxy",
        position: 1,
        sourceLink: { source: 'open_library', entityType: 'series', sourceId: 'OL326782L' },
      },
    ])
    expect(book?.book.seriesReported).toBe(true)
  })
```

- [ ] **Step 9: Run the Open Library tests**

Run: `cd apps/api && pnpm exec vitest run src/catalog/sources/open-library`
Expected: PASS (all existing tests too).

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/catalog/sources/open-library
git commit -m "feat(catalog): read Open Library Series records from search results (D-199)"
```

---

### Task 3: List a Series' members (Open Library and stub)

**Files:**
- Modify: `apps/api/src/catalog/sources/open-library/adapter.ts`
- Modify: `apps/api/src/catalog/sources/stub/stub-adapter.ts`
- Test: `apps/api/src/catalog/sources/open-library/adapter.test.ts`, `apps/api/src/catalog/sources/stub/stub-adapter.test.ts`

**Interfaces:**
- Consumes: Task 1 `SeriesMembers`; Task 2 `seriesMembersPath`, `SERIES_PAGE_SIZE`, `toPosition`.
- Produces: `adapter.getSeriesMembers(sourceId)`. Stub Series `stub-series-middle-earth` with members `stub-book-hobbit` (position 1) and new Book `stub-book-fellowship` ("The Fellowship of the Ring", position 2); `stub-book-hobbit`'s candidate lists that Series.

- [ ] **Step 1: Write the failing contract tests**

In `adapter.test.ts`:

```ts
describe('Open Library getSeriesMembers', () => {
  it('lists every member in reading order with the Series name', async () => {
    const series = await adapter.getSeriesMembers?.('OL326782L')
    expect(series?.name).toBe("The Hitchhiker's Guide to the Galaxy")
    expect(series?.members.map((m) => [m.position, m.sourceId])).toEqual([
      [1, 'OL2163649W'],
      [2, 'OL2163655W'],
      [3, 'OL2163623W'],
      [4, 'OL2163719W'],
      [5, 'OL2163638W'],
      [6, 'OL5725953W'],
    ])
  })

  it('reads further pages until it has every member', async () => {
    const doc = (n: number) => ({
      key: `/works/OL${n}W`,
      title: `Book ${n}`,
      series_key: ['OL9L'],
      series_name: ['Long'],
      series_position: [String(n)],
    })
    const pages: Record<string, unknown> = {
      '1': { numFound: 101, docs: Array.from({ length: 100 }, (_, i) => doc(i + 1)) },
      '2': { numFound: 101, docs: [doc(101)] },
    }
    const long = createOpenLibraryAdapter({
      fetch: async (input) =>
        Response.json(pages[new URL(String(input)).searchParams.get('page') ?? '1']),
    })
    const series = await long.getSeriesMembers?.('OL9L')
    expect(series?.members).toHaveLength(101)
    expect(series?.members.at(-1)).toEqual({ sourceId: 'OL101W', position: 101, title: 'Book 101' })
  })

  it('answers null for a Series with no members and for a malformed ID', async () => {
    const empty = createOpenLibraryAdapter({ fetch: replay('{"numFound":0,"docs":[]}') })
    expect(await empty.getSeriesMembers?.('OL1L')).toBeNull()
    expect(await adapter.getSeriesMembers?.('../x')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to see them fail**

Run: `cd apps/api && pnpm exec vitest run src/catalog/sources/open-library/adapter.test.ts -t getSeriesMembers`
Expected: FAIL (`getSeriesMembers` is undefined).

- [ ] **Step 3: Implement it in the adapter**

In `adapter.ts`, import `seriesMembersPath, SERIES_PAGE_SIZE, toPosition` from `./series.js` and `type SeriesMembers` from `../types.js`; add `const seriesIdSchema = z.string().regex(/^OL\d+L$/)` next to the other ID schemas; add `const memberDocSchema = z.object({ key: z.string().regex(/^\/works\/OL\d+W$/), title: z.string(), series_key: z.array(z.string()).optional(), series_name: z.array(z.string()).optional(), series_position: z.array(z.string()).optional() })`. Add to the returned adapter:

```ts
    async getSeriesMembers(sourceId): Promise<SeriesMembers | null> {
      const id = seriesIdSchema.safeParse(sourceId)
      if (!id.success) return null
      const members: SeriesMembers['members'] = []
      let name: string | null = null
      for (let page = 1; ; page += 1) {
        const body = searchResponseSchema.safeParse(await getJson(seriesMembersPath(id.data, page)))
        if (!body.success) break
        for (const raw of body.data.docs) {
          const doc = memberDocSchema.safeParse(raw)
          if (!doc.success) continue
          const index = doc.data.series_key?.indexOf(id.data) ?? -1
          if (index < 0) continue
          name ??= doc.data.series_name?.[index]?.trim() || null
          members.push({
            sourceId: doc.data.key.replace('/works/', ''),
            position: toPosition(doc.data.series_position?.[index]),
            title: doc.data.title,
          })
        }
        if (body.data.docs.length < SERIES_PAGE_SIZE || page * SERIES_PAGE_SIZE >= body.data.numFound) break
      }
      if (!name || members.length === 0) return null
      // Reading order: by position, unnumbered last, then title.
      members.sort(
        (a, b) =>
          (a.position ?? Number.POSITIVE_INFINITY) - (b.position ?? Number.POSITIVE_INFINITY) ||
          a.title.localeCompare(b.title),
      )
      return { name, members }
    },
```

- [ ] **Step 4: Run the Open Library tests**

Run: `cd apps/api && pnpm exec vitest run src/catalog/sources/open-library`
Expected: PASS.

- [ ] **Step 5: Stub Series, test first**

In `stub-adapter.test.ts` add:

```ts
  it('lists its one Series, and the Hobbit names it', async () => {
    const stub = createStubSource()
    const hobbit = await stub.getBook('stub-book-hobbit')
    expect(hobbit?.book.series).toEqual([
      {
        name: 'Middle-earth',
        position: 1,
        sourceLink: { source: 'stub', entityType: 'series', sourceId: 'stub-series-middle-earth' },
      },
    ])
    expect(await stub.getSeriesMembers?.('stub-series-middle-earth')).toEqual({
      name: 'Middle-earth',
      members: [
        { sourceId: 'stub-book-hobbit', position: 1, title: 'The Hobbit' },
        { sourceId: 'stub-book-fellowship', position: 2, title: 'The Fellowship of the Ring' },
      ],
    })
    expect(await stub.getBook('stub-book-fellowship')).not.toBeNull()
    expect(await stub.getSeriesMembers?.('nope')).toBeNull()
  })
```

Run: `cd apps/api && pnpm exec vitest run src/catalog/sources/stub` → FAIL.

- [ ] **Step 6: Implement the stub Series**

In `stub-adapter.ts`:
- Add an `EDITIONS['stub-book-fellowship']` entry modelled on the Hobbit's, with ISBN-13 `9780261102354`, publisher "Allen & Unwin", date `1954-07-29`, and no cover.
- Give `bookCandidate` an optional sixth parameter, `series: BookCandidate['book']['series'] = []`, and use it in place of `series: []`.
- Pass the Series to the Hobbit:

```ts
const MIDDLE_EARTH = {
  source: SOURCE,
  entityType: 'series',
  sourceId: 'stub-series-middle-earth',
} as const
```

- Call the Hobbit's `bookCandidate(...)` with `[{ name: 'Middle-earth', position: 1, sourceLink: MIDDLE_EARTH }]`.
- Add `'stub-book-fellowship': bookCandidate('stub-book-fellowship', 'The Fellowship of the Ring', 'stub-author-tolkien', 'J. R. R. Tolkien', 1, [{ name: 'Middle-earth', position: 2, sourceLink: MIDDLE_EARTH }])`.
- Add to the adapter:

```ts
    async getSeriesMembers(sourceId) {
      if (sourceId !== MIDDLE_EARTH.sourceId) return null
      return {
        name: 'Middle-earth',
        members: [
          { sourceId: 'stub-book-hobbit', position: 1, title: 'The Hobbit' },
          { sourceId: 'stub-book-fellowship', position: 2, title: 'The Fellowship of the Ring' },
        ],
      }
    },
```

- [ ] **Step 7: Run all API unit tests**

Run: `cd apps/api && pnpm exec vitest run`
Expected: PASS. If a test counts stub search results for "tolkien", update its expected count to include the Fellowship and say so in the commit message.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/catalog/sources
git commit -m "feat(catalog): list a Series' members from Open Library and the stub Source (D-199)"
```

---

### Task 4: Ingest links Series to their Source record and reports syncs

**Files:**
- Modify: `apps/api/src/catalog/ingest/ingest.ts`
- Test: `apps/api/src/catalog/ingest/ingest.integration.test.ts`

**Interfaces:**
- Consumes: Task 1 columns and candidate `sourceLink`.
- Produces: `IngestResult.seriesToSync: string[]`, the IDs of the Book's Series that have a Source link for `source` and whose `membersSyncedAt` is `null` or older than `STALE_AFTER_MS`. Lookup order for a Series: Source link, then case-insensitive name. A Series found by name gains the link.

- [ ] **Step 1: Write the failing integration tests**

In `ingest.integration.test.ts`:

```ts
  it('links a Series record to an existing Series of the same name, and reports it for a sync', async () => {
    const candidate = await stubCandidate('stub-book-dune')
    const link = { source: 'stub', entityType: 'series', sourceId: 'stub-series-dune' } as const
    // First from Edition text (no link), then from a Series record with a link.
    await ingestBook(db, {
      source: stub,
      candidate: { ...candidate, book: { ...candidate.book, series: [{ name: 'Dune', position: 1 }] } },
    })
    const second = await ingestBook(db, {
      source: stub,
      candidate: {
        ...candidate,
        book: { ...candidate.book, series: [{ name: 'dune', position: 1, sourceLink: link }] },
      },
    })
    const rows = await db.select().from(series)
    expect(rows).toHaveLength(1)
    const [stored] = await db
      .select()
      .from(sourceLinks)
      .where(eq(sourceLinks.entityType, 'series'))
    expect(stored).toMatchObject({ entityId: rows[0]?.id, sourceId: 'stub-series-dune' })
    expect(second.seriesToSync).toEqual([rows[0]?.id])
  })

  it('reports no sync for a Series synced in the last 30 days or without a Source link', async () => {
    const candidate = await stubCandidate('stub-book-hobbit')
    const first = await ingestBook(db, { source: stub, candidate })
    const [row] = await db.select().from(series)
    await db.update(series).set({ membersSyncedAt: new Date() })
    expect((await ingestBook(db, { source: stub, candidate })).seriesToSync).toEqual([])
    expect(first.seriesToSync).toEqual([row?.id])
    const plain = await stubCandidate('stub-book-dune')
    const noLink = await ingestBook(db, {
      source: stub,
      candidate: { ...plain, book: { ...plain.book, series: [{ name: 'Guessed', position: 1 }] } },
    })
    expect(noLink.seriesToSync).toEqual([])
  })
```

Import `sourceLinks` from `@reprint/db` in the test if it is not already imported.

- [ ] **Step 2: Run to see them fail**

Run: `cd apps/api && pnpm exec vitest run --config vitest.integration.config.ts src/catalog/ingest -t "Series"`
Expected: FAIL (`seriesToSync` undefined).

- [ ] **Step 3: Implement**

In `ingest.ts`:
- Widen `linkedEntityId`'s `entityType` to `'book' | 'edition' | 'author' | 'series'`, and the same for `addLink`.
- Import `STALE_AFTER_MS` from `../refresh.js`. If that creates an import cycle (`refresh.ts` imports `ingest.ts`), move `STALE_AFTER_MS` and `isStale` to a new `apps/api/src/catalog/staleness.ts`, re-export them from `refresh.ts`, and import from there.
- In `upsertSeries`, find each Series by its link first:

```ts
  for (const membership of candidate.book.series) {
    const link = membership.sourceLink
    const linked = link ? await linkedEntityId(tx, 'series', link.source, link.sourceId) : null
    let row = linked ? { id: linked } : undefined
    if (!row) {
      ;[row] = await tx
        .select({ id: series.id })
        .from(series)
        .where(sql`lower(${series.name}) = lower(${membership.name})`)
        .limit(1)
    }
    // ... existing insert when !row ...
    if (link) await addLink(tx, 'series', row.id, link.source, link.sourceId)
    // ... existing book_series upsert and reported.push(row.id) ...
  }
```

- Make `upsertSeries` return the IDs with a link: collect `linkedIds.push(row.id)` when `link` is set, and return `linkedIds` (before the D-194 removal branch; keep that branch's early `return`s returning `linkedIds`).
- In `ingestBook`, keep `let linkedSeries: string[] = []`, set it from `upsertSeries` (inside the `isLocked('series')` check), and before the `return` compute:

```ts
    const syncBefore = new Date(now.getTime() - STALE_AFTER_MS)
    const seriesToSync =
      linkedSeries.length === 0
        ? []
        : (
            await tx
              .select({ id: series.id })
              .from(series)
              .where(
                and(
                  inArray(series.id, linkedSeries),
                  or(isNull(series.membersSyncedAt), lt(series.membersSyncedAt, syncBefore)),
                ),
              )
          ).map((row) => row.id)
```

  (import `lt` and `or` from `drizzle-orm`), and add `seriesToSync` to the returned object and to `IngestResult`:

```ts
  /** The Book's Series with a Source record whose members are due for a sync (D-199). */
  seriesToSync: string[]
```

- [ ] **Step 4: Run the ingest integration tests**

Run: `cd apps/api && pnpm exec vitest run --config vitest.integration.config.ts src/catalog`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/catalog
git commit -m "feat(catalog): link Series to their Source record and report Series due a sync (D-199)"
```

---

### Task 5: The Series sync

**Files:**
- Create: `apps/api/src/catalog/series-sync.ts`
- Create: `apps/api/src/catalog/series-sync.integration.test.ts`

**Interfaces:**
- Consumes: Task 3 `getSeriesMembers`; Task 4 `IngestResult.seriesToSync`.
- Produces:

```ts
export type SeriesSyncOutcome =
  | { outcome: 'synced'; imported: number; failed: number }
  | { outcome: 'not_linked' | 'not_found' | 'unsupported' }
export async function syncSeries(options: {
  db: Database
  source: SourceAdapter
  seriesId: string
  call?: <T>(fn: () => Promise<T>) => Promise<T>
  now?: Date
  onMemberError?: (sourceId: string, error: unknown) => void
}): Promise<SeriesSyncOutcome>
export async function queueSeriesSyncs(
  jobs: Pick<JobQueue, 'enqueue'>,
  seriesIds: readonly string[],
  now?: Date,
): Promise<void>
export const SERIES_SYNC_PRIORITY = 10
```

- [ ] **Step 1: Write the failing integration tests**

`apps/api/src/catalog/series-sync.integration.test.ts` (copy the database setup at the top of `ingest/ingest.integration.test.ts`: `startTestDatabase`, `truncateAllTables` in `beforeEach`, `const stub = createStubSource()`):

```ts
import { books, series, sourceLinks } from '@reprint/db'
import { startTestDatabase, type TestDatabase, truncateAllTables } from '@reprint/db/testing'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ingestBook } from './ingest/ingest.js'
import { queueSeriesSyncs, syncSeries } from './series-sync.js'
import { createStubSource } from './sources/stub/stub-adapter.js'

let testDb: TestDatabase
let db: TestDatabase['db']
const stub = createStubSource()

beforeAll(async () => {
  testDb = await startTestDatabase()
  db = testDb.db
})
afterAll(async () => {
  await testDb?.stop()
})
beforeEach(async () => {
  await truncateAllTables(db)
})

async function storeHobbit() {
  const candidate = await stub.getBook('stub-book-hobbit')
  if (!candidate) throw new Error('no hobbit')
  const result = await ingestBook(db, { source: stub, candidate })
  const [row] = await db.select().from(series)
  if (!row) throw new Error('no series')
  return { result, seriesId: row.id }
}

describe('syncSeries', () => {
  it('imports the members not yet stored and records the count and time', async () => {
    const { seriesId } = await storeHobbit()
    const getBook = vi.spyOn(stub, 'getBook')
    const now = new Date('2026-10-10T00:00:00.000Z')
    const outcome = await syncSeries({ db, source: stub, seriesId, now })
    expect(outcome).toEqual({ outcome: 'synced', imported: 1, failed: 0 })
    expect(getBook.mock.calls.map(([id]) => id)).toEqual(['stub-book-fellowship'])
    expect((await db.select({ title: books.title }).from(books)).map((b) => b.title).sort()).toEqual([
      'The Fellowship of the Ring',
      'The Hobbit',
    ])
    const [row] = await db.select().from(series).where(eq(series.id, seriesId))
    expect(row).toMatchObject({ sourceMemberCount: 2, membersSyncedAt: now })
    getBook.mockRestore()
  })

  it('skips a member that fails and still records the sync', async () => {
    const { seriesId } = await storeHobbit()
    const getBook = vi.spyOn(stub, 'getBook').mockRejectedValueOnce(new Error('boom'))
    const errors: string[] = []
    const outcome = await syncSeries({
      db,
      source: stub,
      seriesId,
      onMemberError: (sourceId) => errors.push(sourceId),
    })
    expect(outcome).toEqual({ outcome: 'synced', imported: 0, failed: 1 })
    expect(errors).toEqual(['stub-book-fellowship'])
    const [row] = await db.select().from(series).where(eq(series.id, seriesId))
    expect(row?.membersSyncedAt).not.toBeNull()
    getBook.mockRestore()
  })

  it('imports nothing the second time, so a repeat sync is cheap', async () => {
    const { seriesId } = await storeHobbit()
    await syncSeries({ db, source: stub, seriesId })
    const getBook = vi.spyOn(stub, 'getBook')
    expect(await syncSeries({ db, source: stub, seriesId })).toEqual({
      outcome: 'synced',
      imported: 0,
      failed: 0,
    })
    expect(getBook).not.toHaveBeenCalled()
    getBook.mockRestore()
  })

  it('does not duplicate a member already stored under its ISBN', async () => {
    const { seriesId } = await storeHobbit()
    const fellowship = await stub.getBook('stub-book-fellowship')
    if (!fellowship) throw new Error('no fellowship')
    // The same Book reached earlier through another Source ID; only the ISBN matches.
    await ingestBook(db, {
      source: stub,
      candidate: { ...fellowship, sourceLink: { ...fellowship.sourceLink, sourceId: 'stub-other-id' } },
    })
    await syncSeries({ db, source: stub, seriesId })
    const titles = (await db.select({ title: books.title }).from(books)).map((b) => b.title)
    expect(titles.filter((title) => title === 'The Fellowship of the Ring')).toHaveLength(1)
  })

  it('answers not_found, not_linked, and unsupported', async () => {
    const { seriesId } = await storeHobbit()
    await db
      .update(sourceLinks)
      .set({ sourceId: 'stub-series-gone' })
      .where(eq(sourceLinks.entityType, 'series'))
    expect(await syncSeries({ db, source: stub, seriesId })).toEqual({ outcome: 'not_found' })
    await db.delete(sourceLinks).where(eq(sourceLinks.entityType, 'series'))
    expect(await syncSeries({ db, source: stub, seriesId })).toEqual({ outcome: 'not_linked' })
    const { getSeriesMembers: _drop, ...without } = stub
    expect(await syncSeries({ db, source: without, seriesId })).toEqual({ outcome: 'unsupported' })
  })
})

describe('queueSeriesSyncs', () => {
  it('queues one background job per Series per UTC day', async () => {
    const enqueue = vi.fn(async () => 'id')
    await queueSeriesSyncs({ enqueue }, ['s1', 's2'], new Date('2026-10-10T12:00:00.000Z'))
    expect(enqueue.mock.calls).toEqual([
      ['catalog.series-sync', { seriesId: 's1' }, { jobId: 'catalog.series-sync-s1-2026-10-10', priority: 10 }],
      ['catalog.series-sync', { seriesId: 's2' }, { jobId: 'catalog.series-sync-s2-2026-10-10', priority: 10 }],
    ])
  })
})
```

Note: `queueSeriesSyncs` is typed against `JobQueue['enqueue']`, whose payload type comes from the registry, so this test compiles only after Task 6 adds the job. Write this `describe` now but keep it skipped, by running only the `syncSeries` tests in Step 2 and Step 4 (`-t syncSeries`). Task 6 runs the whole file. Do not commit a `.skip`.

- [ ] **Step 2: Run to see them fail**

Run: `cd apps/api && pnpm exec vitest run --config vitest.integration.config.ts src/catalog/series-sync.integration.test.ts -t syncSeries`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `series-sync.ts`**

```ts
import { type Database, series, sourceLinks } from '@reprint/db'
import type { AuthorRecord } from '@reprint/shared'
import { and, eq } from 'drizzle-orm'
import type { JobQueue } from '../jobs/queue.js'
import { ingestBook } from './ingest/ingest.js'
import type { SourceAdapter } from './sources/types.js'

/** Series imports wait behind interactive work and Admin refreshes (PRD §6). */
export const SERIES_SYNC_PRIORITY = 10

export type SeriesSyncOutcome =
  | { outcome: 'synced'; imported: number; failed: number }
  | { outcome: 'not_linked' | 'not_found' | 'unsupported' }

/**
 * Imports every member of a Series that is not stored yet (D-199). Members are stored through
 * `ingestBook` like any Book, but their own Series are not synced (one level only). A member that
 * fails is skipped; the next sync tries it again.
 */
export async function syncSeries(options: {
  db: Database
  source: SourceAdapter
  seriesId: string
  call?: <T>(fn: () => Promise<T>) => Promise<T>
  now?: Date
  onMemberError?: (sourceId: string, error: unknown) => void
}): Promise<SeriesSyncOutcome> {
  const { db, source, seriesId } = options
  const call = options.call ?? (<T>(fn: () => Promise<T>) => fn())
  const now = options.now ?? new Date()
  if (!source.getSeriesMembers) return { outcome: 'unsupported' }
  const [link] = await db
    .select({ sourceId: sourceLinks.sourceId })
    .from(sourceLinks)
    .where(
      and(
        eq(sourceLinks.entityType, 'series'),
        eq(sourceLinks.entityId, seriesId),
        eq(sourceLinks.source, source.name),
      ),
    )
    .limit(1)
  if (!link) return { outcome: 'not_linked' }
  const getMembers = source.getSeriesMembers.bind(source)
  const list = await call(() => getMembers(link.sourceId))
  if (!list) return { outcome: 'not_found' }

  const stored = await db
    .select({ sourceId: sourceLinks.sourceId })
    .from(sourceLinks)
    .where(and(eq(sourceLinks.entityType, 'book'), eq(sourceLinks.source, source.name)))
  const have = new Set(stored.map((row) => row.sourceId))
  let imported = 0
  let failed = 0
  for (const member of list.members) {
    if (have.has(member.sourceId)) continue
    try {
      const candidate = await call(() => source.getBook(member.sourceId))
      if (!candidate) continue
      const authorRecords = new Map<string, AuthorRecord>()
      for (const contribution of candidate.book.contributions) {
        const authorLink = contribution.sourceLink
        if (!authorLink || authorRecords.has(authorLink.sourceId)) continue
        const record = await call(() => source.getAuthor(authorLink.sourceId))
        if (record) authorRecords.set(authorLink.sourceId, record)
      }
      // `seriesToSync` is ignored on purpose: one level only (D-199).
      await ingestBook(db, { source, candidate, authorRecords, now })
      have.add(member.sourceId)
      imported += 1
    } catch (error) {
      failed += 1
      options.onMemberError?.(member.sourceId, error)
    }
  }
  await db
    .update(series)
    .set({ sourceMemberCount: list.members.length, membersSyncedAt: now })
    .where(eq(series.id, seriesId))
  return { outcome: 'synced', imported, failed }
}

/** Queues a background sync for each Series, at most one per Series per UTC day. */
export async function queueSeriesSyncs(
  jobs: Pick<JobQueue, 'enqueue'>,
  seriesIds: readonly string[],
  now: Date = new Date(),
): Promise<void> {
  const day = now.toISOString().slice(0, 10)
  for (const seriesId of seriesIds) {
    await jobs.enqueue(
      'catalog.series-sync',
      { seriesId },
      { jobId: `catalog.series-sync-${seriesId}-${day}`, priority: SERIES_SYNC_PRIORITY },
    )
  }
}
```

One level only (D-199) holds by construction: `syncSeries` has no access to the job queue and ignores each member's `seriesToSync`.

- [ ] **Step 4: Run the sync tests**

Run: `cd apps/api && pnpm exec vitest run --config vitest.integration.config.ts src/catalog/series-sync.integration.test.ts -t syncSeries`
Expected: PASS.

- [ ] **Step 5: Commit (together with Task 6, since `queueSeriesSyncs` needs the registered job to typecheck)**

Continue directly into Task 6 and commit at its end.

---

### Task 6: Run and trigger the sync

**Files:**
- Modify: `apps/api/src/jobs/registry.ts` (new job, `JobContext.enqueue`)
- Modify: `apps/api/src/jobs/worker-runtime.ts` (wire `enqueue`)
- Modify: `apps/api/src/catalog/resolve.ts`, `apps/api/src/catalog/refresh.ts`, `apps/api/src/modules/catalog/resolve.ts`
- Test: `apps/api/src/jobs/registry.test.ts`, `apps/api/src/modules/catalog/resolve.integration.test.ts`, `apps/api/src/modules/admin/books.integration.test.ts`

**Interfaces:**
- Consumes: Task 5 `syncSeries`, `queueSeriesSyncs`.
- Produces: job `'catalog.series-sync'` with payload `{ seriesId: uuid }`; `JobContext.enqueue: JobQueue['enqueue']`; `ResolveResult` success variant `{ slug: string; seriesToSync: string[] }`; `refreshBook` returns `{ outcome: RefreshOutcome; seriesToSync: string[] }`.

- [ ] **Step 1: Register the job**

In `registry.ts`, add to `JobContext`:

```ts
  /** Adds a job, for jobs that start others (a refresh queues Series syncs, D-199). */
  enqueue: JobQueue['enqueue']
```

(import `type JobQueue` from `./queue.js`; it is a type-only import, so no runtime cycle), and add the job after `'catalog.refresh'`:

```ts
  'catalog.series-sync': defineJob({
    payload: z.object({ seriesId: z.uuid() }),
    handler: async ({ seriesId }, { db, log, catalog }) => {
      const result = await syncSeries({
        db,
        source: catalog.source,
        seriesId,
        call: catalog.background,
        onMemberError: (sourceId, error) =>
          log.warn({ err: error, seriesId, sourceId }, 'could not import a Series member'),
      })
      log.info({ seriesId, ...result }, 'series synced')
      return result
    },
    retry: { attempts: 3, backoffMs: 60_000 },
  }),
```

In `worker-runtime.ts`, add `enqueue: jobQueue.enqueue,` to the context object passed to `processJob`.

- [ ] **Step 2: Queue syncs from a refresh**

In `refresh.ts`, change `refreshBook`'s return type to `Promise<{ outcome: RefreshOutcome; seriesToSync: string[] }>`: return `{ outcome: 'missing_book', seriesToSync: [] }` (and the same for `not_linked` and `not_found`), and at the end:

```ts
  const ingested = await ingestBook(db, { source, candidate, authorRecords, now })
  return { outcome: 'refreshed', seriesToSync: ingested.seriesToSync }
```

In the `'catalog.refresh'` job handler, destructure `enqueue` from the context and:

```ts
      const { outcome, seriesToSync } = await refreshBook({ ... })
      await queueSeriesSyncs({ enqueue }, seriesToSync)
      log.info({ bookId, outcome }, 'book refreshed')
      return { outcome }
```

Update every other caller of `refreshBook` (search with `grep -rn "refreshBook(" apps/api/src`) to read `.outcome`.

- [ ] **Step 3: Queue syncs from resolve**

In `catalog/resolve.ts`, change `ResolveResult` to `{ slug: string; seriesToSync: string[] } | { notFound: true }`; the "already stored" early return gives `seriesToSync: []`, and the end returns `{ slug: ingested.slug, seriesToSync: ingested.seriesToSync }`.

In `modules/catalog/resolve.ts`, take `jobs` from `options` and after a successful resolve:

```ts
        if ('notFound' in result) throw new HttpProblem(404, NOT_FOUND)
        if (jobs && result.seriesToSync.length > 0) {
          // A failed enqueue must not fail the page the reader asked for.
          await queueSeriesSyncs(jobs, result.seriesToSync).catch((error) =>
            request.log.warn({ err: error }, 'could not queue Series syncs'),
          )
        }
        return { slug: result.slug }
```

- [ ] **Step 4: Write the failing trigger tests**

In `jobs/registry.test.ts`, add `'catalog.series-sync'` wherever the test lists job names, and a payload case:

```ts
  it('validates the Series sync payload', () => {
    expect(jobs['catalog.series-sync'].payload.safeParse({ seriesId: 'x' }).success).toBe(false)
    expect(
      jobs['catalog.series-sync'].payload.safeParse({ seriesId: '0192a3b4-0000-7000-8000-000000000001' })
        .success,
    ).toBe(true)
  })
```

In `modules/catalog/resolve.integration.test.ts`, change the app's `jobs: { enqueue: async () => '1' }` to `jobs: { enqueue }` with a module-level `const enqueue = vi.fn(async () => '1')` (call `enqueue.mockClear()` in the existing `beforeEach`), then add, using the file's own `issueRef` and `resolve` helpers:

```ts
  it('queues a Series sync when the resolved Book has a Series record', async () => {
    const ref = await issueRef('stub-book-hobbit')
    const response = await resolve(ref)
    expect(response.statusCode).toBe(200)
    expect(enqueue).toHaveBeenCalledWith(
      'catalog.series-sync',
      { seriesId: expect.any(String) },
      expect.objectContaining({ priority: 10 }),
    )
  })
```

In `modules/admin/books.integration.test.ts`, the test `runs the job with Source calls at interactive priority and keeps locked fields` builds a job context with `as never`; add `enqueue` to it and assert `outcome` as before. Add:

```ts
  it('queues a Series sync after refreshing a Book with a Series record', async () => {
    const hobbit = await stub.getBook('stub-book-hobbit')
    if (!hobbit) throw new Error('no hobbit')
    const { bookId } = await ingestBook(stack.db.db, { source: stub, candidate: hobbit })
    await stack.db.db.update(series).set({ membersSyncedAt: null })
    const enqueueJob = vi.fn(async () => 'id')
    await jobs['catalog.refresh'].handler({ bookId }, {
      db: stack.db.db,
      log: { info: () => {} } as never,
      catalog: { source: stub, interactive: (fn: () => Promise<unknown>) => fn(), background: (fn: () => Promise<unknown>) => fn() },
      enqueue: enqueueJob,
    } as never)
    expect(enqueueJob).toHaveBeenCalledWith('catalog.series-sync', expect.anything(), expect.anything())
  })
```

- [ ] **Step 5: Run everything in the API**

Run: `cd apps/api && pnpm exec vitest run && pnpm exec vitest run --config vitest.integration.config.ts`
Expected: PASS, including the whole `series-sync.integration.test.ts` (with `queueSeriesSyncs`).

- [ ] **Step 6: Commit Tasks 5 and 6**

```bash
git add apps/api/src
git commit -m "feat(catalog): catalog.series-sync imports a Series' members, queued by resolve and refresh (D-199)"
```

---

### Task 7: Member count in the Series API

**Files:**
- Modify: `packages/shared/src/series-api.ts`
- Modify: `apps/api/src/modules/catalog/routes.ts` (`GET /series/:slug`)
- Test: `apps/api/src/modules/catalog/series.integration.test.ts`
- Regenerate: `apps/api/openapi.json`

**Interfaces:**
- Produces: `SeriesDetailResponse.series.memberCount: number | null`.

- [ ] **Step 1: Write the failing test**

In `series.integration.test.ts`, in the existing happy-path test (or a new one following it), after storing the Series set `sourceMemberCount` and assert:

```ts
    await stack.db.db.update(series).set({ sourceMemberCount: 6 })
    const body = seriesDetailResponseSchema.parse((await get(slug)).json())
    expect(body.series.memberCount).toBe(6)
```

and that a Series without it gives `memberCount: null`.

- [ ] **Step 2: Run to see it fail**

Run: `cd apps/api && pnpm exec vitest run --config vitest.integration.config.ts src/modules/catalog/series.integration.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `series-api.ts`, add to the `series` object:

```ts
    /** How many members the Source lists (D-199); `null` when unknown. Stored Books may be fewer. */
    memberCount: z.number().int().min(0).nullable(),
```

In `routes.ts` `/series/:slug`, return `series: { slug: found.slug, name: found.name, description: found.description, memberCount: found.sourceMemberCount }`.

- [ ] **Step 4: Run, rebuild the spec, and commit**

Run: `pnpm --filter @reprint/shared build && cd apps/api && pnpm exec vitest run --config vitest.integration.config.ts src/modules/catalog && cd ../.. && pnpm build`
Expected: PASS; `apps/api/openapi.json` gains `memberCount`.

```bash
git add packages/shared/src/series-api.ts apps/api/src/modules/catalog apps/api/openapi.json
git commit -m "feat(catalog): Series detail sends the Source's member count (D-199)"
```

---

### Task 8: Book page and Series page

**Files:**
- Modify: `apps/web/app/routes/book.tsx` (`loadSeries`)
- Modify: `apps/web/app/components/books/book-page.tsx` (`SeriesSummary`, header pill, Series card props)
- Modify: `apps/web/app/components/books/series-card.tsx`
- Modify: `apps/web/app/components/books/series-page.tsx`
- Modify: `apps/web/app/copy/index.ts`
- Test: `apps/web/app/components/books/book-page.test.tsx`, `series-card.test.tsx` (create if missing), `series-page.test.tsx` (create if missing), `apps/web/app/routes/book.test.ts`

**Interfaces:**
- Consumes: Task 7 `memberCount`.
- Produces: `SeriesSummary = { name; slug; total: number | null; books: SeriesCardBook[] }` (no `complete`); `SeriesCard` prop `total?: number | null` plus a "See all" link when there are more than 8 Books.

- [ ] **Step 1: Write the failing component tests**

`apps/web/app/components/books/series-card.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import axe from 'axe-core'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { SeriesCard, type SeriesCardBook } from './series-card.js'

afterEach(cleanup)

const book = (n: number): SeriesCardBook => ({
  slug: `book-${n}`,
  title: `Book number ${n}`,
  cover: null,
  position: String(n),
})

function renderCard(count: number, current: number, total: number | null = count) {
  const books = Array.from({ length: count }, (_, i) => book(i + 1))
  const Stub = createRoutesStub([
    {
      path: '/',
      Component: () => (
        <SeriesCard name="Saga" href="/series/saga" books={books} currentSlug={`book-${current}`} total={total} />
      ),
    },
  ])
  return render(<Stub />)
}

describe('SeriesCard', () => {
  it('highlights the current Book without a label', () => {
    renderCard(3, 2)
    const current = screen.getByText('Book number 2').closest('[aria-current="page"]')
    expect(current).not.toBeNull()
    expect(screen.queryByText(/You're here/)).toBeNull()
    expect(screen.getByText('Book 2 of 3')).toBeTruthy()
  })

  it('shows 8 Books around the current one and links to the whole Series', () => {
    renderCard(41, 20)
    const items = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(items).toHaveLength(8)
    expect(items[0]?.textContent).toContain('Book number 17')
    expect(screen.getByRole('link', { name: 'See all 41' }).getAttribute('href')).toBe('/series/saga')
  })

  it('says only "Book N" when the Series size is unknown', () => {
    renderCard(2, 1, null)
    expect(screen.getByText('Book 1')).toBeTruthy()
  })

  it('has no serious axe issues', async () => {
    const { container } = renderCard(10, 5)
    const results = await axe.run(container)
    expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([])
  })
})
```

In `book-page.test.tsx`, change the Series fixtures from `{ ..., complete: true }` to the new `SeriesSummary` shape (remove `complete`, set `total`), and add:

```ts
  it('says "Book N of M" only when the Series size is known', () => {
    renderPage({}, [edition], null, { series: { name: 'Dune Saga', slug: 'dune-saga', total: 6, books: [] } })
    expect(screen.getByRole('link', { name: 'Dune Saga · Book 1 of 6' })).toBeTruthy()
    cleanup()
    renderPage({}, [edition], null, { series: { name: 'Dune Saga', slug: 'dune-saga', total: null, books: [] } })
    expect(screen.getByRole('link', { name: 'Dune Saga · Book 1' })).toBeTruthy()
  })
```

`apps/web/app/components/books/series-page.test.tsx` (if it exists, add the case there):

```tsx
  it('says the Series is still being filled in while stored Books are fewer than the member count', () => {
    renderSeriesPage({ memberCount: 6, items: 2 })
    expect(screen.getByText('Still adding books from this series.')).toBeTruthy()
    cleanup()
    renderSeriesPage({ memberCount: 2, items: 2 })
    expect(screen.queryByText('Still adding books from this series.')).toBeNull()
  })
```

Write `renderSeriesPage` to build a `SeriesDetailResponse` with `series.memberCount` and that many `items` (copy the `book` fixture shape from `book-page.test.tsx`'s `BookSummary` usage) and render `<SeriesPage detail={...} />` in a `createRoutesStub` with a `QueryClientProvider` (as `book-page.test.tsx` does).

- [ ] **Step 2: Run to see them fail**

Run: `cd apps/web && pnpm exec vitest run app/components/books`
Expected: FAIL.

- [ ] **Step 3: Copy**

In `copy/index.ts`, `redesign.series`: remove `youAreHere`; add `seeAll: (count: number) => \`See all ${count}\``. In `series` (the Series page block): add `stillAdding: 'Still adding books from this series.'`.

- [ ] **Step 4: Series card**

In `series-card.tsx`:
- Remove the `here ? \` · ${text.youAreHere}\` : null` line.
- Change the current row's class to a gentle highlight: `cn(row, 'bg-accent/5 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-accent)_35%,transparent)]')`, keeping `aria-current="page"`.
- Show a window of 8:

```tsx
const WINDOW = 8
// ...
  const index = books.findIndex((book) => book.slug === currentSlug)
  const start = Math.max(0, Math.min(index - Math.floor(WINDOW / 2) + 1, books.length - WINDOW))
  const shown = books.length > WINDOW ? books.slice(start, start + WINDOW) : books
```

  Render `shown` instead of `books`.
- After the list, when `books.length > WINDOW` or `(total ?? 0) > books.length`, render `<Link to={href} className="text-sm font-semibold text-link hover:underline">{text.seeAll(total ?? books.length)}</Link>`.

With 41 Books and the current at index 19 (Book 20), `start = min(19 - 4 + 1, 33) = 16`, so the list shows Books 17 to 24, which matches the test.

- [ ] **Step 5: Book page and loader**

In `book-page.tsx`, change `SeriesSummary` to:

```ts
export type SeriesSummary = {
  name: string
  slug: string
  /** How many Books the Source lists in the Series (D-199); `null` when unknown. */
  total: number | null
  books: SeriesCardBook[]
}
```

Replace `series?.complete ? series.total : null` with `series?.total ?? null` in the header pill, and `total={series.complete ? series.total : null}` with `total={series.total}` on the card. The section-nav count stays the number of stored Books: `count: series.books.length`.

In `routes/book.tsx` `loadSeries`, return `total: detail.series.memberCount` and drop `complete`.

- [ ] **Step 6: Series page note**

In `series-page.tsx`, under the `PageHero`, when `series.memberCount !== null && items.length < series.memberCount`, render `<p role="status" className="text-sm text-muted-foreground">{text.stillAdding}</p>`.

- [ ] **Step 7: Run the web tests and fix fixtures**

Run: `cd apps/web && pnpm exec vitest run`
Expected: PASS. Update any other fixture that builds a `SeriesDetailResponse` (search `memberCount` errors from `pnpm typecheck`) by adding `memberCount: null`.

- [ ] **Step 8: Commit**

```bash
git add apps/web
git commit -m "feat(web): Series size from the Source, a highlighted current Book, and See all (D-199)"
```

---

### Task 9: End to end, docs, and the full check

**Files:**
- Create: `e2e/specs/series.spec.ts`
- Modify: `docs/DECISIONS.md`, `docs/TASKS.md`, `docs/PROGRESS.md`, `docs/DESIGN.md`

- [ ] **Step 1: Write the e2e spec**

`e2e/specs/series.spec.ts` (the in-process worker runs the sync; the pill reads "of 2" once it has):

```ts
import { expect, test } from '@playwright/test'
import { expectNoA11yViolations } from '../support/a11y.js'

test('opening a Book in a Series brings in the rest of the Series', async ({ page }) => {
  await page.goto('/search?q=hobbit')
  await page.getByRole('main').getByRole('link', { name: /The Hobbit/ }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'The Hobbit' })).toBeVisible()
  const pill = page.getByRole('link', { name: 'Middle-earth · Book 1 of 2' })
  await expect(async () => {
    await page.reload()
    await expect(pill).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 20_000 })
  await pill.click()
  await expect(page.getByRole('heading', { level: 1, name: 'Middle-earth' })).toBeVisible()
  await expect(page.getByText('The Fellowship of the Ring')).toBeVisible()
  await expectNoA11yViolations(page)
})
```

- [ ] **Step 2: Run e2e**

Run: `pnpm build && node e2e/run.mjs specs/series.spec.ts`
Expected: PASS in all three projects. Then run the full suite: `pnpm test:e2e` (wait a minute after the previous run; the 300/min anonymous-read limit applies). Expected: all pass.

- [ ] **Step 3: Docs**

Append to `docs/DECISIONS.md`:

```markdown
### D-199 · Import the whole Series of a Book a Member reached
- Status: Decided (owner). Proposes a change to PRD §6, which says RePrint stores only the Books its Members use.
- Decision: Open Library's Series records (`series_key`, name, position on search results) are read for each Book and linked through `source_links`. When `resolve` or `refresh` stores a Book with such a Series, and the Series was not synced in 30 days, a background `catalog.series-sync` job lists the Series' members (one search, 100 a page) and imports every one not stored yet through `ingestBook`, at background priority. There is no cap. Books imported this way do not start syncs of their own other Series (one level). `series.source_member_count` drives "Book N of M"; `series.members_synced_at` spaces syncs. Series without a Source record keep the Edition-text guess (D-193) and show "Book N". The current Book is highlighted in Series lists without a "You're here" label.
- Proposed PRD §6 wording: "RePrint stores the Books its Members use, plus the other Books in their Series when the Source lists them."
- Why: The owner wants a Book page to show how long its Series is and every Book in it; Open Library began publishing Series records in 2026.
- Affects: `packages/db` (migration 0020), `packages/shared`, `apps/api/src/catalog/` (adapter, stub, ingest, `series-sync.ts`, resolve, refresh), `apps/api/src/jobs/`, `apps/web` Series card, Book page, Series page.
```

Add M9-T18 to `docs/TASKS.md` after M9-T17, with `Accept:` bullets taken from the spec's sections 3 and 4. Add a PROGRESS entry. In `docs/DESIGN.md`, in the Book page section, describe the Series card: an ordered list, a gently highlighted current Book, 8 shown around it, and "See all N".

- [ ] **Step 4: Full check and commit**

Run: `pnpm check`
Expected: PASS.

```bash
git add e2e/specs/series.spec.ts docs
git commit -m "docs: D-199 Series import; e2e for a Series filling in"
```

- [ ] **Step 5: Open the PR**

Push `feat/series-import`, open a PR to `main` titled `feat(catalog): M9-T18 import whole Series from the Source (D-199)`, and turn on Auto-fix for it.
