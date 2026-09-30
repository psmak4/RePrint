import { assertSeedAllowed, createDb } from '@reprint/db'
import { seedCatalog } from '../catalog/seed-catalog.js'

/** `pnpm db:seed` and `pnpm db:reset` run this after the database seed. Local databases only. */
const LOCAL_URL = 'postgres://reprint:reprint@localhost:5432/reprint'

async function main(): Promise<void> {
  // Same local default as `db:seed`, so the two commands agree when there is no .env.
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
    const result = await seedCatalog(db, (message) => console.log(message))
    console.log(
      `Catalog seed done: ${result.books} Books (${result.created} new, ${result.mergeCandidates} merge candidates).`,
    )
  } finally {
    await close()
  }
}

await main()
