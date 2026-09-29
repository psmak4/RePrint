import { sql } from 'drizzle-orm'
import { createDb } from '../client.js'
import { runMigrations } from '../migrate.js'
import { assertSeedAllowed } from './guard.js'
import { createSeedRandom } from './prng.js'
import { type SeedModule, seedModules } from './registry.js'

/** One fixed seed: every run of every module sees the same random sequence. */
export const SEED = 20260101

export interface SeedOptions {
  modules?: readonly SeedModule[]
  nodeEnv?: string | undefined
  log?: (message: string) => void
}

/** Runs the seed modules in order, in one transaction, so a failure leaves nothing half seeded. */
export async function runSeed(databaseUrl: string, options: SeedOptions = {}): Promise<void> {
  assertSeedAllowed(databaseUrl, options.nodeEnv)
  const modules = options.modules ?? seedModules
  const log = options.log ?? (() => {})
  const { db, close } = createDb(databaseUrl, { max: 1 })
  try {
    await db.transaction(async (tx) => {
      const random = createSeedRandom(SEED)
      for (const module of modules) {
        log(`seed: ${module.name}`)
        // The transaction handle exposes the same query API as the database.
        await module.run({ db: tx as unknown as typeof db, random })
      }
    })
  } finally {
    await close()
  }
}

/** Drops every table, re-applies migrations, and seeds. Local databases only. */
export async function resetDatabase(databaseUrl: string, options: SeedOptions = {}): Promise<void> {
  assertSeedAllowed(databaseUrl, options.nodeEnv)
  const { db, close } = createDb(databaseUrl, { max: 1 })
  try {
    await db.execute(sql`drop schema if exists drizzle cascade`)
    await db.execute(sql`drop schema if exists public cascade`)
    await db.execute(sql`create schema public`)
  } finally {
    await close()
  }
  await runMigrations(databaseUrl)
  await runSeed(databaseUrl, options)
}
