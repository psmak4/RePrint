import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { createDb } from './client.js'

/** Folder of drizzle-kit migrations, `packages/db/drizzle`. */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../drizzle', import.meta.url))

/** Applies every pending migration. Uses a single connection so migrations run serially. */
export async function runMigrations(url: string): Promise<void> {
  const { db, close } = createDb(url, { max: 1 })
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
  } finally {
    await close()
  }
}
