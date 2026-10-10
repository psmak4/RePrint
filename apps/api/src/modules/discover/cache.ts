import type { Database } from '@reprint/db'
import { type DiscoverResponse, discoverResponseSchema } from '@reprint/shared'
import type { Redis } from 'ioredis'
import { buildRow, computeSiteMean, DISCOVER_ROW_KEYS, type DiscoverRowKey } from './rows.js'

/** Bump the version when a row's shape changes so old entries are never read (D-135). */
const KEY_PREFIX = 'discover:v3'
const SITE_MEAN_KEY = `${KEY_PREFIX}:site-mean`
/** The rebuild job runs every 10 minutes; an entry outlives a few missed runs, then expires. */
export const DISCOVER_CACHE_TTL_SECONDS = 60 * 60

const rowKey = (key: DiscoverRowKey) => `${KEY_PREFIX}:row:${key}`

const rowSchemas = discoverResponseSchema.shape

async function buildAll(
  db: Database,
  now: Date,
): Promise<{ siteMean: number; rows: DiscoverResponse }> {
  const siteMean = await computeSiteMean(db)
  const entries = await Promise.all(
    DISCOVER_ROW_KEYS.map(
      async (key) => [key, await buildRow(db, key, { siteMean, now })] as const,
    ),
  )
  return { siteMean, rows: discoverResponseSchema.parse(Object.fromEntries(entries)) }
}

async function store(redis: Redis, siteMean: number, rows: DiscoverResponse): Promise<void> {
  const pipeline = redis.multi()
  pipeline.set(SITE_MEAN_KEY, String(siteMean), 'EX', DISCOVER_CACHE_TTL_SECONDS)
  for (const key of DISCOVER_ROW_KEYS) {
    pipeline.set(rowKey(key), JSON.stringify(rows[key]), 'EX', DISCOVER_CACHE_TTL_SECONDS)
  }
  await pipeline.exec()
}

/**
 * Builds every row and stores each under its own key. A hidden row is stored as JSON `null`, so
 * "hidden" and "not built yet" differ. Redis errors fail the job so it is retried and reported.
 */
export async function rebuildDiscover(
  db: Database,
  redis: Redis,
  now: Date = new Date(),
): Promise<DiscoverResponse> {
  const { siteMean, rows } = await buildAll(db, now)
  await store(redis, siteMean, rows)
  return rows
}

/** The cached rows, or `null` when any row is missing or unreadable (never built, or expired). */
async function readCached(redis: Redis): Promise<DiscoverResponse | null> {
  const values = await redis.mget(DISCOVER_ROW_KEYS.map(rowKey))
  const rows: Record<string, unknown> = {}
  for (const [index, key] of DISCOVER_ROW_KEYS.entries()) {
    const raw = values[index]
    if (raw === null || raw === undefined) return null
    const parsed = rowSchemas[key].safeParse(JSON.parse(raw))
    if (!parsed.success) return null
    rows[key] = parsed.data
  }
  return discoverResponseSchema.parse(rows)
}

/**
 * `GET /discover` serves the cache the `discover.rebuild` job fills. When it is empty (a fresh
 * Redis, or the worker has been down for an hour) the first request builds it. Redis trouble never
 * fails the page: it is built from the Catalog and served uncached.
 */
export async function loadDiscover(db: Database, redis: Redis): Promise<DiscoverResponse> {
  const cached = await readCached(redis).catch(() => null)
  if (cached) return cached
  const { siteMean, rows } = await buildAll(db, new Date())
  await store(redis, siteMean, rows).catch(() => {})
  return rows
}
