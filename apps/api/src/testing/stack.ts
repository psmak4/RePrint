import type { DbClient } from '@reprint/db'
import { startTestDatabase, truncateAllTables } from '@reprint/db/testing'
import { RedisContainer } from '@testcontainers/redis'
import { Redis } from 'ioredis'

/** Same image as docker-compose.yml (D-056). */
export const TEST_REDIS_IMAGE = 'redis:7'

export interface TestStack {
  db: DbClient
  redis: Redis
  databaseUrl: string
  redisUrl: string
  /** Empties every table and flushes Redis; call in `beforeEach` to isolate tests. */
  reset: () => Promise<void>
  /** Stops only the Redis container, to test how the API behaves when Redis is down. */
  stopRedis: () => Promise<void>
  /** Closes the clients and stops both containers. */
  stop: () => Promise<void>
}

/** Starts throwaway Postgres 18 (migrated) and Redis 7 containers and connects clients. Needs Docker. */
export async function startTestStack(): Promise<TestStack> {
  const [database, redisContainer] = await Promise.all([
    startTestDatabase(),
    new RedisContainer(TEST_REDIS_IMAGE).start(),
  ])
  const redisUrl = redisContainer.getConnectionUrl()
  // Fail fast when Redis is down instead of queueing commands forever.
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1 })
  let redisRunning = true
  const stopRedisContainer = async () => {
    if (!redisRunning) return
    redisRunning = false
    await redisContainer.stop()
  }
  return {
    db: database,
    redis,
    databaseUrl: database.url,
    redisUrl,
    reset: async () => {
      await truncateAllTables(database.sql)
      await redis.flushall()
    },
    stopRedis: stopRedisContainer,
    stop: async () => {
      redis.disconnect()
      await database.stop()
      await stopRedisContainer()
    },
  }
}
