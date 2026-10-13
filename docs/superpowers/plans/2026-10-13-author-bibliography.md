# Author Bibliography Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Viewing an Author's page imports every work they wrote (with at least one Edition) from the Source as import-only Books, so the page lists their whole bibliography.

**Architecture:** Mirrors the Series import (D-199). The Author route queues a deduplicated `catalog.author-sync` job when the Author is due. The job reads the Source's work list through a new optional adapter method and queues one `catalog.author-work` job per missing work. Each work is stored through the existing ingest as import-only, the same mark Series imports use, so nothing cascades. The Author page orders ties by the Source's Edition count, pages the Written list 24 at a time, and shows an "adding" note.

**Tech Stack:** Fastify 5 + Zod (fastify-type-provider-zod), Drizzle + Postgres 18 (drizzle-kit migrations), BullMQ jobs, React Router 8 SSR, Vitest + Testing Library + axe, Testcontainers integration tests, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-10-13-author-bibliography-design.md`

## Global Constraints

- Source vocabulary and IDs (`OL…A`, `/works/`, `author_key`) appear only inside `apps/api/src/catalog/sources/open-library/` (`pnpm vocabulary:check`).
- Migrations are expand-only: add nullable columns; never rename or drop. `books.series_import_only` keeps its column name.
- The page never waits on the import: queueing failures are logged and swallowed (PRD §6).
- Background imports run at `SERIES_SYNC_PRIORITY` (10) through `catalog.background`.
- No cap on works. Skip works with no Editions. Written by them = listed first.
- Due = has a Source link, not synced in 30 days (`STALE_AFTER_MS`), and credited (any Role) on at least one Book with `import_only = false`.
- Written list page size 24; API `page` is 1 to 50.
- New response fields are optional in the shared schema, so a web deploy before the API deploy (or after) still parses.
- User-facing strings live in `apps/web/app/copy/index.ts`.
- Every command runs through the Node 24 wrapper used in this repo (`n24` in the session scratchpad) or a shell on Node 24.

## Review Focus

1. **An Author whose only Books are import-only** (a co-author or a crawler view of one) must queue nothing: Task 4 `authorDueForSync` test and Task 5 route test.
2. **`?page` out of range or not a number** (0, 51, `abc`): the API answers 400; the web never sends one (it falls back to page 1). Task 5 route test and Task 6 loader test.
3. **A work already stored**, possibly by a Series import or a search, must not be fetched or duplicated: Task 4 "stored" test.
4. **An Author with no link to the active Source, or a Source without the method**, must be recorded as synced, so every view does not queue it again: Task 4 test.
5. **Exactly 24 written Books** shows no "Show more"; 25 shows "1 more": Task 6 component test.

---

### Task 1: Generalize the import-only mark and extract the Book import helper

A refactor with no behavior change; the existing suites are the gate.

**Files:**
- Modify: `packages/db/src/schema/catalog.ts:51-59` (property `seriesImportOnly` → `importOnly`, column unchanged)
- Modify (rename `seriesImportOnly` → `importOnly`): `apps/api/src/catalog/series-sync.ts`, `apps/api/src/catalog/resolve.ts`, `apps/api/src/catalog/ingest/ingest.ts`, `apps/api/src/catalog/series-sync.integration.test.ts`, `apps/api/src/catalog/ingest/ingest.integration.test.ts`, `apps/api/src/modules/catalog/resolve.integration.test.ts`, `apps/api/src/modules/catalog/catalog.integration.test.ts`, `e2e/support/accounts.ts`
- Modify: `apps/api/src/catalog/ingest/ingest.ts:57-61,701` (option `seriesImport` → `importOnly`)
- Create: `apps/api/src/catalog/import-book.ts`
- Modify: `apps/api/src/catalog/series-sync.ts` (use the helper)

**Interfaces:**
- Produces: `books.importOnly` (Drizzle property on column `series_import_only`); `IngestInput.importOnly?: boolean`; from `apps/api/src/catalog/import-book.ts`: `type Call = <T>(fn: () => Promise<T>) => Promise<T>`, `const direct: Call`, `storedBooks(db: Database, source: string, sourceIds: string[]): Promise<Map<string, string>>` (Source ID → Book ID), `importBookFromSource(options: { db: Database; source: SourceAdapter; sourceId: string; call?: Call; now?: Date }): Promise<string | null>` (the new Book's ID, or `null` when the Source no longer has it).

- [ ] **Step 1: Rename the Drizzle property and its uses**

In `packages/db/src/schema/catalog.ts` replace the `seriesImportOnly` property and its comment with:

```ts
    /**
     * True while the Book is in the Catalog only because a sync imported it: a Series sync (D-199)
     * or an Author's bibliography (D-203). It starts no syncs of its own, and does not make its
     * Authors due, until a Member reaches it (opens it from search), which clears this. The
     * column keeps its first name so the previous code version still runs during a deploy.
     */
    importOnly: boolean('series_import_only').notNull().default(false),
```

Then:

```bash
sed -i '' 's/seriesImportOnly/importOnly/g' apps/api/src/catalog/series-sync.ts apps/api/src/catalog/resolve.ts apps/api/src/catalog/ingest/ingest.ts apps/api/src/catalog/series-sync.integration.test.ts apps/api/src/catalog/ingest/ingest.integration.test.ts apps/api/src/modules/catalog/resolve.integration.test.ts apps/api/src/modules/catalog/catalog.integration.test.ts e2e/support/accounts.ts
sed -i '' 's/seriesImport/importOnly/g' apps/api/src/catalog/ingest/ingest.ts apps/api/src/catalog/series-sync.ts
grep -rn "seriesImport" apps/api/src e2e packages/db/src
```

(The second `sed` runs after the first, so only the ingest option `seriesImport` is left for it to rename; macOS `sed` has no `\b`.) Expected: the final grep prints nothing. Update the `importOnly` option's doc comment in `ingest.ts` to: "True when a sync is storing a Book (a Series member, D-199, or an Author's work, D-203): a Book created this way is marked import-only and starts no syncs of its own (one level only)."

- [ ] **Step 2: Create `apps/api/src/catalog/import-book.ts`**

```ts
import { type Database, sourceLinks } from '@reprint/db'
import type { AuthorRecord } from '@reprint/shared'
import { and, eq, inArray } from 'drizzle-orm'
import { ingestBook } from './ingest/ingest.js'
import type { SourceAdapter } from './sources/types.js'

/** Runs a Source call; jobs pass `catalog.background` so it waits behind interactive requests. */
export type Call = <T>(fn: () => Promise<T>) => Promise<T>
export const direct: Call = (fn) => fn()

/** How many Source IDs one lookup of stored Books checks at a time. */
const LOOKUP_CHUNK = 500

/** The stored Books for these Source IDs, by Source ID. */
export async function storedBooks(
  db: Database,
  source: string,
  sourceIds: string[],
): Promise<Map<string, string>> {
  const found = new Map<string, string>()
  for (let start = 0; start < sourceIds.length; start += LOOKUP_CHUNK) {
    const rows = await db
      .select({ sourceId: sourceLinks.sourceId, bookId: sourceLinks.entityId })
      .from(sourceLinks)
      .where(
        and(
          eq(sourceLinks.entityType, 'book'),
          eq(sourceLinks.source, source),
          inArray(sourceLinks.sourceId, sourceIds.slice(start, start + LOOKUP_CHUNK)),
        ),
      )
    for (const row of rows) found.set(row.sourceId, row.bookId)
  }
  return found
}

/**
 * Fetches a Book and its Authors from the Source and stores it as an import (D-199, D-203): it is
 * marked import-only, so it starts no syncs of its own until a Member reaches it. Returns the Book's
 * ID, or `null` when the Source no longer has it; a Source failure throws so the job retries.
 */
export async function importBookFromSource(options: {
  db: Database
  source: SourceAdapter
  sourceId: string
  call?: Call
  now?: Date
}): Promise<string | null> {
  const { db, source, sourceId } = options
  const call = options.call ?? direct
  const candidate = await call(() => source.getBook(sourceId))
  if (!candidate) return null
  const authorRecords = new Map<string, AuthorRecord>()
  for (const contribution of candidate.book.contributions) {
    const authorLink = contribution.sourceLink
    if (!authorLink || authorRecords.has(authorLink.sourceId)) continue
    const record = await call(() => source.getAuthor(authorLink.sourceId))
    if (record) authorRecords.set(authorLink.sourceId, record)
  }
  const ingested = await ingestBook(db, {
    source,
    candidate,
    authorRecords,
    importOnly: true,
    ...(options.now ? { now: options.now } : {}),
  })
  return ingested.bookId
}
```

- [ ] **Step 3: Use the helper in `series-sync.ts`**

Delete `LOOKUP_CHUNK`, `type Call`, `const direct`, and `storedBooks` from `series-sync.ts`; import `{ type Call, direct, importBookFromSource, storedBooks }` from `./import-book.js`. Replace the body of `importSeriesMember` after the `stored` check with:

```ts
  const bookId = await importBookFromSource({
    db,
    source,
    sourceId,
    call,
    ...(options.now ? { now: options.now } : {}),
  })
  if (!bookId) return 'not_found'
  await addMembership(db, bookId, seriesId, position)
  return 'imported'
```

Remove the now-unused `AuthorRecord` and `ingestBook` imports from `series-sync.ts`.

- [ ] **Step 4: Verify nothing changed**

Run: `pnpm --filter @reprint/db build && pnpm typecheck && pnpm --filter api exec vitest run --config vitest.integration.config.ts src/catalog src/modules/catalog`
Expected: typecheck clean; every catalog integration test passes (same count as on `main`).

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/catalog.ts apps/api/src e2e/support/accounts.ts
git commit -m "refactor(catalog): one import-only mark and Book import helper for syncs (D-203)"
```

---

### Task 2: Migration for the Author sync columns

**Files:**
- Modify: `packages/db/src/schema/catalog.ts` (`authors` table, after `fieldOrigins`)
- Create: `packages/db/drizzle/0022_<generated>.sql` and `packages/db/drizzle/meta/0022_snapshot.json` (generated)

**Interfaces:**
- Produces: `authors.worksSyncedAt: Date | null` (column `works_synced_at timestamptz`), `authors.sourceWorkCount: number | null` (column `source_work_count integer`).

- [ ] **Step 1: Add the columns to the schema**

In the `authors` table, after `fieldOrigins`:

```ts
    /** When the Author's works were last read from the Source (D-203); spaces syncs 30 days apart. */
    worksSyncedAt: timestamptz('works_synced_at'),
    /** How many works the last read found: written by them (listed first), with an Edition (D-203). */
    sourceWorkCount: integer('source_work_count'),
```

- [ ] **Step 2: Generate and check the migration**

Run: `pnpm db:generate && cat packages/db/drizzle/0022_*.sql && pnpm db:check`
Expected: the new SQL file holds exactly two statements, `ALTER TABLE "authors" ADD COLUMN "works_synced_at" timestamp with time zone;` and `ALTER TABLE "authors" ADD COLUMN "source_work_count" integer;`, and `db:check` reports no drift.

- [ ] **Step 3: Verify migrations apply**

Run: `pnpm --filter @reprint/db exec vitest run --config vitest.integration.config.ts`
Expected: PASS (the migration test applies every migration twice).

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/catalog.ts packages/db/drizzle
git commit -m "feat(db): authors.works_synced_at and source_work_count (D-203)"
```

---

### Task 3: `getAuthorWorks` in the adapter interface, Open Library, and the stub

**Files:**
- Modify: `apps/api/src/catalog/sources/types.ts` (new `AuthorWork`, optional method)
- Create: `apps/api/src/catalog/sources/open-library/author-works.ts`
- Modify: `apps/api/src/catalog/sources/open-library/adapter.ts` (method + doc schema)
- Modify: `apps/api/src/catalog/sources/open-library/record-fixtures.ts` (three requests)
- Create: `apps/api/src/catalog/sources/open-library/__fixtures__/author-works-le-guin-{1,2,3}.json` (recorded)
- Test: `apps/api/src/catalog/sources/open-library/adapter.test.ts`
- Modify: `apps/api/src/catalog/sources/stub/stub-adapter.ts` (The Silmarillion, method)
- Test: `apps/api/src/catalog/sources/stub/stub-adapter.test.ts`

**Interfaces:**
- Produces: `interface AuthorWork { sourceId: string; title: string; editionCount: number }`; `SourceAdapter.getAuthorWorks?(sourceId: string): Promise<AuthorWork[]>`; stub Book `stub-book-silmarillion` ("The Silmarillion", by `stub-author-tolkien`, no Series).

- [ ] **Step 1: Add the type and method to `types.ts`**

After `SeriesMembers`:

```ts
/** One work an Author wrote, from the Source's list of their works (D-203). */
export interface AuthorWork {
  sourceId: string
  title: string
  editionCount: number
}
```

In `SourceAdapter`, after `getSeriesMembers?`:

```ts
  /**
   * The works an Author wrote (listed first) that have at least one Edition, most Editions first,
   * or `[]` when the Source lists none (D-203). Throws when a page cannot be read.
   */
  getAuthorWorks?(sourceId: string): Promise<AuthorWork[]>
```

- [ ] **Step 2: Create `open-library/author-works.ts`**

```ts
/** How many works one search page of an Author's works holds. */
export const AUTHOR_WORKS_PAGE_SIZE = 100

/** The search for an Author's works, most Editions first; `page` starts at 1 (D-203). */
export function authorWorksPath(authorId: string, page: number): string {
  const params = new URLSearchParams({
    q: `author_key:${authorId}`,
    fields: 'key,title,author_key,edition_count',
    sort: 'editions',
    limit: String(AUTHOR_WORKS_PAGE_SIZE),
  })
  if (page > 1) params.set('page', String(page))
  return `/search.json?${params.toString()}`
}
```

- [ ] **Step 3: Add the fixture requests and record them**

Append to `FIXTURE_REQUESTS` in `record-fixtures.ts`:

```ts
  {
    name: 'author-works-le-guin-1',
    path: '/search.json?q=author_key%3AOL31353A&fields=key%2Ctitle%2Cauthor_key%2Cedition_count&sort=editions&limit=100',
  },
  {
    name: 'author-works-le-guin-2',
    path: '/search.json?q=author_key%3AOL31353A&fields=key%2Ctitle%2Cauthor_key%2Cedition_count&sort=editions&limit=100&page=2',
  },
  {
    name: 'author-works-le-guin-3',
    path: '/search.json?q=author_key%3AOL31353A&fields=key%2Ctitle%2Cauthor_key%2Cedition_count&sort=editions&limit=100&page=3',
  },
```

Record only these three (live, read-only, three requests):

```bash
pnpm --filter api exec tsx -e "import('./src/catalog/sources/open-library/record-fixtures.ts').then(async (m) => console.log(await m.recordFixtures({ userAgent: 'RePrint/0.0.0 (ops@reprint.com)', requests: m.FIXTURE_REQUESTS.filter((r) => r.name.startsWith('author-works-')) })))"
pnpm exec biome check --write apps/api/src/catalog/sources/open-library/__fixtures__
```

Expected: three files written. (Checked live on 2026-10-13: pages of 100, 100, and 60 docs; 201 works pass the filters; the first is The Left Hand of Darkness, `OL59800W`, 91 Editions. If the recording differs, pin the recorded values in Step 4 and note it in the commit.)

- [ ] **Step 4: Write the failing adapter tests**

Append to `adapter.test.ts`:

```ts
describe('Open Library getAuthorWorks', () => {
  it('lists the works an Author wrote, most Editions first, across every page', async () => {
    const works = (await adapter.getAuthorWorks?.('OL31353A')) ?? []
    expect(works[0]).toEqual({
      sourceId: 'OL59800W',
      title: 'The Left Hand of Darkness',
      editionCount: 91,
    })
    expect(works).toHaveLength(201)
    expect(works.every((work) => work.editionCount >= 1)).toBe(true)
    const counts = works.map((work) => work.editionCount)
    expect(counts).toEqual([...counts].sort((a, b) => b - a))
  })

  it('keeps only works that list the Author first and have an Edition', async () => {
    const one = createOpenLibraryAdapter({
      fetch: async () =>
        Response.json({
          numFound: 3,
          docs: [
            { key: '/works/OL1W', title: 'Hers', author_key: ['OL9A'], edition_count: 2 },
            { key: '/works/OL2W', title: 'Anthology', author_key: ['OL8A', 'OL9A'], edition_count: 5 },
            { key: '/works/OL3W', title: 'No Editions', author_key: ['OL9A'], edition_count: 0 },
            { key: '/works/OL4W', title: 'Count unknown', author_key: ['OL9A'] },
          ],
        }),
    })
    expect(await one.getAuthorWorks?.('OL9A')).toEqual([
      { sourceId: 'OL1W', title: 'Hers', editionCount: 2 },
    ])
  })

  it('throws rather than return a short list when a later page cannot be read', async () => {
    const doc = (n: number) => ({
      key: `/works/OL${n}W`,
      title: `Book ${n}`,
      author_key: ['OL9A'],
      edition_count: 1,
    })
    const firstPage = { numFound: 101, docs: Array.from({ length: 100 }, (_, i) => doc(i + 1)) }
    const broken = createOpenLibraryAdapter({
      fetch: async (input) =>
        new URL(String(input)).searchParams.get('page') === '2'
          ? new Response('gone', { status: 404 })
          : Response.json(firstPage),
    })
    await expect(broken.getAuthorWorks?.('OL9A')).rejects.toBeInstanceOf(SourceError)
  })

  it('answers [] for an Author the Source has no works for, and for a malformed ID', async () => {
    const missing = createOpenLibraryAdapter({ fetch: replay('gone', 404) })
    expect(await missing.getAuthorWorks?.('OL9A')).toEqual([])
    const empty = createOpenLibraryAdapter({ fetch: replay('{"numFound": 0, "docs": []}') })
    expect(await empty.getAuthorWorks?.('OL9A')).toEqual([])
    expect(await adapter.getAuthorWorks?.('../authors/OL1A')).toEqual([])
  })
})
```

- [ ] **Step 5: Run them to see them fail**

Run: `pnpm --filter api exec vitest run src/catalog/sources/open-library/adapter.test.ts -t getAuthorWorks`
Expected: FAIL (`getAuthorWorks` is undefined, so `works` is `[]` and the first assertion fails).

- [ ] **Step 6: Implement it in `adapter.ts`**

Import `type AuthorWork` from `../types.js` and `{ AUTHOR_WORKS_PAGE_SIZE, authorWorksPath }` from `./author-works.js`. After `memberDocSchema`:

```ts
/** The part of an Author's work search result the adapter reads (D-203). */
const workDocSchema = z.object({
  key: z.string().regex(/^\/works\/OL\d+W$/),
  title: z.string(),
  author_key: z.array(z.string()).optional(),
  edition_count: z.number().int().min(0).optional(),
})
```

After `getSeriesMembers` in the returned object:

```ts
    async getAuthorWorks(sourceId): Promise<AuthorWork[]> {
      const id = authorIdSchema.safeParse(sourceId)
      if (!id.success) return []
      const works: AuthorWork[] = []
      for (let page = 1; ; page += 1) {
        const raw = await getJson(authorWorksPath(id.data, page))
        // No first page means no works; a later page missing or unreadable would cut the list
        // short, so the whole read fails and the sync tries again (D-203).
        if (raw === undefined && page === 1) return []
        const body = searchResponseSchema.safeParse(raw)
        if (!body.success) {
          throw new SourceError(`Open Library returned an unreadable page ${page} of an Author's works`)
        }
        for (const item of body.data.docs) {
          const doc = workDocSchema.safeParse(item)
          if (!doc.success) continue
          // Written by them (listed first), with at least one Edition (D-203).
          const editionCount = doc.data.edition_count ?? 0
          if (doc.data.author_key?.[0] !== id.data || editionCount < 1) continue
          works.push({ sourceId: doc.data.key.replace('/works/', ''), title: doc.data.title, editionCount })
        }
        const lastPage =
          body.data.docs.length < AUTHOR_WORKS_PAGE_SIZE ||
          page * AUTHOR_WORKS_PAGE_SIZE >= body.data.numFound
        if (lastPage) break
      }
      return works
    },
```

- [ ] **Step 7: Run the adapter tests**

Run: `pnpm --filter api exec vitest run src/catalog/sources/open-library`
Expected: PASS, every test including the contract.

- [ ] **Step 8: Write the failing stub test**

Append to `stub-adapter.test.ts` inside `describe('stub Source', …)`:

```ts
  it("lists Tolkien's works, The Silmarillion among them, and nothing for others", async () => {
    const stub = createStubSource()
    expect((await stub.getAuthorWorks?.('stub-author-tolkien'))?.map((w) => w.sourceId)).toEqual([
      'stub-book-hobbit',
      'stub-book-fellowship',
      'stub-book-silmarillion',
    ])
    expect((await stub.getBook('stub-book-silmarillion'))?.book.title).toBe('The Silmarillion')
    expect(await stub.getAuthorWorks?.('stub-author-herbert')).toEqual([])
  })
```

Run: `pnpm --filter api exec vitest run src/catalog/sources/stub`
Expected: FAIL (`getAuthorWorks` undefined).

- [ ] **Step 9: Add The Silmarillion and the method to the stub**

In `EDITIONS` add:

```ts
  'stub-book-silmarillion': [
    {
      isbn13: '9780618391110',
      format: 'paperback',
      language: 'en',
      title: null,
      publisherName: 'Houghton Mifflin',
      publishedDate: '2001-06-01',
      pageCount: 365,
      cover: null,
      sourceLink: { source: SOURCE, entityType: 'edition', sourceId: 'stub-edition-silmarillion-1' },
    },
  ],
```

In `BOOKS` add:

```ts
  // Only Tolkien's bibliography brings it in, so specs can watch a work arrive (D-203).
  'stub-book-silmarillion': bookCandidate(
    'stub-book-silmarillion',
    'The Silmarillion',
    'stub-author-tolkien',
    'J. R. R. Tolkien',
    1,
  ),
```

After `getSeriesMembers`:

```ts
    async getAuthorWorks(sourceId) {
      if (sourceId !== 'stub-author-tolkien') return []
      return [
        { sourceId: 'stub-book-hobbit', title: 'The Hobbit', editionCount: 3 },
        { sourceId: 'stub-book-fellowship', title: 'The Fellowship of the Ring', editionCount: 2 },
        { sourceId: 'stub-book-silmarillion', title: 'The Silmarillion', editionCount: 1 },
      ]
    },
```

Update the `createStubSource` doc comment: "four Books (two in one Series, three by Tolkien)".

- [ ] **Step 10: Run the Source tests and the vocabulary check**

Run: `pnpm --filter api exec vitest run src/catalog/sources && pnpm vocabulary:check`
Expected: PASS; "no Source vocabulary outside the adapter directory".

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/catalog/sources
git commit -m "feat(catalog): getAuthorWorks in the Source adapters (D-203)"
```

---

### Task 4: The Author sync, the work import, and their jobs

**Files:**
- Create: `apps/api/src/catalog/author-sync.ts`
- Test: `apps/api/src/catalog/author-sync.integration.test.ts`
- Modify: `apps/api/src/jobs/registry.ts` (two jobs)
- Test: `apps/api/src/jobs/registry.test.ts`

**Interfaces:**
- Consumes: Task 1 `storedBooks`, `importBookFromSource`, `Call`, `direct`, `books.importOnly`; Task 2 `authors.worksSyncedAt`, `authors.sourceWorkCount`; Task 3 `SourceAdapter.getAuthorWorks`.
- Produces (from `author-sync.ts`): `interface AuthorWorkImport { authorId: string; sourceId: string }`; `syncAuthorWorks(options: { db: Database; source: SourceAdapter; authorId: string; call?: Call; now?: Date }): Promise<{ outcome: 'synced'; toImport: AuthorWorkImport[] } | { outcome: 'not_linked' | 'unsupported' }>`; `importAuthorWork(options: { db: Database; source: SourceAdapter; sourceId: string; call?: Call; now?: Date }): Promise<'imported' | 'stored' | 'not_found'>`; `authorDueForSync(db: Database, author: { id: string; worksSyncedAt: Date | null }, now?: Date): Promise<boolean>`; `queueAuthorSync(jobs: Pick<JobQueue, 'enqueue'>, authorId: string): Promise<void>`; `queueAuthorWorkImports(jobs: Pick<JobQueue, 'enqueue'>, works: readonly AuthorWorkImport[]): Promise<void>`. Jobs `catalog.author-sync` (`{ authorId }`) and `catalog.author-work` (`{ authorId, sourceId }`).

- [ ] **Step 1: Write the failing integration tests**

Create `apps/api/src/catalog/author-sync.integration.test.ts`:

```ts
import { authors, books, createDb, sourceLinks } from '@reprint/db'
import { startTestDatabase, type TestDatabase, truncateAllTables } from '@reprint/db/testing'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  authorDueForSync,
  importAuthorWork,
  queueAuthorSync,
  queueAuthorWorkImports,
  syncAuthorWorks,
} from './author-sync.js'
import { ingestBook } from './ingest/ingest.js'
import { STALE_AFTER_MS } from './staleness.js'
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

/** Stores the Hobbit as a reached Book, which stores Tolkien with a Source link. */
async function storeHobbit(options: { importOnly?: boolean } = {}) {
  const candidate = await stub.getBook('stub-book-hobbit')
  const tolkien = await stub.getAuthor('stub-author-tolkien')
  if (!candidate || !tolkien) throw new Error('missing stub data')
  await ingestBook(db, {
    source: stub,
    candidate,
    authorRecords: new Map([['stub-author-tolkien', tolkien]]),
    ...(options.importOnly ? { importOnly: true } : {}),
  })
  const [author] = await db.select().from(authors)
  if (!author) throw new Error('no author')
  return author
}

const titles = async () =>
  (await db.select({ title: books.title }).from(books)).map((book) => book.title).sort()

describe('syncAuthorWorks', () => {
  it('records the count and time and lists the works to import, without fetching Books', async () => {
    const tolkien = await storeHobbit()
    const getBook = vi.spyOn(stub, 'getBook')
    const now = new Date('2026-10-13T00:00:00.000Z')
    const result = await syncAuthorWorks({ db, source: stub, authorId: tolkien.id, now })
    expect(result).toEqual({
      outcome: 'synced',
      toImport: [
        { authorId: tolkien.id, sourceId: 'stub-book-fellowship' },
        { authorId: tolkien.id, sourceId: 'stub-book-silmarillion' },
      ],
    })
    expect(getBook).not.toHaveBeenCalled()
    const [row] = await db.select().from(authors).where(eq(authors.id, tolkien.id))
    expect(row).toMatchObject({ sourceWorkCount: 3, worksSyncedAt: now })
    getBook.mockRestore()
  })

  it('fails without recording a sync when the list cannot be read, so the job retries', async () => {
    const tolkien = await storeHobbit()
    const failing = {
      ...stub,
      getAuthorWorks: async () => {
        throw new SourceError('Open Library is down')
      },
    }
    await expect(
      syncAuthorWorks({ db, source: failing, authorId: tolkien.id }),
    ).rejects.toBeInstanceOf(SourceError)
    const [row] = await db.select().from(authors).where(eq(authors.id, tolkien.id))
    expect(row).toMatchObject({ sourceWorkCount: null, worksSyncedAt: null })
  })

  it('records an Author with no link to this Source, or a Source without the method, as synced', async () => {
    const tolkien = await storeHobbit()
    const now = new Date('2026-10-13T00:00:00.000Z')
    const { getAuthorWorks: _, ...withoutMethod } = stub
    expect(
      await syncAuthorWorks({ db, source: withoutMethod, authorId: tolkien.id, now }),
    ).toEqual({ outcome: 'unsupported' })
    await db.update(authors).set({ worksSyncedAt: null })
    await db
      .delete(sourceLinks)
      .where(and(eq(sourceLinks.entityType, 'author'), eq(sourceLinks.entityId, tolkien.id)))
    expect(await syncAuthorWorks({ db, source: stub, authorId: tolkien.id, now })).toEqual({
      outcome: 'not_linked',
    })
    const [row] = await db.select().from(authors).where(eq(authors.id, tolkien.id))
    expect(row?.worksSyncedAt).toEqual(now)
  })
})

describe('importAuthorWork', () => {
  it('stores the work as an import-only Book credited to the Author', async () => {
    await storeHobbit()
    expect(await importAuthorWork({ db, source: stub, sourceId: 'stub-book-silmarillion' })).toBe(
      'imported',
    )
    const [silmarillion] = await db.select().from(books).where(eq(books.title, 'The Silmarillion'))
    expect(silmarillion?.importOnly).toBe(true)
    expect(await titles()).toEqual(['The Hobbit', 'The Silmarillion'])
  })

  it('neither fetches nor duplicates a work stored already', async () => {
    await storeHobbit()
    const getBook = vi.spyOn(stub, 'getBook')
    expect(await importAuthorWork({ db, source: stub, sourceId: 'stub-book-hobbit' })).toBe(
      'stored',
    )
    expect(getBook).not.toHaveBeenCalled()
    expect(await titles()).toEqual(['The Hobbit'])
    getBook.mockRestore()
  })

  it('answers not_found when the Source no longer has the work, and throws when it fails', async () => {
    await storeHobbit()
    expect(await importAuthorWork({ db, source: stub, sourceId: 'stub-book-gone' })).toBe(
      'not_found',
    )
    const failing = {
      ...stub,
      getBook: async () => {
        throw new SourceError('Open Library is down')
      },
    }
    await expect(
      importAuthorWork({ db, source: failing, sourceId: 'stub-book-silmarillion' }),
    ).rejects.toBeInstanceOf(SourceError)
  })
})

describe('authorDueForSync', () => {
  const now = new Date('2026-10-13T00:00:00.000Z')

  it('is due for an Author with a reached Book who was never synced or not in 30 days', async () => {
    const tolkien = await storeHobbit()
    expect(await authorDueForSync(db, { id: tolkien.id, worksSyncedAt: null }, now)).toBe(true)
    const old = new Date(now.getTime() - STALE_AFTER_MS - 1)
    expect(await authorDueForSync(db, { id: tolkien.id, worksSyncedAt: old }, now)).toBe(true)
    const recent = new Date(now.getTime() - 1000)
    expect(await authorDueForSync(db, { id: tolkien.id, worksSyncedAt: recent }, now)).toBe(false)
  })

  it('is not due when every Book they are credited on is import-only (one level)', async () => {
    const tolkien = await storeHobbit({ importOnly: true })
    expect(await authorDueForSync(db, { id: tolkien.id, worksSyncedAt: null }, now)).toBe(false)
  })

  it('is not due without a Source link', async () => {
    const tolkien = await storeHobbit()
    await db
      .delete(sourceLinks)
      .where(and(eq(sourceLinks.entityType, 'author'), eq(sourceLinks.entityId, tolkien.id)))
    expect(await authorDueForSync(db, { id: tolkien.id, worksSyncedAt: null }, now)).toBe(false)
  })
})

describe('queueing', () => {
  it('queues one sync per Author and one import per work, deduplicated, in the background', async () => {
    const enqueue = vi.fn(async () => '1')
    await queueAuthorSync({ enqueue }, 'a1')
    await queueAuthorWorkImports({ enqueue }, [{ authorId: 'a1', sourceId: 'w1' }])
    expect(enqueue).toHaveBeenNthCalledWith(
      1,
      'catalog.author-sync',
      { authorId: 'a1' },
      { deduplicationId: 'catalog.author-sync-a1', priority: 10 },
    )
    expect(enqueue).toHaveBeenNthCalledWith(
      2,
      'catalog.author-work',
      { authorId: 'a1', sourceId: 'w1' },
      { deduplicationId: 'catalog.author-work-a1-w1', priority: 10 },
    )
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter api exec vitest run --config vitest.integration.config.ts src/catalog/author-sync.integration.test.ts`
Expected: FAIL with "Cannot find module './author-sync.js'".

- [ ] **Step 3: Implement `apps/api/src/catalog/author-sync.ts`**

```ts
import { authors, books, contributions, type Database, sourceLinks } from '@reprint/db'
import { and, eq, sql } from 'drizzle-orm'
import type { JobQueue } from '../jobs/queue.js'
import { type Call, direct, importBookFromSource, storedBooks } from './import-book.js'
import { SERIES_SYNC_PRIORITY } from './series-sync.js'
import type { SourceAdapter } from './sources/types.js'
import { STALE_AFTER_MS } from './staleness.js'

/** Bibliography imports wait behind interactive work, as Series imports do (PRD §6, D-203). */
export const AUTHOR_SYNC_PRIORITY = SERIES_SYNC_PRIORITY

/** One work a sync found missing, for a `catalog.author-work` job. */
export interface AuthorWorkImport {
  authorId: string
  sourceId: string
}

export type AuthorSyncOutcome =
  | { outcome: 'synced'; toImport: AuthorWorkImport[] }
  | { outcome: 'not_linked' | 'unsupported' }

/**
 * Reads an Author's works from the Source (D-203): records how many there are and when, and
 * returns the works not stored yet, each for its own `catalog.author-work` job. A list that cannot
 * be read throws, so the job retries; an Author this Source cannot list is recorded as synced, so
 * views stop queuing it.
 */
export async function syncAuthorWorks(options: {
  db: Database
  source: SourceAdapter
  authorId: string
  call?: Call
  now?: Date
}): Promise<AuthorSyncOutcome> {
  const { db, source, authorId } = options
  const call = options.call ?? direct
  const now = options.now ?? new Date()
  const getAuthorWorks = source.getAuthorWorks?.bind(source)
  const [link] = getAuthorWorks
    ? await db
        .select({ sourceId: sourceLinks.sourceId })
        .from(sourceLinks)
        .where(
          and(
            eq(sourceLinks.entityType, 'author'),
            eq(sourceLinks.entityId, authorId),
            eq(sourceLinks.source, source.name),
          ),
        )
        .orderBy(sourceLinks.sourceId)
        .limit(1)
    : []
  if (!getAuthorWorks || !link) {
    await db.update(authors).set({ worksSyncedAt: now }).where(eq(authors.id, authorId))
    return { outcome: getAuthorWorks ? 'not_linked' : 'unsupported' }
  }
  const works = await call(() => getAuthorWorks(link.sourceId))
  const have = await storedBooks(
    db,
    source.name,
    works.map((work) => work.sourceId),
  )
  await db
    .update(authors)
    .set({ sourceWorkCount: works.length, worksSyncedAt: now })
    .where(eq(authors.id, authorId))
  return {
    outcome: 'synced',
    toImport: works
      .filter((work) => !have.has(work.sourceId))
      .map((work) => ({ authorId, sourceId: work.sourceId })),
  }
}

/**
 * Imports one work a sync found missing (D-203), as an import-only Book, so it starts no syncs of
 * its own. A Source failure throws, so the job retries.
 */
export async function importAuthorWork(options: {
  db: Database
  source: SourceAdapter
  sourceId: string
  call?: Call
  now?: Date
}): Promise<'imported' | 'stored' | 'not_found'> {
  const { db, source, sourceId } = options
  if ((await storedBooks(db, source.name, [sourceId])).has(sourceId)) return 'stored'
  const bookId = await importBookFromSource({
    db,
    source,
    sourceId,
    ...(options.call ? { call: options.call } : {}),
    ...(options.now ? { now: options.now } : {}),
  })
  return bookId ? 'imported' : 'not_found'
}

/**
 * Whether viewing this Author should import their works (D-203): they have a Source link, were not
 * synced in the last 30 days, and are credited on a Book a Member reached. An Author known only
 * through imported Books is never due, so imports go one level only.
 */
export async function authorDueForSync(
  db: Database,
  author: { id: string; worksSyncedAt: Date | null },
  now: Date = new Date(),
): Promise<boolean> {
  if (author.worksSyncedAt && now.getTime() - author.worksSyncedAt.getTime() < STALE_AFTER_MS) {
    return false
  }
  const [linked] = await db
    .select({ one: sql`1` })
    .from(sourceLinks)
    .where(and(eq(sourceLinks.entityType, 'author'), eq(sourceLinks.entityId, author.id)))
    .limit(1)
  if (!linked) return false
  const [reached] = await db
    .select({ one: sql`1` })
    .from(contributions)
    .innerJoin(books, eq(books.id, contributions.bookId))
    .where(and(eq(contributions.authorId, author.id), eq(books.importOnly, false)))
    .limit(1)
  return reached !== undefined
}

/** Queues an Author's bibliography sync; one waits or runs per Author at a time. */
export async function queueAuthorSync(
  jobs: Pick<JobQueue, 'enqueue'>,
  authorId: string,
): Promise<void> {
  await jobs.enqueue(
    'catalog.author-sync',
    { authorId },
    { deduplicationId: `catalog.author-sync-${authorId}`, priority: AUTHOR_SYNC_PRIORITY },
  )
}

/** Queues one background import per missing work, each retried on its own (D-203). */
export async function queueAuthorWorkImports(
  jobs: Pick<JobQueue, 'enqueue'>,
  works: readonly AuthorWorkImport[],
): Promise<void> {
  for (const work of works) {
    await jobs.enqueue('catalog.author-work', work, {
      deduplicationId: `catalog.author-work-${work.authorId}-${work.sourceId}`,
      priority: AUTHOR_SYNC_PRIORITY,
    })
  }
}
```

- [ ] **Step 4: Run the integration tests**

Run: `pnpm --filter api exec vitest run --config vitest.integration.config.ts src/catalog/author-sync.integration.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Write the failing registry test**

In `registry.test.ts`, next to the `catalog.series-sync` assertions:

```ts
  it('knows the Author bibliography jobs and checks their payloads (D-203)', () => {
    expect(isJobName('catalog.author-sync')).toBe(true)
    expect(isJobName('catalog.author-work')).toBe(true)
    const id = '0192a3b4-0000-7000-8000-000000000001'
    expect(jobs['catalog.author-sync'].payload.safeParse({ authorId: 'x' }).success).toBe(false)
    expect(jobs['catalog.author-sync'].payload.safeParse({ authorId: id }).success).toBe(true)
    expect(
      jobs['catalog.author-work'].payload.safeParse({ authorId: id, sourceId: '' }).success,
    ).toBe(false)
    expect(
      jobs['catalog.author-work'].payload.safeParse({ authorId: id, sourceId: 'OL1W' }).success,
    ).toBe(true)
  })
```

Run: `pnpm --filter api exec vitest run src/jobs/registry.test.ts`
Expected: FAIL (`isJobName('catalog.author-sync')` is false).

- [ ] **Step 6: Register the jobs**

In `registry.ts` import `{ importAuthorWork, queueAuthorWorkImports, syncAuthorWorks }` from `../catalog/author-sync.js`, and after `catalog.series-member`:

```ts
  'catalog.author-sync': defineJob({
    // Reads an Author's works and queues one import per missing work, behind interactive
    // requests (D-203). Short, so a prolific Author never holds a worker.
    payload: z.object({ authorId: z.uuid() }),
    handler: async ({ authorId }, { db, log, catalog, enqueue }) => {
      const result = await syncAuthorWorks({
        db,
        source: catalog.source,
        authorId,
        call: catalog.background,
      })
      if (result.outcome === 'synced') await queueAuthorWorkImports({ enqueue }, result.toImport)
      const queued = result.outcome === 'synced' ? result.toImport.length : 0
      log.info({ authorId, outcome: result.outcome, queued }, 'author works synced')
      return { outcome: result.outcome, queued }
    },
    retry: { attempts: 3, backoffMs: 60_000 },
  }),
  'catalog.author-work': defineJob({
    // Imports one of an Author's works as an import-only Book; retried on its own (D-203).
    payload: z.object({ authorId: z.uuid(), sourceId: z.string().min(1).max(200) }),
    handler: async ({ authorId, sourceId }, { db, log, catalog }) => {
      const outcome = await importAuthorWork({
        db,
        source: catalog.source,
        sourceId,
        call: catalog.background,
      })
      log.info({ authorId, sourceId, outcome }, 'author work imported')
      return { outcome }
    },
    // Up to about half an hour of backoff, so a short Source outage does not lose a work.
    retry: { attempts: 5, backoffMs: 120_000 },
  }),
```

- [ ] **Step 7: Run the job tests and typecheck**

Run: `pnpm --filter api exec vitest run src/jobs && pnpm --filter api typecheck`
Expected: PASS; no type errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/catalog/author-sync.ts apps/api/src/catalog/author-sync.integration.test.ts apps/api/src/jobs
git commit -m "feat(catalog): Author bibliography sync and work import jobs (D-203)"
```

---

### Task 5: The Author route: trigger, order, paging, and `adding`

**Files:**
- Modify: `packages/shared/src/catalog-api.ts:66-75` (query schema, page size, optional fields)
- Modify: `apps/api/src/modules/catalog/read.ts:239-300` (`loadAuthorDetail`)
- Modify: `apps/api/src/modules/catalog/routes.ts:170-180` (querystring, trigger)
- Test: `apps/api/src/modules/catalog/catalog.integration.test.ts` (`describe('GET /v1/authors/:slug')`)
- Modify: `apps/api/openapi.json` (regenerated)

**Interfaces:**
- Consumes: Task 4 `authorDueForSync`, `queueAuthorSync`; Task 2 columns.
- Produces: `authorDetailQuerySchema` (`{ page: number }`, 1 to 50, default 1), `AUTHOR_WRITTEN_PAGE_SIZE = 24`, `AuthorDetail.writtenTotal?: number`, `AuthorDetail.adding?: boolean`; `loadAuthorDetail(db, author, options?: { page?: number; now?: Date })`.

- [ ] **Step 1: Extend the shared schema**

In `catalog-api.ts` replace the `authorDetailSchema` block with:

```ts
/** How many Books the Author page's Written list shows per page (D-203). */
export const AUTHOR_WRITTEN_PAGE_SIZE = 24

/** `GET /authors/:slug?page=N`: the Written list holds the first `N × 24` Books (D-203). */
export const authorDetailQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(50).default(1),
})

/** `GET /authors/:slug`: the Author and their Books grouped by Role, most reviewed first. */
export const authorDetailSchema = authorSchema.extend({
  works: z.array(
    z.object({
      role: contributionRoleSchema,
      books: z.array(bookSummarySchema),
    }),
  ),
  /** Every stored Book with the Role `author`; `works` holds a page of them (D-203). */
  writtenTotal: z.number().int().min(0).optional(),
  /** True while a recent bibliography import is still adding Books (D-203). */
  adding: z.boolean().optional(),
})
```

Run: `pnpm --filter @reprint/shared build`

- [ ] **Step 2: Write the failing route tests**

In `catalog.integration.test.ts` add `AUTHOR_WRITTEN_PAGE_SIZE` to the `@reprint/shared` import, then add inside `describe('GET /v1/authors/:slug', …)`:

```ts
  /** Stores `count` more Books written by the Author, each with `editions` as its Source count. */
  async function addWrittenBooks(authorId: string, count: number, editions: (i: number) => number) {
    for (let i = 0; i < count; i += 1) {
      const [book] = await stack.db.db
        .insert(books)
        .values({
          slug: `written-${i}`,
          title: `Written ${String(i).padStart(2, '0')}`,
          sourceEditionCount: editions(i),
        })
        .returning({ id: books.id })
      if (!book) throw new Error('no book')
      await stack.db.db
        .insert(contributions)
        .values({ bookId: book.id, authorId, role: 'author', position: 0 })
    }
  }

  it('queues a bibliography sync for an Author with a reached Book, once per 30 days (D-203)', async () => {
    await ingest('stub-book-hobbit', 'stub-author-tolkien')
    const [tolkien] = await stack.db.db.select().from(authors)
    if (!tolkien) throw new Error('no author')
    await app.inject({ method: 'GET', url: `/v1/authors/${tolkien.slug}` })
    expect(queued.filter((job) => job.name === 'catalog.author-sync')).toEqual([
      {
        name: 'catalog.author-sync',
        payload: { authorId: tolkien.id },
        options: { deduplicationId: `catalog.author-sync-${tolkien.id}`, priority: 10 },
      },
    ])
    queued.length = 0
    await stack.db.db.update(authors).set({ worksSyncedAt: new Date() })
    await app.inject({ method: 'GET', url: `/v1/authors/${tolkien.slug}` })
    expect(queued.filter((job) => job.name === 'catalog.author-sync')).toEqual([])
  })

  it('queues nothing for an Author known only through imported Books (one level, D-203)', async () => {
    const { bookId } = await ingest('stub-book-hobbit', 'stub-author-tolkien')
    await stack.db.db.update(books).set({ importOnly: true }).where(eq(books.id, bookId))
    const [tolkien] = await stack.db.db.select().from(authors)
    await app.inject({ method: 'GET', url: `/v1/authors/${tolkien?.slug}` })
    expect(queued.filter((job) => job.name === 'catalog.author-sync')).toEqual([])
  })

  it('orders ties by the Source Edition count and pages the Written list (D-203)', async () => {
    await ingest('stub-book-dune', 'stub-author-herbert')
    const [herbert] = await stack.db.db.select().from(authors)
    if (!herbert) throw new Error('no author')
    // 29 more, so 30 in all; Written 28 has the most Editions, Dune has none known.
    await addWrittenBooks(herbert.id, 29, (i) => (i === 28 ? 500 : i))
    const first = authorDetailSchema.parse(
      (await app.inject({ method: 'GET', url: `/v1/authors/${herbert.slug}` })).json(),
    )
    const written = first.works.find((work) => work.role === 'author')?.books ?? []
    expect(first.writtenTotal).toBe(30)
    expect(written).toHaveLength(AUTHOR_WRITTEN_PAGE_SIZE)
    expect(written.slice(0, 3).map((book) => book.title)).toEqual([
      'Written 28',
      'Written 27',
      'Written 26',
    ])
    const second = authorDetailSchema.parse(
      (await app.inject({ method: 'GET', url: `/v1/authors/${herbert.slug}?page=2` })).json(),
    )
    const all = second.works.find((work) => work.role === 'author')?.books ?? []
    expect(all).toHaveLength(30)
    expect(all.at(-1)?.title).toBe('Dune')
  })

  it('says it is still adding while a recent sync found more works than are stored (D-203)', async () => {
    await ingest('stub-book-hobbit', 'stub-author-tolkien')
    const [tolkien] = await stack.db.db.select().from(authors)
    await stack.db.db.update(authors).set({ sourceWorkCount: 3, worksSyncedAt: new Date() })
    const adding = authorDetailSchema.parse(
      (await app.inject({ method: 'GET', url: `/v1/authors/${tolkien?.slug}` })).json(),
    )
    expect(adding.adding).toBe(true)
    await stack.db.db.update(authors).set({ sourceWorkCount: 1 })
    const done = authorDetailSchema.parse(
      (await app.inject({ method: 'GET', url: `/v1/authors/${tolkien?.slug}` })).json(),
    )
    expect(done.adding).toBe(false)
  })

  it('rejects a page outside 1 to 50', async () => {
    await ingest('stub-book-dune', 'stub-author-herbert')
    const [herbert] = await stack.db.db.select().from(authors)
    for (const page of ['0', '51', 'abc']) {
      const response = await app.inject({
        method: 'GET',
        url: `/v1/authors/${herbert?.slug}?page=${page}`,
      })
      expect(response.statusCode).toBe(400)
    }
  })
```

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm --filter api exec vitest run --config vitest.integration.config.ts src/modules/catalog/catalog.integration.test.ts -t "GET /v1/authors"`
Expected: FAIL (no `catalog.author-sync` queued; `writtenTotal` undefined; page 0 answers 200).

- [ ] **Step 4: Page and order in `loadAuthorDetail`**

In `read.ts` import `AUTHOR_WRITTEN_PAGE_SIZE` from `@reprint/shared` and `sql` from `drizzle-orm` (if not already), add above `loadAuthorDetail`:

```ts
/** How long after a sync the Author page says Books are still arriving (as for Series). */
const AUTHOR_ADDING_FOR_MS = 24 * 60 * 60 * 1000

/** True while a recent bibliography sync found more works than are stored (D-203). */
export function isAuthorAdding(
  author: { sourceWorkCount: number | null; worksSyncedAt: Date | null },
  written: number,
  now: Date = new Date(),
): boolean {
  if (author.sourceWorkCount === null || author.worksSyncedAt === null) return false
  if (written >= author.sourceWorkCount) return false
  return now.getTime() - author.worksSyncedAt.getTime() < AUTHOR_ADDING_FOR_MS
}
```

Change `loadAuthorDetail`'s signature and first part to:

```ts
/**
 * An Author's Books grouped by Role (in `CONTRIBUTION_ROLES` order): most reviewed first, then the
 * most Editions on the Source (PRD §7.5, D-203). The Written list holds the first `page × 24`.
 */
export async function loadAuthorDetail(
  db: Database,
  author: typeof authors.$inferSelect,
  options: { page?: number; now?: Date } = {},
): Promise<AuthorDetail> {
  const allRows = await db
    .select({ role: contributions.role, book: books })
    .from(contributions)
    .innerJoin(books, eq(books.id, contributions.bookId))
    .where(eq(contributions.authorId, author.id))
    .orderBy(
      desc(books.reviewCount),
      sql`${books.sourceEditionCount} desc nulls last`,
      asc(books.title),
      asc(books.id),
    )
  const writtenTotal = allRows.filter((row) => row.role === 'author').length
  const writtenShown = (options.page ?? 1) * AUTHOR_WRITTEN_PAGE_SIZE
  let written = 0
  const rows = allRows.filter((row) => {
    if (row.role !== 'author') return true
    written += 1
    return written <= writtenShown
  })
```

(the rest of the function keeps using `rows`), and add to the returned object:

```ts
    writtenTotal,
    adding: isAuthorAdding(author, writtenTotal, options.now),
```

- [ ] **Step 5: Queue the sync and take the page in the route**

In `routes.ts` import `authorDetailQuerySchema` from `@reprint/shared` and `{ authorDueForSync, queueAuthorSync }` from `../../catalog/author-sync.js`. Replace the `/authors/:slug` handler with:

```ts
  app.get(
    '/authors/:slug',
    {
      schema: {
        params: slugParamsSchema,
        querystring: authorDetailQuerySchema,
        response: { 200: authorDetailSchema },
      },
    },
    async (request) => {
      if (!db) throw new Error('catalog routes need a database')
      const author = await findAuthorBySlug(db, request.params.slug)
      if (!author) throw new HttpProblem(404, 'We could not find that author.')
      if (jobs) {
        // Viewing an Author someone reached imports the rest of their works (D-203); it never
        // fails or slows the page.
        await authorDueForSync(db, author)
          .then((due) => (due ? queueAuthorSync(jobs, author.id) : undefined))
          .catch((error: unknown) =>
            request.log.warn({ err: error, authorId: author.id }, 'could not queue Author sync'),
          )
      }
      return loadAuthorDetail(db, author, { page: request.query.page })
    },
  )
```

- [ ] **Step 6: Run the route tests**

Run: `pnpm --filter api exec vitest run --config vitest.integration.config.ts src/modules/catalog/catalog.integration.test.ts`
Expected: PASS, the existing tests included.

- [ ] **Step 7: Regenerate the OpenAPI document**

Run: `pnpm --filter api build && pnpm openapi:check && git diff --stat apps/api/openapi.json`
Expected: `openapi.json` gains the `page` query parameter and the `writtenTotal`/`adding` properties; the check reports it up to date.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/catalog-api.ts apps/api/src/modules/catalog apps/api/openapi.json
git commit -m "feat(api): Author page queues the bibliography import and pages Written (D-203)"
```

---

### Task 6: The web Author page: "Show more" and the adding note

**Files:**
- Modify: `apps/web/app/copy/index.ts` (`copy.author`)
- Modify: `apps/web/app/routes/author.tsx` (page in, page out)
- Test: `apps/web/app/routes/author.test.ts`
- Modify: `apps/web/app/components/books/author-page.tsx`
- Test: `apps/web/app/components/books/author-page.test.tsx`

**Interfaces:**
- Consumes: Task 5 `AuthorDetail.writtenTotal`, `AuthorDetail.adding`, `AUTHOR_WRITTEN_PAGE_SIZE`.
- Produces: `AuthorPage({ author, page }: { author: AuthorDetail; page?: number })`; loader data `page: number`.

- [ ] **Step 1: Write the failing loader test**

In `author.test.ts`, change `load` to accept a URL query and add a test:

```ts
function load(handler: (url: URL) => Response, slug = 'frank-herbert', search = '') {
  vi.stubGlobal('fetch', async (url: URL) => handler(new URL(String(url))))
  return loader({
    request: new Request(`https://reprint.test/authors/${slug}${search}`),
    params: { slug },
  } as never)
}
```

```ts
  it('asks the API for the requested page of the Written list, and ignores a bad one (D-203)', async () => {
    const asked: string[] = []
    const record = (url: URL) => {
      asked.push(url.search)
      return respond(url)
    }
    expect((await load(record, 'frank-herbert', '?page=2')).page).toBe(2)
    expect(asked.at(-1)).toBe('?page=2')
    for (const bad of ['?page=0', '?page=51', '?page=abc', '?page=1.5', '']) {
      expect((await load(record, 'frank-herbert', bad)).page).toBe(1)
      expect(asked.at(-1)).toBe('')
    }
  })
```

Run: `pnpm --filter web exec vitest run app/routes/author.test.ts`
Expected: FAIL (`page` undefined).

- [ ] **Step 2: Read the page in the loader**

In `routes/author.tsx`, at the start of `loader` after the slug check:

```ts
  // The Written list's page (D-203); anything outside 1 to 50 shows the first.
  const asked = Number(new URL(request.url).searchParams.get('page'))
  const page = Number.isInteger(asked) && asked >= 1 && asked <= 50 ? asked : 1
```

Change the API call to `` apiClientFor(request).get(`/v1/authors/${slug.data}${page > 1 ? `?page=${page}` : ''}`) ``, return `page` with the loader data, and pass it to the page: `<AuthorPage key={loaderData.author.id} author={loaderData.author} page={loaderData.page} />`.

Run: `pnpm --filter web exec vitest run app/routes/author.test.ts`
Expected: PASS.

- [ ] **Step 3: Add the copy**

In `copy.author` (the one with `roleHeadings`):

```ts
    showMore: (remaining: number) => `Show more (${remaining} more)`,
    adding: 'Still adding Books by this author.',
```

- [ ] **Step 4: Write the failing component tests**

In `author-page.test.tsx` add `AUTHOR_WRITTEN_PAGE_SIZE` from `@reprint/shared` and these inside `describe('AuthorPage', …)`:

```ts
  const written = (count: number) =>
    Array.from({ length: count }, (_, i) => summary(10 + i, `Book ${i}`, 0))

  it('offers the rest of a long Written list, with how many remain (D-203)', () => {
    renderPage({
      works: [{ role: 'author', books: written(AUTHOR_WRITTEN_PAGE_SIZE) }],
      writtenTotal: 30,
    })
    const more = screen.getByRole('link', { name: 'Show more (6 more)' })
    expect(more.getAttribute('href')).toBe('/?page=2#author-books-author')
  })

  it('shows no Show more when every Written Book is on the page, at exactly 24', () => {
    renderPage({
      works: [{ role: 'author', books: written(AUTHOR_WRITTEN_PAGE_SIZE) }],
      writtenTotal: AUTHOR_WRITTEN_PAGE_SIZE,
    })
    expect(screen.queryByRole('link', { name: /Show more/ })).toBeNull()
  })

  it('shows 1 more at 25', () => {
    renderPage({
      works: [{ role: 'author', books: written(AUTHOR_WRITTEN_PAGE_SIZE) }],
      writtenTotal: AUTHOR_WRITTEN_PAGE_SIZE + 1,
    })
    expect(screen.getByRole('link', { name: 'Show more (1 more)' })).toBeTruthy()
  })

  it('says Books are still being added while an import runs (D-203)', () => {
    renderPage({ adding: true })
    const section = screen.getByRole('region', { name: 'Written' })
    expect(within(section).getByRole('status').textContent).toBe(
      'Still adding Books by this author.',
    )
  })
```

(`summary(n, title, count)` is the file's existing fixture helper; `renderPage` renders at `/`, so the link is `/?page=2#…`. If `summary` takes different arguments, adapt the call, not the assertions.)

Run: `pnpm --filter web exec vitest run app/components/books/author-page.test.tsx`
Expected: FAIL (no link, no status).

- [ ] **Step 5: Render "Show more" and the note**

In `author-page.tsx` import `{ Link, useLocation }` from `react-router` (the remaining count comes from the response, so no page-size constant is needed here). Change the signature to `export function AuthorPage({ author, page = 1 }: { author: AuthorDetail; page?: number })` and add near the top of the body:

```ts
  const { pathname } = useLocation()
  // Paging counts the API's `author` list only; co-written Books are short and come whole.
  const writtenShown = author.works.find((work) => work.role === 'author')?.books.length ?? 0
  const writtenRemaining = (author.writtenTotal ?? writtenShown) - writtenShown
```

Inside the group `<section>`, right after the `<h2>`:

```tsx
                {group === 'author' && author.adding ? (
                  <p role="status" className="text-sm text-muted-foreground">
                    {text.adding}
                  </p>
                ) : null}
```

and after `<BookGrid … />`:

```tsx
                {group === 'author' && writtenRemaining > 0 ? (
                  <Link
                    to={`${pathname}?page=${page + 1}#author-books-author`}
                    className="self-start rounded-full border border-input-border bg-surface px-5 py-2.5 text-[15px] font-semibold hover:bg-surface-raised"
                  >
                    {text.showMore(writtenRemaining)}
                  </Link>
                ) : null}
```

Run: `pnpm --filter web exec vitest run app/components/books/author-page.test.tsx app/routes/author.test.ts`
Expected: PASS, including the existing axe test.

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm --filter web typecheck`
Expected: no errors.

```bash
git add apps/web/app
git commit -m "feat(web): Author page Written list loads 24 at a time and says when Books are arriving (D-203)"
```

---

### Task 7: End to end, docs, and the full gate

**Files:**
- Modify: `e2e/support/accounts.ts` (Author lock and reset)
- Create: `e2e/specs/author.spec.ts`
- Modify: `docs/DECISIONS.md` (D-203), `docs/DESIGN.md`, `docs/PROGRESS.md`

**Interfaces:**
- Consumes: everything above; stub Book "The Silmarillion".
- Produces: `withAuthorLock<T>(work: () => Promise<T>): Promise<T>`, `resetAuthorWorks(authorName: string, workTitle: string): Promise<void>` in `e2e/support/accounts.ts`.

- [ ] **Step 1: Add the reset helpers**

In `e2e/support/accounts.ts` (import `authors` and `sourceLinks` from `@reprint/db` alongside the existing imports), after `resetSeriesSync`:

```ts
/** Advisory lock key for specs that reset an Author's bibliography; any constant unused elsewhere. */
const authorLockKey = 203_203

/** Runs `work` while holding the Author lock, so the projects' copies of a spec take turns (D-203). */
export async function withAuthorLock<T>(work: () => Promise<T>): Promise<T> {
  const client = createDb(databaseUrl, { max: 1 })
  try {
    await client.sql`select pg_advisory_lock(${authorLockKey}::bigint)`
    try {
      return await work()
    } finally {
      await client.sql`select pg_advisory_unlock(${authorLockKey}::bigint)`
    }
  } finally {
    await client.close()
  }
}

/**
 * Puts an Author back to "never synced" and removes one of their works, as if their bibliography
 * had never been imported, so a spec can watch the sync bring it in (D-203). The e2e database is
 * kept between local runs, so a spec cannot rely on either being new.
 */
export async function resetAuthorWorks(authorName: string, workTitle: string) {
  await withDb(async (db) => {
    await db.update(authors).set({ worksSyncedAt: null }).where(eq(authors.name, authorName))
    const [work] = await db.select({ id: books.id }).from(books).where(eq(books.title, workTitle))
    if (!work) return
    // Source links name their entity without a foreign key, so they go first.
    await db
      .delete(sourceLinks)
      .where(and(eq(sourceLinks.entityType, 'book'), eq(sourceLinks.entityId, work.id)))
    await db.delete(books).where(eq(books.id, work.id))
  })
}
```

- [ ] **Step 2: Write the e2e spec**

Create `e2e/specs/author.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { expectNoA11yViolations } from '../support/a11y.js'
import { resetAuthorWorks, withAuthorLock } from '../support/accounts.js'
import { useOwnClientIp } from '../support/identity.js'

// The stub Source lists three works by Tolkien; The Silmarillion is reachable only through his
// bibliography. Reaching The Hobbit makes him due, and opening his page imports the rest (D-203).
test("opening an Author's page brings in the rest of their works", async ({ page }) => {
  test.setTimeout(90_000)
  await useOwnClientIp(page)
  await withAuthorLock(async () => {
    await resetAuthorWorks('J. R. R. Tolkien', 'The Silmarillion')
    await page.goto('/search?q=hobbit')
    await page.getByRole('main').getByRole('link', { name: /The Hobbit/ }).first().click()
    await expect(page.getByRole('heading', { level: 1, name: 'The Hobbit' })).toBeVisible()
    await page.getByRole('main').getByRole('link', { name: 'J. R. R. Tolkien' }).first().click()
    await expect(page.getByRole('heading', { level: 1, name: 'J. R. R. Tolkien' })).toBeVisible()

    const written = page.getByRole('region', { name: 'Written' })
    await expect(async () => {
      await page.reload()
      await expect(written.getByText('The Silmarillion').first()).toBeVisible({ timeout: 1_000 })
    }).toPass({ timeout: 30_000 })
    await expectNoA11yViolations(page)
  })
})
```

- [ ] **Step 3: Run it on a fresh stack**

Run:

```bash
pnpm build
docker compose -p reprint-e2e -f docker-compose.yml -f docker-compose.e2e.yml down -v
node e2e/run.mjs specs/author.spec.ts --retries=0
```

Expected: 3 passed (chromium, webkit, mobile).

- [ ] **Step 4: Write the docs**

Append D-203 to `docs/DECISIONS.md`:

```markdown
### D-203 · Import the bibliography of an Author a Member reached
- Status: Decided (owner, 2026-10-13). Proposes a change to PRD §6, as D-199 did.
- Decision: Viewing an Author's page queues `catalog.author-sync` (deduplicated per Author, background priority) when the Author has a Source link, was not synced in 30 days, and is credited (any Role) on a Book a Member reached. The job reads the Source's list of their works through `getAuthorWorks` (Open Library: `search.json?q=author_key:…&sort=editions`, every page, 100 a page; an unreadable page fails the job), keeps works that list them first and have at least one Edition, with no cap, records `authors.source_work_count` and `works_synced_at`, and queues one `catalog.author-work` job per work not stored (deduplicated, 5 attempts with backoff). Each work is stored as import-only, the mark Series imports use (`books.series_import_only`, Drizzle property now `importOnly`; the column keeps its name for deploy compatibility), so it starts no syncs and makes no Author due until a Member reaches it (one level only). An Author the Source cannot list is recorded as synced. The Author page orders each Role by review count, then the Source's Edition count, then title; its Written list shows 24 per `?page` with "Show more (N more)", and says "Still adding Books by this author." for a day after a sync that found more works than are stored.
- Proposed PRD §6 wording: "RePrint stores the Books its Members use, plus the other Books in their Series and the other works of their Authors when the Source lists them."
- Why: The owner wants an Author page to list the Author's whole bibliography, not only the Books someone happened to open. Checked live: Tolkien has 318 works listed first, 309 with an Edition; most of the tail is translations and reissues filed as separate works. The owner chose no cap and to skip only works with no Editions, accepting more possible duplicates in the merge queue.
- Affects: `packages/db` (migration 0022, `importOnly`), `packages/shared` (`authorDetailQuerySchema`, `writtenTotal`, `adding`), `apps/api/src/catalog/` (`import-book.ts`, `author-sync.ts`, `series-sync.ts`, Open Library `author-works.ts` and adapter, stub Source), `apps/api/src/jobs/registry.ts`, `apps/api/src/modules/catalog/` (route, `read.ts`), `apps/web` Author page and route, `e2e/specs/author.spec.ts`; spec `docs/superpowers/specs/2026-10-13-author-bibliography-design.md`
```

In `docs/DESIGN.md`, in the Author page row of the components table (the line beginning `| Author page |`), change "Books under a Role heading as `BookCard`s" to "Books under a Role heading as `BookCard`s; Written shows 24 at a time with a "Show more (N more)" pill and a "Still adding" status line while a bibliography import runs (D-203)".

Append to `docs/PROGRESS.md` a `### 2026-10-13 · Author bibliography · owner request · feat/author-bibliography` entry summarizing: the trigger and one-level rule; the Source check (Tolkien 309 works with an Edition, Le Guin 201 in the fixture); the jobs; the page; test counts from Step 5; anything that deviated from this plan.

- [ ] **Step 5: Run the full gate**

Run:

```bash
pnpm check
docker compose -p reprint-e2e -f docker-compose.yml -f docker-compose.e2e.yml down -v
node e2e/run.mjs
```

Expected: `pnpm check` exits 0; the e2e run passes (fill the exact counts into PROGRESS).

- [ ] **Step 6: Commit**

```bash
git add e2e docs
git commit -m "test(e2e): an Author page brings in their works; D-203 docs"
```
