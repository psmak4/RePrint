import type { AuthorRecord, BookCandidate } from '@reprint/shared'
import { createOpenLibraryAdapter } from './adapter.js'
import { createFixtureFetch } from './fixture-fetch.js'

/** The Source records for the Books kept in `__fixtures__`, which the local seed stores as real data. */
const FIXTURE_BOOK_IDS = ['OL59800W'] as const

export interface FixtureBook {
  candidate: BookCandidate
  authorRecords: Map<string, AuthorRecord>
}

/** Reads the recorded Books (and their Authors) through the adapter, so they are translated like live ones. */
export async function loadFixtureBooks(): Promise<{
  source: ReturnType<typeof createOpenLibraryAdapter>
  books: FixtureBook[]
}> {
  const source = createOpenLibraryAdapter({ fetch: createFixtureFetch() })
  const books: FixtureBook[] = []
  for (const sourceId of FIXTURE_BOOK_IDS) {
    const candidate = await source.getBook(sourceId)
    if (!candidate) throw new Error(`No recorded fixture for Book ${sourceId}`)
    const authorRecords = new Map<string, AuthorRecord>()
    for (const contribution of candidate.book.contributions) {
      const link = contribution.sourceLink
      if (!link || authorRecords.has(link.sourceId)) continue
      const record = await source.getAuthor(link.sourceId)
      if (record) authorRecords.set(link.sourceId, record)
    }
    books.push({ candidate, authorRecords })
  }
  return { source, books }
}
