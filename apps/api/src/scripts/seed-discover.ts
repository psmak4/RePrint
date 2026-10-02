import { assertSeedAllowed, createDb, createSeedRandom } from '@reprint/db'
import { DISCOVER_SEED, seedDiscover } from '../modules/discover/seed-discover.js'

/** `pnpm db:seed` and `pnpm db:reset` run this after the review seed. Local databases only. */
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
    const result = await seedDiscover(db, createSeedRandom(DISCOVER_SEED), (message) =>
      console.log(message),
    )
    console.log(
      `Discover seed done: ${result.reviews} reviews, ${result.helpfulVotes} helpful votes, ${result.featuredGenres} featured genres.`,
    )
  } finally {
    await close()
  }
}

await main()
