import { authors, books, type Database, genres, series, users } from '@reprint/db'
import {
  SITEMAP_MAX_URLS,
  type SitemapChunk,
  type SitemapIndex,
  type SitemapUrl,
  sitemapChunkSchema,
  sitemapIndexSchema,
} from '@reprint/shared'
import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm'
import type { Redis } from 'ioredis'

/** Bump the version when the stored shape changes so old entries are never read. */
const KEY_PREFIX = 'sitemap:v1'
const INDEX_KEY = `${KEY_PREFIX}:index`
const chunkKey = (number: number) => `${KEY_PREFIX}:chunk:${number}`
/** The job runs nightly; the build outlives a few missed runs, then expires. */
export const SITEMAP_TTL_SECONDS = 3 * 24 * 60 * 60

interface Row {
  slug: string
  updatedAt: Date
}

const toUrls = (prefix: string, rows: Row[]): SitemapUrl[] =>
  rows.map((row) => ({
    path: `${prefix}${row.slug}`,
    lastModified: row.updatedAt.toISOString(),
  }))

/** Every public page, grouped by kind. Only pages the SEO rules leave indexable are listed (PRD §11). */
async function collectUrls(db: Database): Promise<SitemapUrl[]> {
  const [bookRows, authorRows, genreRows, seriesRows, memberRows] = await Promise.all([
    db
      .select({ slug: books.slug, updatedAt: books.updatedAt })
      .from(books)
      .orderBy(asc(books.slug)),
    db
      .select({ slug: authors.slug, updatedAt: authors.updatedAt })
      .from(authors)
      .orderBy(asc(authors.slug)),
    db
      .select({ slug: genres.slug, updatedAt: genres.updatedAt })
      .from(genres)
      .where(isNull(genres.archivedAt))
      .orderBy(asc(genres.slug)),
    db
      .select({ slug: series.slug, updatedAt: series.updatedAt })
      .from(series)
      .orderBy(asc(series.slug)),
    // Unverified Members' profiles are `noindex`, so they stay out of the sitemap.
    db
      .select({ slug: users.username, updatedAt: users.updatedAt })
      .from(users)
      .where(and(eq(users.status, 'active'), isNotNull(users.emailVerifiedAt)))
      .orderBy(asc(users.username)),
  ])
  return [
    { path: '/', lastModified: null },
    { path: '/genres', lastModified: null },
    ...toUrls('/genres/', genreRows),
    ...toUrls('/books/', bookRows),
    ...toUrls('/authors/', authorRows),
    ...toUrls('/series/', seriesRows),
    ...toUrls('/u/', memberRows),
  ]
}

/** The newest `lastModified` among the URLs, or `null` when none has one. */
function newest(urls: SitemapUrl[]): string | null {
  let latest: string | null = null
  for (const url of urls) {
    if (url.lastModified && (latest === null || url.lastModified > latest))
      latest = url.lastModified
  }
  return latest
}

/**
 * Rebuilds the sitemap: a chunk list plus chunks of at most `chunkSize` URLs, stored in Redis.
 * Chunks are written before the index, so readers never see an index that names a missing chunk,
 * and chunks left over from a longer earlier build are deleted afterwards.
 */
export async function buildSitemaps(
  db: Database,
  redis: Redis,
  options: { chunkSize?: number; now?: Date } = {},
): Promise<SitemapIndex> {
  const { chunkSize = SITEMAP_MAX_URLS, now = new Date() } = options
  const urls = await collectUrls(db)
  const previous = await loadSitemapIndex(redis)

  const chunks: SitemapChunk[] = []
  for (let start = 0; start < urls.length; start += chunkSize) {
    chunks.push({ urls: urls.slice(start, start + chunkSize) })
  }
  const index: SitemapIndex = {
    builtAt: now.toISOString(),
    chunks: chunks.map((chunk, position) => ({
      number: position + 1,
      urlCount: chunk.urls.length,
      lastModified: newest(chunk.urls),
    })),
  }

  const write = redis.multi()
  for (const [position, chunk] of chunks.entries()) {
    write.set(chunkKey(position + 1), JSON.stringify(chunk), 'EX', SITEMAP_TTL_SECONDS)
  }
  write.set(INDEX_KEY, JSON.stringify(index), 'EX', SITEMAP_TTL_SECONDS)
  await write.exec()

  const stale = (previous?.chunks ?? []).filter((chunk) => chunk.number > chunks.length)
  if (stale.length > 0) await redis.del(stale.map((chunk) => chunkKey(chunk.number)))
  return index
}

/** The last build's chunk list, or `null` when none was built or it is unreadable. */
export async function loadSitemapIndex(redis: Redis): Promise<SitemapIndex | null> {
  const raw = await redis.get(INDEX_KEY)
  if (raw === null) return null
  const parsed = sitemapIndexSchema.safeParse(JSON.parse(raw))
  return parsed.success ? parsed.data : null
}

/** One chunk of the last build, or `null` when it does not exist. */
export async function loadSitemapChunk(redis: Redis, number: number): Promise<SitemapChunk | null> {
  const raw = await redis.get(chunkKey(number))
  if (raw === null) return null
  const parsed = sitemapChunkSchema.safeParse(JSON.parse(raw))
  return parsed.success ? parsed.data : null
}
