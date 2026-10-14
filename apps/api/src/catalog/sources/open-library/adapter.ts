import {
  type BookCandidateEdition,
  type BookSearchPage,
  type SourceRating,
  toIsbn13,
} from '@reprint/shared'
import { z } from 'zod'
import { type AuthorBook, type SeriesMembers, type SourceAdapter, SourceError } from '../types.js'
import { AUTHOR_WORKS_PAGE_SIZE, authorWorksPath } from './author-works.js'
import { BYLINE_FIELDS, RATINGS_BATCH_SIZE, ratingsSearchPath, toSourceRating } from './ratings.js'
import {
  editionsResponseSchema,
  type SeriesText,
  toAuthorRecord,
  toEditions,
  toFullBook,
  workSchema,
} from './record.js'
import { SOURCE_NAME, searchResponseSchema, toBookCandidate } from './search.js'
import { SERIES_PAGE_SIZE, seriesMembersPath, toPosition } from './series.js'

export const OPEN_LIBRARY_URL = 'https://openlibrary.org'
export const SEARCH_PAGE_SIZE = 10
/** The most Editions read for a Book; a popular work has hundreds and RePrint keeps the first page. */
export const EDITIONS_LIMIT = 50

export interface OpenLibraryOptions {
  /** Performs the HTTP request; live mode adds the User-Agent and a timeout, fixtures mode replays files. */
  fetch: typeof fetch
  baseUrl?: string
  /** Called for each record that is skipped because it is invalid. */
  onInvalid?: (message: string, context: Record<string, unknown>) => void
}

/** The request path for a search: `q`, then `limit`, then `page` from the second page on. */
export function searchPath(query: string, page: number): string {
  const params = new URLSearchParams()
  const isbn13 = toIsbn13(query.replace(/[\s-]/g, ''))
  params.set('q', isbn13 ? `isbn:${isbn13}` : query.trim())
  params.set('limit', String(SEARCH_PAGE_SIZE))
  if (page > 1) params.set('page', String(page))
  return `/search.json?${params.toString()}`
}

/** The request path for a Book's byline: a search on its own key, which names the Authors. */
export function bylinePath(workId: string): string {
  const params = new URLSearchParams({
    q: `key:/works/${workId}`,
    fields: BYLINE_FIELDS,
    limit: '1',
  })
  return `/search.json?${params.toString()}`
}

const workPath = (workId: string) => `/works/${workId}.json`
const editionsPath = (workId: string) => `/works/${workId}/editions.json?limit=${EDITIONS_LIMIT}`
const authorPath = (authorId: string) => `/authors/${authorId}.json`
const editionPath = (editionId: string) => `/books/${editionId}.json`

/** An ID that could be a path segment only when it is a bare Open Library ID, never a path or a query. */
const workIdSchema = z.string().regex(/^OL\d+W$/)
const authorIdSchema = z.string().regex(/^OL\d+A$/)
const editionIdSchema = z.string().regex(/^OL\d+M$/)
const seriesIdSchema = z.string().regex(/^OL\d+L$/)
/** The search result's pointer to the Edition the work's Cover comes from. */
const coverEditionKeySchema = z.object({ cover_edition_key: z.string().optional() })
/** The part of a Series member's search result the adapter reads (D-199). */
const memberDocSchema = z.object({
  key: z.string().regex(/^\/works\/OL\d+W$/),
  title: z.string(),
  series_key: z.array(z.string()).optional(),
  series_name: z.array(z.string()).optional(),
  series_position: z.array(z.string()).optional(),
})
/** The key of a ratings search result (D-204). */
const ratingKeySchema = z.object({ key: z.string().regex(/^\/works\/OL\d+W$/) })
/** The part of an Author's work search result the adapter reads (D-203). */
const workDocSchema = z.object({
  key: z.string().regex(/^\/works\/OL\d+W$/),
  title: z.string(),
  author_key: z.array(z.string()).optional(),
  edition_count: z.number().int().min(0).optional(),
})

export function createOpenLibraryAdapter(options: OpenLibraryOptions): SourceAdapter {
  const baseUrl = options.baseUrl ?? OPEN_LIBRARY_URL

  /** The parsed body, or `undefined` when the Source has no such record (HTTP 404). */
  async function getJson(path: string): Promise<unknown> {
    let response: Response
    try {
      response = await options.fetch(`${baseUrl}${path}`, {
        headers: { Accept: 'application/json' },
      })
    } catch (error) {
      throw new SourceError('Open Library could not be reached', error)
    }
    if (response.status === 404) return undefined
    if (!response.ok) throw new SourceError(`Open Library answered HTTP ${response.status}`)
    try {
      return await response.json()
    } catch (error) {
      throw new SourceError('Open Library returned a body that is not JSON', error)
    }
  }

  return {
    name: SOURCE_NAME,
    storagePolicy: 'store',
    trustedFields: {
      title: 1,
      subtitle: 1,
      description: 1,
      firstPublishedYear: 1,
      cover: 1,
      contributions: 1,
      series: 1,
      subjects: 1,
      editions: 1,
      authorBio: 1,
      authorPhoto: 1,
    },

    async searchBooks(query, page): Promise<BookSearchPage> {
      if (!query.trim()) return { candidates: [], page, hasMore: false }
      const isbnSearch = toIsbn13(query.replace(/[\s-]/g, '')) !== null
      const body = searchResponseSchema.safeParse(await getJson(searchPath(query, page)))
      if (!body.success)
        throw new SourceError('Open Library returned an unexpected search response')

      const candidates: BookSearchPage['candidates'] = []
      for (const raw of body.data.docs) {
        const candidate = toBookCandidate(raw, query, isbnSearch)
        if ('error' in candidate) {
          options.onInvalid?.('Skipped an invalid search result', { reason: candidate.error })
        } else {
          candidates.push(candidate)
        }
      }
      return {
        candidates,
        page,
        hasMore: (page - 1) * SEARCH_PAGE_SIZE + body.data.docs.length < body.data.numFound,
      }
    },

    async getBook(sourceId) {
      const workId = workIdSchema.safeParse(sourceId)
      if (!workId.success) return null
      const body = await getJson(workPath(workId.data))
      if (body === undefined) return null
      const work = workSchema.safeParse(body)
      if (!work.success) {
        // A redirected or malformed record is reported and treated as absent.
        options.onInvalid?.('Skipped an invalid Book record', {
          reason: z.prettifyError(work.error),
          sourceId: workId.data,
        })
        return null
      }
      const [byline, editions] = await Promise.all([
        getJson(bylinePath(workId.data)),
        readEditions(workId.data),
      ])
      const doc = searchResponseSchema.safeParse(byline)
      const bylineDoc = doc.success ? doc.data.docs[0] : undefined
      const coverKey = coverEditionKeySchema.safeParse(bylineDoc)
      const coverEdition = await readCoverEdition(
        coverKey.success ? coverKey.data.cover_edition_key : undefined,
        editions.editions,
      )
      const candidate = toFullBook(
        work.data,
        bylineDoc,
        [...editions.editions, ...coverEdition.editions],
        [...editions.series, ...coverEdition.series],
        editions.total,
      )
      if ('error' in candidate) {
        options.onInvalid?.('Skipped an invalid Book record', {
          reason: candidate.error,
          sourceId: workId.data,
        })
        return null
      }
      return {
        ...candidate,
        book: {
          ...candidate.book,
          // The list is whole when the Series records or the Editions behind Series text were read.
          seriesReported:
            editions.read || candidate.book.series.some((entry) => entry.sourceLink !== undefined),
        },
        sourceLink: { ...candidate.sourceLink, sourceId: workId.data },
      }
    },

    async getEditions(sourceId) {
      const workId = workIdSchema.safeParse(sourceId)
      if (!workId.success) return []
      return (await readEditions(workId.data)).editions
    },

    async getAuthor(sourceId) {
      const authorId = authorIdSchema.safeParse(sourceId)
      if (!authorId.success) return null
      const body = await getJson(authorPath(authorId.data))
      if (body === undefined) return null
      const author = toAuthorRecord(body)
      if ('error' in author) {
        options.onInvalid?.('Skipped an invalid Author record', {
          reason: author.error,
          sourceId: authorId.data,
        })
        return null
      }
      return author
    },

    async getSeriesMembers(sourceId): Promise<SeriesMembers | null> {
      const id = seriesIdSchema.safeParse(sourceId)
      if (!id.success) return null
      const members: SeriesMembers['members'] = []
      let name: string | null = null
      for (let page = 1; ; page += 1) {
        const raw = await getJson(seriesMembersPath(id.data, page))
        // No first page means no such Series; a later page missing or unreadable would cut the
        // list short, so the whole read fails and the sync tries again (D-199).
        if (raw === undefined && page === 1) return null
        const body = searchResponseSchema.safeParse(raw)
        if (!body.success) {
          throw new SourceError(`Open Library returned an unreadable page ${page} of a Series`)
        }
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
        const lastPage =
          body.data.docs.length < SERIES_PAGE_SIZE || page * SERIES_PAGE_SIZE >= body.data.numFound
        if (lastPage) break
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

    async getAuthorBooks(sourceId): Promise<AuthorBook[]> {
      const id = authorIdSchema.safeParse(sourceId)
      if (!id.success) return []
      const works: AuthorBook[] = []
      for (let page = 1; ; page += 1) {
        const raw = await getJson(authorWorksPath(id.data, page))
        // No first page means no works; a later page missing or unreadable would cut the list
        // short, so the whole read fails and the sync tries again (D-203).
        if (raw === undefined && page === 1) return []
        const body = searchResponseSchema.safeParse(raw)
        if (!body.success) {
          throw new SourceError(
            `Open Library returned an unreadable page ${page} of an Author's works`,
          )
        }
        for (const item of body.data.docs) {
          const doc = workDocSchema.safeParse(item)
          if (!doc.success) continue
          // Written by them (listed first), with at least one Edition (D-203).
          const editionCount = doc.data.edition_count ?? 0
          if (doc.data.author_key?.[0] !== id.data || editionCount < 1) continue
          works.push({
            sourceId: doc.data.key.replace('/works/', ''),
            title: doc.data.title,
            editionCount,
          })
        }
        const lastPage =
          body.data.docs.length < AUTHOR_WORKS_PAGE_SIZE ||
          page * AUTHOR_WORKS_PAGE_SIZE >= body.data.numFound
        if (lastPage) break
      }
      return works
    },

    async getBookRatings(sourceIds): Promise<Map<string, SourceRating | null>> {
      const ids = sourceIds.filter((id) => workIdSchema.safeParse(id).success)
      const found = new Map<string, SourceRating | null>()
      for (let start = 0; start < ids.length; start += RATINGS_BATCH_SIZE) {
        const body = searchResponseSchema.safeParse(
          await getJson(ratingsSearchPath(ids.slice(start, start + RATINGS_BATCH_SIZE))),
        )
        if (!body.success) {
          throw new SourceError('Open Library returned an unreadable ratings search')
        }
        for (const doc of body.data.docs) {
          const key = ratingKeySchema.safeParse(doc)
          if (key.success) found.set(key.data.key.replace('/works/', ''), toSourceRating(doc))
        }
      }
      return found
    },
  }

  /**
   * The Edition the work's Cover comes from, when the first page of Editions does not have it, so the
   * Primary Edition can match the Book's Cover (D-192, D-197). One extra request, only then; if it
   * fails, the Book is read without it.
   */
  async function readCoverEdition(
    editionId: string | undefined,
    read: BookCandidateEdition[],
  ): Promise<{ editions: BookCandidateEdition[]; series: SeriesText[] }> {
    const id = editionIdSchema.safeParse(editionId)
    if (!id.success || read.some((edition) => edition.sourceLink?.sourceId === id.data)) {
      return { editions: [], series: [] }
    }
    let body: unknown
    try {
      body = await getJson(editionPath(id.data))
    } catch (error) {
      // An extra the Book does not need: without it the Primary Edition falls back to the usual order.
      if (error instanceof SourceError) return { editions: [], series: [] }
      throw error
    }
    if (body === undefined) return { editions: [], series: [] }
    return toEditions([body], (reason) =>
      options.onInvalid?.('Skipped an invalid Edition record', { reason, sourceId: id.data }),
    )
  }

  async function readEditions(workId: string): Promise<{
    editions: BookCandidateEdition[]
    series: SeriesText[]
    total: number | null
    read: boolean
  }> {
    const body = editionsResponseSchema.safeParse(await getJson(editionsPath(workId)))
    if (!body.success) return { editions: [], series: [], total: null, read: false }
    const parsed = toEditions(body.data.entries, (reason) =>
      options.onInvalid?.('Skipped an invalid Edition record', { reason, sourceId: workId }),
    )
    return { ...parsed, total: body.data.size ?? null, read: true }
  }
}
