import {
  authorRecordSchema,
  bookCandidateEditionSchema,
  bookCandidateSchema,
  bookSearchPageSchema,
} from '@reprint/shared'
import { describe, expect, it } from 'vitest'
import { SOURCE_FIELDS, type SourceAdapter, STORAGE_POLICIES } from '../catalog/sources/types.js'

/** What the contract suite asks an adapter about. Every ID and query must exist in the adapter's Source. */
export interface SourceContractFixtures {
  /** Queries that must return at least one candidate; include a title, an Author, and an ISBN. */
  searches: readonly string[]
  /** A query that must return no candidates. */
  emptySearch: string
  /** Source IDs of Books that `getBook` and `getEditions` must resolve. */
  bookIds: readonly string[]
  /** Source IDs of Authors that `getAuthor` must resolve. */
  authorIds: readonly string[]
  /** An ID the Source does not have. */
  unknownId: string
}

/**
 * The shared contract every Source adapter must pass (PRD §12): each output is checked against the shared
 * Zod schemas, so an adapter can only ever hand RePrint domain types to the Catalog.
 */
export function runSourceContract(adapter: SourceAdapter, fixtures: SourceContractFixtures): void {
  describe(`Source contract: ${adapter.name}`, () => {
    it('declares a name, a storage policy, and trusted fields', () => {
      expect(adapter.name).toMatch(/^[a-z][a-z0-9_]*$/)
      expect(STORAGE_POLICIES).toContain(adapter.storagePolicy)
      for (const [field, priority] of Object.entries(adapter.trustedFields)) {
        expect(SOURCE_FIELDS).toContain(field)
        expect(Number.isInteger(priority) && priority >= 1).toBe(true)
      }
    })

    for (const query of fixtures.searches) {
      it(`searchBooks("${query}") returns valid Book candidates`, async () => {
        const result = await adapter.searchBooks(query, 1)
        expect(bookSearchPageSchema.parse(result).candidates.length).toBeGreaterThan(0)
        expect(result.page).toBe(1)
        for (const candidate of result.candidates) {
          expect(candidate.sourceLink.source).toBe(adapter.name)
          expect(candidate.sourceLink.entityType).toBe('book')
        }
      })
    }

    it('searchBooks returns an empty page for a query with no match', async () => {
      const result = bookSearchPageSchema.parse(await adapter.searchBooks(fixtures.emptySearch, 1))
      expect(result.candidates).toEqual([])
      expect(result.hasMore).toBe(false)
    })

    for (const id of fixtures.bookIds) {
      it(`getBook and getEditions resolve a Book (${id})`, async () => {
        const book = await adapter.getBook(id)
        expect(book).not.toBeNull()
        expect(bookCandidateSchema.parse(book).sourceLink.source).toBe(adapter.name)
        const editions = await adapter.getEditions(id)
        expect(editions.length).toBeGreaterThan(0)
        for (const edition of editions) bookCandidateEditionSchema.parse(edition)
      })
    }

    for (const id of fixtures.authorIds) {
      it(`getAuthor resolves an Author (${id})`, async () => {
        const author = authorRecordSchema.parse(await adapter.getAuthor(id))
        expect(author.sourceLink.source).toBe(adapter.name)
        expect(author.sourceLink.entityType).toBe('author')
      })
    }

    it('returns null, not an error, for a record the Source does not have', async () => {
      expect(await adapter.getBook(fixtures.unknownId)).toBeNull()
      expect(await adapter.getAuthor(fixtures.unknownId)).toBeNull()
    })
  })
}
