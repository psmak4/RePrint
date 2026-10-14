import { createDb } from '@reprint/db'
import { Redis } from 'ioredis'
import { backfillSourceRatings } from '../catalog/backfill-ratings.js'
import { createCatalogRuntime } from '../catalog/runtime.js'
import { loadWorkerEnv } from '../config/env.js'

/**
 * One-time (and safe to repeat): fills in the Source's reader ratings for Books stored before
 * D-204, through the shared gateway at background priority. `pnpm --filter api catalog:backfill-ratings`
 */
async function main(): Promise<void> {
  const env = loadWorkerEnv()
  const { db, close } = createDb(env.DATABASE_URL, { max: 1 })
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1 })
  try {
    const catalog = createCatalogRuntime(env, redis)
    const result = await backfillSourceRatings({
      db,
      source: catalog.source,
      call: catalog.background,
      log: (message, detail) => console.error(message, detail),
    })
    console.log(
      `Saved ${result.saved} ratings and removed ${result.removed}; ${result.failedBatches} batches failed.`,
    )
    if (result.failedBatches > 0) process.exitCode = 1
  } finally {
    await close()
    redis.disconnect()
  }
}

await main()
