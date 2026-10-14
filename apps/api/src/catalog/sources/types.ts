import type {
  AuthorRecord,
  BookCandidate,
  BookCandidateEdition,
  BookSearchPage,
  SourceRating,
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
/** A Series as its Source lists it: every member in reading order (D-199). */
export interface SeriesMembers {
  name: string
  members: { sourceId: string; position: number | null; title: string }[]
}

/** One Book an Author wrote, from the Source's list of their Books (D-203). */
export interface AuthorBook {
  sourceId: string
  title: string
  editionCount: number
}

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
  /** Every member of a Series in reading order, or `null` when the Source has no such Series. */
  getSeriesMembers?(sourceId: string): Promise<SeriesMembers | null>
  /**
   * The Books an Author wrote (listed first) that have at least one Edition, most Editions first,
   * or `[]` when the Source lists none (D-203). Throws when a page cannot be read.
   */
  getAuthorBooks?(sourceId: string): Promise<AuthorBook[]>
  /**
   * The current reader rating for each Book asked for, by Source ID; `null` when the Source has
   * none, and Books it did not return are left out (D-204). Throws when a page cannot be read.
   */
  getBookRatings?(sourceIds: string[]): Promise<Map<string, SourceRating | null>>
  /** Optional and unused in v1: a bulk import if live search outgrows a Source's rate limit. */
  importBulk?(stream: AsyncIterable<Uint8Array>): Promise<{ imported: number }>
}
