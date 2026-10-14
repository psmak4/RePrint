import {
  authorDetailQuerySchema,
  authorDetailSchema,
  bookDetailSchema,
  bookEditionsResponseSchema,
  bookRelatedResponseSchema,
  GENRE_PAGE_SIZE,
  genreBooksQuerySchema,
  genreDetailResponseSchema,
  genreTreeResponseSchema,
  searchQuerySchema,
  searchResponseSchema,
  searchSuggestQuerySchema,
  searchSuggestResponseSchema,
  seriesDetailQuerySchema,
  seriesDetailResponseSchema,
  slugParamsSchema,
} from '@reprint/shared'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { Redis } from 'ioredis'
import { authorDueForSync, queueAuthorSync } from '../../catalog/author-sync.js'
import type { CandidateRefs } from '../../catalog/candidate-refs.js'
import { isStale } from '../../catalog/refresh.js'
import type { InteractiveCall } from '../../catalog/resolve.js'
import { searchCatalogAuthors, searchCatalogBooks } from '../../catalog/search/catalog-search.js'
import { federatedSearch } from '../../catalog/search/federated-search.js'
import { queueSeriesSyncs, seriesDueForBook } from '../../catalog/series-sync.js'
import type { SourceAdapter } from '../../catalog/sources/types.js'
import { HttpProblem } from '../../errors.js'
import type { AuthRoutesOptions } from '../auth/register.js'
import { cachedSiteMean } from '../discover/cache.js'
import { addViewerShelves } from '../library/viewer-shelf.js'
import { findGenreBySlug, loadGenreBooks, loadGenreLinks, loadGenreTree } from './genres.js'
import { publicCacheHook } from './public-cache.js'
import {
  findAuthorBySlug,
  findBookBySlug,
  loadAuthorDetail,
  loadAuthorSuggestions,
  loadBookDetail,
  loadBookSummaries,
  loadEditions,
} from './read.js'
import { loadBookRelated } from './related.js'
import { findSeriesBySlug, isAdding, loadSeriesEntries } from './series.js'

/** Refresh jobs run behind everything else. */
const REFRESH_PRIORITY = 10
/** How many of each the search box's dropdown shows. */
const SUGGESTED_BOOKS = 5
const SUGGESTED_AUTHORS = 3

export interface CatalogRoutesOptions extends AuthRoutesOptions {
  /** Missing only when the spec is generated; `GET /search` then answers Catalog results alone. */
  catalog?: {
    source: SourceAdapter
    call: InteractiveCall
    candidateRefs: CandidateRefs
    recordCache?: (hit: boolean) => Promise<void>
  }
  redis?: Redis
}

export const catalogRoutes: FastifyPluginAsyncZod<CatalogRoutesOptions> = async (app, options) => {
  const { db, jobs, catalog, redis } = options

  // Every route here is a public GET, so the whole plugin shares one caching rule (PRD §10).
  app.addHook('onSend', publicCacheHook)

  // Suggestions come from the Catalog alone, so keystrokes never reach a Source (PRD §6).
  app.get(
    '/search/suggest',
    {
      schema: {
        querystring: searchSuggestQuerySchema,
        response: { 200: searchSuggestResponseSchema },
      },
    },
    async (request) => {
      if (!db) throw new Error('catalog routes need a database')
      const { q } = request.query
      const [bookHits, authorHits] = await Promise.all([
        searchCatalogBooks(db, { q, limit: SUGGESTED_BOOKS }),
        searchCatalogAuthors(db, { q, limit: SUGGESTED_AUTHORS }),
      ])
      const [books, authors] = await Promise.all([
        loadBookSummaries(
          db,
          bookHits.map((hit) => hit.id),
        ),
        loadAuthorSuggestions(
          db,
          authorHits.map((hit) => hit.id),
        ),
      ])
      return { books, authors }
    },
  )

  // Catalog and Source results together; the Source part is best effort (PRD §6).
  app.get(
    '/search',
    { schema: { querystring: searchQuerySchema, response: { 200: searchResponseSchema } } },
    async (request) => {
      if (!db || !catalog || !redis) throw new Error('search needs a database, Redis, and a Source')
      const result = await federatedSearch(
        {
          db,
          redis,
          source: catalog.source,
          call: catalog.call,
          candidateRefs: catalog.candidateRefs,
          sourceTimeoutMs: options.env.SOURCE_SEARCH_TIMEOUT_MS,
          recordCache: catalog.recordCache,
          onError: (error) => request.log.warn({ err: error }, 'Source search failed'),
        },
        request.query,
      )
      await addViewerShelves(
        db,
        request,
        result.items.flatMap((item) => (item.kind === 'book' ? [item.book] : [])),
      )
      return result
    },
  )

  app.get(
    '/books/:slug',
    { schema: { params: slugParamsSchema, response: { 200: bookDetailSchema } } },
    async (request) => {
      if (!db) throw new Error('catalog routes need a database')
      const book = await findBookBySlug(db, request.params.slug)
      if (!book) throw new HttpProblem(404, 'We could not find that book.')
      // Queueing the stale refresh and due Series syncs never fails or slows the page: they run
      // beside the detail load (M10-T11).
      const queueRefresh = async () => {
        if (!isStale(book.refreshedAt)) return
        // One job per Book per day.
        const day = new Date().toISOString().slice(0, 10)
        await jobs
          ?.enqueue(
            'catalog.refresh',
            { bookId: book.id },
            {
              jobId: `catalog.refresh-${book.id}-${day}`,
              priority: REFRESH_PRIORITY,
            },
          )
          .catch((error: unknown) =>
            request.log.warn({ err: error, bookId: book.id }, 'could not queue book refresh'),
          )
      }
      // A Book stored before its Series was synced fills it in on view (D-199).
      const queueSeries = async () => {
        if (!jobs) return
        await seriesDueForBook(db, book.id)
          .then((due) => queueSeriesSyncs(jobs, due))
          .catch((error: unknown) =>
            request.log.warn({ err: error, bookId: book.id }, 'could not queue Series syncs'),
          )
      }
      const [detail] = await Promise.all([loadBookDetail(db, book), queueRefresh(), queueSeries()])
      await addViewerShelves(db, request, [detail])
      return detail
    },
  )

  // Everything the Book page shows around a Book, from the slug alone, so the page asks for it
  // beside the Book. It never queues an Author's bibliography import (D-205, M10-T06).
  app.get(
    '/books/:slug/related',
    { schema: { params: slugParamsSchema, response: { 200: bookRelatedResponseSchema } } },
    async (request) => {
      if (!db) throw new Error('catalog routes need a database')
      const book = await findBookBySlug(db, request.params.slug)
      if (!book) throw new HttpProblem(404, 'We could not find that book.')
      return loadBookRelated(db, book, () => cachedSiteMean(db, redis))
    },
  )

  app.get(
    '/books/:slug/editions',
    { schema: { params: slugParamsSchema, response: { 200: bookEditionsResponseSchema } } },
    async (request) => {
      if (!db) throw new Error('catalog routes need a database')
      const book = await findBookBySlug(db, request.params.slug)
      if (!book) throw new HttpProblem(404, 'We could not find that book.')
      return { items: await loadEditions(db, book.id) }
    },
  )

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
        // Viewing an Author someone reached imports the rest of their Books (D-203); it never
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

  app.get('/genres', { schema: { response: { 200: genreTreeResponseSchema } } }, async () => {
    if (!db) throw new Error('catalog routes need a database')
    return { items: await loadGenreTree(db) }
  })

  app.get(
    '/genres/:slug',
    {
      schema: {
        params: slugParamsSchema,
        querystring: genreBooksQuerySchema,
        response: { 200: genreDetailResponseSchema },
      },
    },
    async (request) => {
      if (!db) throw new Error('catalog routes need a database')
      const genre = await findGenreBySlug(db, request.params.slug)
      if (!genre) throw new HttpProblem(404, 'We could not find that genre.')
      const { sort, page } = request.query
      const [links, books] = await Promise.all([
        loadGenreLinks(db, genre),
        loadGenreBooks(db, genre, { sort, page, siteMean: () => cachedSiteMean(db, redis) }),
      ])
      return {
        genre: { slug: genre.slug, name: genre.name, description: genre.description },
        ...links,
        ...books,
        page,
        pageSize: GENRE_PAGE_SIZE,
      }
    },
  )

  app.get(
    '/series/:slug',
    {
      schema: {
        params: slugParamsSchema,
        querystring: seriesDetailQuerySchema,
        response: { 200: seriesDetailResponseSchema },
      },
    },
    async (request) => {
      if (!db) throw new Error('catalog routes need a database')
      const found = await findSeriesBySlug(db, request.params.slug)
      if (!found) throw new HttpProblem(404, 'We could not find that series.')
      const { items, total } = await loadSeriesEntries(db, found, request.query.around)
      await addViewerShelves(
        db,
        request,
        items.map((item) => item.book),
      )
      return {
        series: {
          slug: found.slug,
          name: found.name,
          description: found.description,
          memberCount: found.sourceMemberCount,
          adding: isAdding(found, total),
        },
        items,
        total,
      }
    },
  )
}
