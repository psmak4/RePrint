import { assertSeedAllowed, createDb, createSeedRandom } from '@reprint/db'
import { REVIEWS_SEED, seedReviews } from '../modules/reviews/seed-reviews.js'

/** `pnpm db:seed` and `pnpm db:reset` run this after the Catalog seed. Local databases only. */
const LOCAL_URL = 'postgres://reprint:reprint@localhost:5432/reprint'

async function main(): Promise<void> {
  const databaseUrl =
    process.env.DATABASE_URL || (process.env.NODE_ENV === 'production' ? undefined : LOCAL_URL)
  if (!databaseUrl) {
    console.error('DATABASE_URL is required.')
    process.exitCode = 2
    return
  }
  assertSeedAllowed(databaseUrl, process.env.NODE_ENV)
  const { db, close } = createDb(databaseUrl, { max: 4 })
  try {
    const result = await seedReviews(db, createSeedRandom(REVIEWS_SEED), (message) =>
      console.log(message),
    )
    console.log(`Review seed done: ${result.reviews} reviews, ${result.versions} versions.`)
  } finally {
    await close()
  }
}

await main()
