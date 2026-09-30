import { createSeedRandom, type Database } from '@reprint/db'
import { ingestBook } from './ingest/ingest.js'
import { loadFixtureBooks } from './sources/open-library/seed-fixtures.js'
import { generateSeedBooks } from './sources/seed/generate.js'
import { createSeedSource } from './sources/seed/seed-source.js'

/** One number drives every generated Book, so two seeds create the same Catalog. */
export const CATALOG_SEED = 20260102

export interface SeedCatalogResult {
  books: number
  created: number
  mergeCandidates: number
}

/**
 * Loads the sample Catalog through `ingestBook`, the same path live Books take: the recorded Books from the
 * Open Library fixtures, then generated Books. Books are matched by Source link, so running it again adds
 * nothing.
 */
export async function seedCatalog(
  db: Database,
  log: (message: string) => void = () => {},
): Promise<SeedCatalogResult> {
  const now = new Date()
  const seedSource = createSeedSource()
  const fixtures = await loadFixtureBooks()
  const result: SeedCatalogResult = { books: 0, created: 0, mergeCandidates: 0 }
  const store = async (
    source: Parameters<typeof ingestBook>[1]['source'],
    book: Awaited<ReturnType<typeof loadFixtureBooks>>['books'][number],
  ) => {
    const ingested = await ingestBook(db, {
      source,
      otherSources: [fixtures.source, seedSource],
      candidate: book.candidate,
      authorRecords: book.authorRecords,
      now,
    })
    result.books += 1
    if (ingested.created) result.created += 1
    result.mergeCandidates += ingested.mergeCandidateBookIds.length
  }
  for (const book of fixtures.books) await store(fixtures.source, book)
  log(`catalog seed: ${fixtures.books.length} recorded Books`)
  const generated = generateSeedBooks(createSeedRandom(CATALOG_SEED))
  for (const book of generated) await store(seedSource, book)
  log(`catalog seed: ${generated.length} generated Books`)
  return result
}
