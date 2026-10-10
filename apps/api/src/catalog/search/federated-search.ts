import { createHash } from 'node:crypto'
import { type Database, editions, sourceLinks } from '@reprint/db'
import {
  type BookCandidate,
  type BookSearchPage,
  type BookSummary,
  bookSearchPageSchema,
  type IsbnMatch,
  SEARCH_MIN_LENGTH,
  SEARCH_PAGE_SIZE,
  type SearchQuery,
  type SearchResponse,
  type SearchResultItem,
  toIsbn13,
} from '@reprint/shared'
import { and, eq, inArray } from 'drizzle-orm'
import type { Redis } from 'ioredis'
import { loadAuthorSuggestions, loadBookSummaries } from '../../modules/catalog/read.js'
import { loadTopReviews } from '../../modules/reviews/excerpts.js'
import type { CandidateRefs } from '../candidate-refs.js'
import type { InteractiveCall } from '../resolve.js'
import type { SourceAdapter } from '../sources/types.js'
import { searchCatalogAuthors, searchCatalogBooks, searchTokens } from './catalog-search.js'

/** Source search pages stay in Redis this long (PRD §6). */
export const SOURCE_SEARCH_CACHE_TTL_SECONDS = 24 * 60 * 60
/** Each review adds this much times the natural log of (1 + count) to a Book's score (D-105). */
const REVIEW_BOOST = 0.1

export interface FederatedSearchDeps {
  db: Database
  redis: Redis
  source: SourceAdapter
  call: InteractiveCall
  candidateRefs: CandidateRefs
  /** How long the Source has to answer before Catalog results are shown alone (PRD §6). */
  sourceTimeoutMs: number
  /** Counts a Source-cache hit or miss for the headroom dashboard. */
  recordCache?: (hit: boolean) => Promise<void>
  onError?: (error: unknown) => void
}

interface Ranked {
  score: number
  isbnMatch: boolean
  /** What the sorts other than relevance order by; a candidate has no reviews (PRD §7.3). */
  reviews: number
  average: number | null
  year: number | null
  /** Sort key for ties: earlier is better. */
  order: number
  item: () => Promise<SearchResultItem>
}

/** The same query typed differently ("  Dune!" and "dune") shares one cache entry. */
export function sourceSearchCacheKey(q: string, page: number): string {
  const normalized = searchTokens(q).join(' ')
  return `catalog:source-search:${createHash('sha1').update(normalized).digest('hex')}:${page}`
}

/**
 * The Source's page of results for `q`, from Redis when cached. Returns `null` when the Source is
 * slow (no answer within `sourceTimeoutMs`), down, or its breaker is open; an answer that arrives
 * late is still cached for the next search.
 */
async function sourcePage(
  deps: FederatedSearchDeps,
  q: string,
  page: number,
): Promise<BookSearchPage | null> {
  const { redis, source, call, sourceTimeoutMs } = deps
  const key = sourceSearchCacheKey(q, page)
  const cached = await redis.get(key).catch(() => null)
  if (cached) {
    const parsed = bookSearchPageSchema.safeParse(JSON.parse(cached))
    if (parsed.success) {
      await deps.recordCache?.(true).catch(() => {})
      return parsed.data
    }
  }
  await deps.recordCache?.(false).catch(() => {})
  const fetching = call(() => source.searchBooks(q, page), sourceTimeoutMs).then(async (result) => {
    await redis.set(key, JSON.stringify(result), 'EX', SOURCE_SEARCH_CACHE_TTL_SECONDS)
    return result
  })
  const settled = fetching.catch((error: unknown) => {
    deps.onError?.(error)
    return null
  })
  let timer: NodeJS.Timeout | undefined
  const tooSlow = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), sourceTimeoutMs)
  })
  try {
    return await Promise.race([settled, tooSlow])
  } finally {
    clearTimeout(timer)
  }
}

/** Stored Books that these candidates are: the same Source link, or a shared ISBN-13 (PRD §5.4). */
async function matchStoredBooks(
  db: Database,
  source: SourceAdapter,
  candidates: BookCandidate[],
): Promise<Map<BookCandidate, string>> {
  const matched = new Map<BookCandidate, string>()
  if (candidates.length === 0) return matched
  const links = await db
    .select({ sourceId: sourceLinks.sourceId, bookId: sourceLinks.entityId })
    .from(sourceLinks)
    .where(
      and(
        eq(sourceLinks.entityType, 'book'),
        eq(sourceLinks.source, source.name),
        inArray(
          sourceLinks.sourceId,
          candidates.map((candidate) => candidate.sourceLink.sourceId),
        ),
      ),
    )
  const bySourceId = new Map(links.map((link) => [link.sourceId, link.bookId]))
  const isbns = candidates.flatMap((candidate) =>
    candidate.editions.flatMap((edition) => (edition.isbn13 ? [edition.isbn13] : [])),
  )
  const isbnRows =
    isbns.length === 0
      ? []
      : await db
          .select({ isbn13: editions.isbn13, bookId: editions.bookId })
          .from(editions)
          .where(inArray(editions.isbn13, isbns))
          .orderBy(editions.bookId)
  const byIsbn = new Map<string, string>()
  for (const row of isbnRows)
    if (row.isbn13 && !byIsbn.has(row.isbn13)) byIsbn.set(row.isbn13, row.bookId)
  for (const candidate of candidates) {
    const isbnBook = candidate.editions
      .map((edition) => (edition.isbn13 ? byIsbn.get(edition.isbn13) : undefined))
      .find((id) => id !== undefined)
    const bookId = bySourceId.get(candidate.sourceLink.sourceId) ?? isbnBook
    if (bookId) matched.set(candidate, bookId)
  }
  return matched
}

function inDecade(year: number | null, decade: number): boolean {
  return year !== null && year >= decade && year < decade + 10
}

function isbnMatchOf(item: SearchResultItem | undefined): IsbnMatch | null {
  if (item?.kind === 'book') return { kind: 'book', slug: item.book.slug }
  if (item?.kind === 'candidate') return { kind: 'candidate', ref: item.candidate.ref }
  return null
}

function candidateHasIsbn(candidate: BookCandidate, isbn: string | null): boolean {
  return isbn !== null && candidate.editions.some((edition) => edition.isbn13 === isbn)
}

const EMPTY = (page: number): SearchResponse => ({
  items: [],
  isbnMatch: null,
  page,
  pageSize: SEARCH_PAGE_SIZE,
  hasMore: false,
  sourceUnavailable: false,
})

/** Nulls sort last whichever way the values run. */
function byNumber(a: number | null, b: number | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return b - a
}

/** An exact ISBN match goes first; then the chosen sort; then relevance, then arrival order. */
function compareRanked(sort: SearchQuery['sort']) {
  return (a: Ranked, b: Ranked): number => {
    let byKey = 0
    if (sort === 'most_reviewed') byKey = b.reviews - a.reviews
    else if (sort === 'highest_rated')
      byKey = byNumber(a.average, b.average) || b.reviews - a.reviews
    else if (sort === 'newest') byKey = byNumber(a.year, b.year)
    return (
      Number(b.isbnMatch) - Number(a.isbnMatch) || byKey || b.score - a.score || a.order - b.order
    )
  }
}

/** Authors whose name matches the query: Catalog only, paged by offset (PRD §7.3). */
async function authorSearch(db: Database, q: string, page: number): Promise<SearchResponse> {
  const hits = await searchCatalogAuthors(db, {
    q,
    limit: SEARCH_PAGE_SIZE + 1,
    offset: (page - 1) * SEARCH_PAGE_SIZE,
  })
  const shown = await loadAuthorSuggestions(
    db,
    hits.slice(0, SEARCH_PAGE_SIZE).map((hit) => hit.id),
  )
  return {
    items: shown.map((author) => ({ kind: 'author', author })),
    isbnMatch: null,
    page,
    pageSize: SEARCH_PAGE_SIZE,
    hasMore: hits.length > SEARCH_PAGE_SIZE,
    sourceUnavailable: false,
  }
}

/**
 * Federated Book search (PRD §6 "How search works", D-105). Page 1 runs the Catalog query and the
 * Source search side by side; candidates that are already stored are shown as the stored Book, the
 * rest as "not yet on RePrint" with an opaque reference. Later pages show the Source's matching page,
 * minus Books already on page 1.
 */
export async function federatedSearch(
  deps: FederatedSearchDeps,
  input: Pick<SearchQuery, 'q' | 'page'> & Partial<SearchQuery>,
): Promise<SearchResponse> {
  const { db, source, candidateRefs } = deps
  const { q, page, genre, language, decade, minRating, sort = 'relevance' } = input
  if (q.trim().length < SEARCH_MIN_LENGTH || searchTokens(q).length === 0) return EMPTY(page)
  if (input.type === 'authors') return authorSearch(db, q, page)
  const isbn = toIsbn13(q)
  const filters = { genre, language, decade, minRating }
  // Genres and ratings exist only in the Catalog, so choosing one leaves the Source out (PRD §7.3).
  const catalogOnly = genre !== undefined || language !== undefined || minRating !== undefined

  const [catalogHits, page1Hits, sourceResult] = await Promise.all([
    page === 1 || catalogOnly
      ? searchCatalogBooks(db, {
          q,
          // One extra hit tells whether another page exists.
          limit: catalogOnly ? SEARCH_PAGE_SIZE + 1 : SEARCH_PAGE_SIZE,
          offset: catalogOnly ? (page - 1) * SEARCH_PAGE_SIZE : 0,
          filters,
          sort,
        })
      : Promise.resolve([]),
    // Later pages must not repeat what page 1 showed from the Catalog.
    page > 1 && !catalogOnly
      ? searchCatalogBooks(db, { q, limit: SEARCH_PAGE_SIZE, filters, sort })
      : Promise.resolve([]),
    catalogOnly ? Promise.resolve(null) : sourcePage(deps, q, page),
  ])
  const shownOnPage1 = new Set(page1Hits.map((hit) => hit.id))
  const candidates = sourceResult?.candidates ?? []
  const matched = await matchStoredBooks(db, source, candidates)

  // One entry per stored Book, keeping its best score.
  const stored = new Map<string, { score: number; isbnMatch: boolean }>()
  const note = (bookId: string, score: number, isbnMatch: boolean) => {
    const known = stored.get(bookId)
    stored.set(bookId, {
      score: Math.max(known?.score ?? 0, score),
      isbnMatch: isbnMatch || (known?.isbnMatch ?? false),
    })
  }
  for (const hit of catalogHits) note(hit.id, hit.score, false)
  for (const candidate of candidates) {
    const bookId = matched.get(candidate)
    if (bookId && !shownOnPage1.has(bookId)) {
      note(bookId, candidate.confidence, candidateHasIsbn(candidate, isbn))
    }
  }
  const storedIds = [...stored.keys()]
  const [summaries, topReviews, isbnRows] = await Promise.all([
    loadBookSummaries(db, storedIds),
    loadTopReviews(db, storedIds),
    isbn && storedIds.length > 0
      ? db
          .select({ bookId: editions.bookId })
          .from(editions)
          .where(and(eq(editions.isbn13, isbn), inArray(editions.bookId, storedIds)))
      : Promise.resolve([]),
  ])
  for (const row of isbnRows) note(row.bookId, 0, true)
  const summaryById = new Map<string, BookSummary>(summaries.map((s) => [s.id, s]))

  const ranked: Ranked[] = []
  for (const [bookId, entry] of stored) {
    const summary = summaryById.get(bookId)
    if (!summary) continue
    // Candidates are not filtered in SQL, so a stored match is checked here.
    if (decade !== undefined && !inDecade(summary.firstPublishedYear, decade)) continue
    ranked.push({
      reviews: summary.rating.count,
      average: summary.rating.average,
      year: summary.firstPublishedYear,
      // Catalog Books get a relevance boost from their review count (PRD §6).
      score: entry.score + REVIEW_BOOST * Math.log1p(summary.rating.count),
      isbnMatch: entry.isbnMatch,
      order: ranked.length,
      item: async () => ({
        kind: 'book',
        book: summary,
        topReview: topReviews.get(summary.id) ?? null,
      }),
    })
  }
  const seenSourceIds = new Set<string>()
  for (const candidate of candidates) {
    if (matched.has(candidate) || seenSourceIds.has(candidate.sourceLink.sourceId)) continue
    seenSourceIds.add(candidate.sourceLink.sourceId)
    if (decade !== undefined && !inDecade(candidate.book.firstPublishedYear, decade)) continue
    ranked.push({
      reviews: 0,
      average: null,
      year: candidate.book.firstPublishedYear,
      score: candidate.confidence,
      isbnMatch: candidateHasIsbn(candidate, isbn),
      order: ranked.length,
      item: async () => ({
        kind: 'candidate',
        candidate: {
          ref: await candidateRefs.issue(candidate),
          title: candidate.book.title,
          subtitle: candidate.book.subtitle,
          cover: candidate.book.cover,
          firstPublishedYear: candidate.book.firstPublishedYear,
          contributions: candidate.book.contributions.map(({ authorName, role }) => ({
            authorName,
            role,
          })),
        },
      }),
    })
  }
  ranked.sort(compareRanked(sort))
  const shown = ranked.slice(0, SEARCH_PAGE_SIZE)
  // References are issued only for what is shown, so cut-off candidates cost no Redis writes.
  const items = await Promise.all(shown.map((entry) => entry.item()))
  return {
    items,
    isbnMatch: page === 1 && shown[0]?.isbnMatch ? isbnMatchOf(items[0]) : null,
    page,
    pageSize: SEARCH_PAGE_SIZE,
    hasMore: ranked.length > SEARCH_PAGE_SIZE || (sourceResult?.hasMore ?? false),
    sourceUnavailable: !catalogOnly && sourceResult === null,
  }
}
