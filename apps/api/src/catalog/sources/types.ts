import type {
  AuthorRecord,
  BookCandidate,
  BookCandidateEdition,
  BookSearchPage,
} from '@reprint/shared'

/** What RePrint may do with a Source's data (PRD §5.2). The Catalog accepts records only from `store` Sources. */
export const STORAGE_POLICIES = ['store', 'cache', 'none'] as const
export type StoragePolicy = (typeof STORAGE_POLICIES)[number]

/** Fields a Source can be trusted to fill. Field origins in the Catalog name the winning Source per field. */
export const SOURCE_FIELDS = [
  'title',
  'subtitle',
  'description',
  'firstPublishedYear',
  'originalLanguage',
  'cover',
  'contributions',
  'series',
  'subjects',
  'editions',
  'authorBio',
  'authorPhoto',
] as const
export type SourceField = (typeof SOURCE_FIELDS)[number]

/**
 * A Source's trusted fields, each with a priority. When two Sources supply the same field the lower
 * number wins (1 is the first choice). A field that is absent is not trusted from this Source.
 */
export type TrustedFieldPriorities = Partial<Record<SourceField, number>>

/** A failure to reach or read a Source. A record the Source doesn't have is `null`, not an error. */
export class SourceError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'SourceError'
  }
}

/**
 * The one interface every Source adapter implements (PRD §6). Adapters return RePrint domain types and
 * never raw provider data. `sourceId` values are opaque handles that only leave the adapter inside a
 * `SourceLink`.
 */
export interface SourceAdapter {
  /** Stable name stored in `source_links.source` and field origins, such as `open_library`. */
  readonly name: string
  readonly storagePolicy: StoragePolicy
  readonly trustedFields: TrustedFieldPriorities

  /** Book candidates for a title, author, or ISBN query; `page` starts at 1. */
  searchBooks(query: string, page: number): Promise<BookSearchPage>
  /** The full record for one Book, or `null` when the Source has no such Book. */
  getBook(sourceId: string): Promise<BookCandidate | null>
  /** Every Edition of a Book the Source knows about. */
  getEditions(sourceId: string): Promise<BookCandidateEdition[]>
  /** The full record for one Author, or `null` when the Source has no such Author. */
  getAuthor(sourceId: string): Promise<AuthorRecord | null>
  /** Optional and unused in v1: a bulk import if live search outgrows a Source's rate limit. */
  importBulk?(stream: AsyncIterable<Uint8Array>): Promise<{ imported: number }>
}
