import { PostgreSqlContainer } from '@testcontainers/postgresql'
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
