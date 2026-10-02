import { assertSeedAllowed, createDb, createSeedRandom } from '@reprint/db'
import { LIBRARIES_SEED, seedLibraries } from '../modules/library/seed-libraries.js'

/** `pnpm db:seed` and `pnpm db:reset` run this after the Discover seed. Local databases only. */
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
    const result = await seedLibraries(db, createSeedRandom(LIBRARIES_SEED), (message) =>
      console.log(message),
    )
    console.log(
      `Library seed done: ${result.entries} Shelf entries for ${result.members} Members (${result.privateLibraries} private).`,
    )
  } finally {
    await close()
  }
}

await main()
