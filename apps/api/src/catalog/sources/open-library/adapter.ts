import { type BookSearchPage, toIsbn13 } from '@reprint/shared'
import { type SourceAdapter, SourceError } from '../types.js'
import { SOURCE_NAME, searchResponseSchema, toBookCandidate } from './search.js'

export const OPEN_LIBRARY_URL = 'https://openlibrary.org'
export const SEARCH_PAGE_SIZE = 10

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

export function createOpenLibraryAdapter(options: OpenLibraryOptions): SourceAdapter {
  const baseUrl = options.baseUrl ?? OPEN_LIBRARY_URL

  async function getJson(path: string): Promise<unknown> {
    let response: Response
    try {
      response = await options.fetch(`${baseUrl}${path}`, {
        headers: { Accept: 'application/json' },
      })
    } catch (error) {
      throw new SourceError('Open Library could not be reached', error)
    }
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

    // The record and Author translations arrive in M3-T06; until then the adapter has none to return.
    async getBook() {
      return null
    },
    async getEditions() {
      return []
    },
    async getAuthor() {
      return null
    },
  }
}
