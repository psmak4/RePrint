import { type BookCandidateEdition, type BookSearchPage, toIsbn13 } from '@reprint/shared'
import { z } from 'zod'
import { type SourceAdapter, SourceError } from '../types.js'
import {
  editionsResponseSchema,
  type SeriesText,
  toAuthorRecord,
  toEditions,
  toFullBook,
  workSchema,
} from './record.js'
import { SOURCE_NAME, searchResponseSchema, toBookCandidate } from './search.js'

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
  const params = new URLSearchParams({ q: `key:/works/${workId}`, limit: '1' })
  return `/search.json?${params.toString()}`
}

const workPath = (workId: string) => `/works/${workId}.json`
const editionsPath = (workId: string) => `/works/${workId}/editions.json?limit=${EDITIONS_LIMIT}`
const authorPath = (authorId: string) => `/authors/${authorId}.json`

/** An ID that could be a path segment only when it is a bare Open Library ID, never a path or a query. */
const workIdSchema = z.string().regex(/^OL\d+W$/)
const authorIdSchema = z.string().regex(/^OL\d+A$/)

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
      const candidate = toFullBook(
        work.data,
        doc.success ? doc.data.docs[0] : undefined,
        editions.editions,
        editions.series,
        editions.total,
      )
      if ('error' in candidate) {
        options.onInvalid?.('Skipped an invalid Book record', {
          reason: candidate.error,
          sourceId: workId.data,
        })
        return null
      }
      return { ...candidate, sourceLink: { ...candidate.sourceLink, sourceId: workId.data } }
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
  }

  async function readEditions(
    workId: string,
  ): Promise<{ editions: BookCandidateEdition[]; series: SeriesText[]; total: number | null }> {
    const body = editionsResponseSchema.safeParse(await getJson(editionsPath(workId)))
    if (!body.success) return { editions: [], series: [], total: null }
    const read = toEditions(body.data.entries, (reason) =>
      options.onInvalid?.('Skipped an invalid Edition record', { reason, sourceId: workId }),
    )
    return { ...read, total: body.data.size ?? null }
  }
}
