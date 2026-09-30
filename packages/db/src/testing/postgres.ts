import { PostgreSqlContainer } from '@testcontainers/postgresql'
import type postgres from 'postgres'
import { createDb, type DbClient } from '../client.js'
import { runMigrations } from '../migrate.js'

/** Same image as docker-compose.yml (D-056). */
export const TEST_POSTGRES_IMAGE = 'postgres:18'

export interface TestDatabase extends DbClient {
  url: string
  /** Closes the client and stops the container. */
  stop: () => Promise<void>
}

/** Starts a throwaway Postgres 18 container, applies every migration, and returns a connected client. Needs Docker. */
export async function startTestDatabase(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer(TEST_POSTGRES_IMAGE)
    .withDatabase('reprint')
    .withUsername('reprint')
    .withPassword('reprint')
    .start()
  try {
    const url = container.getConnectionUri()
    await runMigrations(url)
    const client = createDb(url)
    return {
      ...client,
      url,
      stop: async () => {
        await client.close()
        await container.stop()
      },
    }
  } catch (error) {
    await container.stop()
    throw error
  }
}

/** Tables filled by data migrations (roles and grants, Genres and their mapping rules). Tests rely on them, so they are never emptied. */
export const MIGRATION_SEEDED_TABLES: readonly string[] = [
  'roles',
  'permissions',
  'role_permissions',
  'genres',
  'subject_genre_rules',
]

/** Empties every table in the `public` schema (never the migration history or migration-seeded data) so each test starts clean. */
export async function truncateAllTables(sql: postgres.Sql): Promise<void> {
  const rows = await sql<{ name: string }[]>`
    select tablename as name from pg_tables where schemaname = 'public'`
  // Identifiers are escaped by postgres.js (`sql(name)`), never interpolated.
  for (const { name } of rows) {
    if (MIGRATION_SEEDED_TABLES.includes(name)) continue
    await sql`truncate table ${sql(`public.${name}`)} restart identity cascade`
  }
}
