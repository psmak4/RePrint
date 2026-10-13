import { createDb } from '@reprint/db'
import { cleanStoredMarkup } from '../catalog/clean-markup.js'
import { sourceTextCleaners } from '../catalog/sources/index.js'

/**
 * One-time (and safe to repeat): reads stored Book descriptions and Author bios again with the
 * Sources' current rules (D-202). `DATABASE_URL=… pnpm --filter api catalog:clean-markup`
 */
async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('Usage: DATABASE_URL=… pnpm --filter api catalog:clean-markup')
    process.exitCode = 2
    return
  }
  const { db, close } = createDb(databaseUrl, { max: 1 })
  try {
    const changed = await cleanStoredMarkup(db, sourceTextCleaners)
    console.log(`Cleaned ${changed.books} Book descriptions and ${changed.authors} Author bios.`)
  } finally {
    await close()
  }
}

await main()
