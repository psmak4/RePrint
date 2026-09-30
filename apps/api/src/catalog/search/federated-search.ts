import { createHash } from 'node:crypto'
import { type Database, editions, sourceLinks } from '@reprint/db'
import {
  type BookCandidate,
  type BookSearchPage,
  type BookSummary,
  bookSearchPageSchema,
  SEARCH_MIN_LENGTH,
  SEARCH_PAGE_SIZE,
  type SearchResponse,
  type SearchResultItem,
  toIsbn13,
} from '@reprint/shared'
import { and, eq, inArray } from 'drizzle-orm'
import type { Redis } from 'ioredis'
import { loadBookSummaries } from '../../modules/catalog/read.js'
import type { CandidateRefs } from '../candidate-refs.js'
import type { InteractiveCall } from '../resolve.js'
import type { SourceAdapter } from '../sources/types.js'
import { searchCatalogBooks, searchTokens } from './catalog-search.js'

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

function candidateHasIsbn(candidate: BookCandidate, isbn: string | null): boolean {
  return isbn !== null && candidate.editions.some((edition) => edition.isbn13 === isbn)
}

const EMPTY = (page: number): SearchResponse => ({
  items: [],
  page,
  pageSize: SEARCH_PAGE_SIZE,
  hasMore: false,
  sourceUnavailable: false,
})

/**
 * Federated Book search (PRD §6 "How search works", D-105). Page 1 runs the Catalog query and the
 * Source search side by side; candidates that are already stored are shown as the stored Book, the
 * rest as "not yet on RePrint" with an opaque reference. Later pages show the Source's matching page,
 * minus Books already on page 1.
 */
export async function federatedSearch(
  deps: FederatedSearchDeps,
  input: { q: string; page: number },
): Promise<SearchResponse> {
  const { db, source, candidateRefs } = deps
  const { q, page } = input
  if (q.trim().length < SEARCH_MIN_LENGTH || searchTokens(q).length === 0) return EMPTY(page)
  const isbn = toIsbn13(q)

  const [catalogHits, page1Hits, sourceResult] = await Promise.all([
    page === 1 ? searchCatalogBooks(db, { q, limit: SEARCH_PAGE_SIZE }) : Promise.resolve([]),
    // Later pages must not repeat what page 1 showed from the Catalog.
    page > 1 ? searchCatalogBooks(db, { q, limit: SEARCH_PAGE_SIZE }) : Promise.resolve([]),
    sourcePage(deps, q, page),
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
  const [summaries, isbnRows] = await Promise.all([
    loadBookSummaries(db, storedIds),
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
    ranked.push({
      // Catalog Books get a relevance boost from their review count (PRD §6).
      score: entry.score + REVIEW_BOOST * Math.log1p(summary.rating.count),
      isbnMatch: entry.isbnMatch,
      order: ranked.length,
      item: async () => ({ kind: 'book', book: summary }),
    })
  }
  const seenSourceIds = new Set<string>()
  for (const candidate of candidates) {
    if (matched.has(candidate) || seenSourceIds.has(candidate.sourceLink.sourceId)) continue
    seenSourceIds.add(candidate.sourceLink.sourceId)
    ranked.push({
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
  ranked.sort(
    (a, b) => Number(b.isbnMatch) - Number(a.isbnMatch) || b.score - a.score || a.order - b.order,
  )
  const shown = ranked.slice(0, SEARCH_PAGE_SIZE)
  // References are issued only for what is shown, so cut-off candidates cost no Redis writes.
  const items = await Promise.all(shown.map((entry) => entry.item()))
  return {
    items,
    page,
    pageSize: SEARCH_PAGE_SIZE,
    hasMore: ranked.length > SEARCH_PAGE_SIZE || (sourceResult?.hasMore ?? false),
    sourceUnavailable: sourceResult === null,
  }
}
