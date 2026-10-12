import type { DbClient } from '@reprint/db'
import { startTestDatabase, truncateAllTables } from '@reprint/db/testing'
import { RedisContainer } from '@testcontainers/redis'
import { Redis } from 'ioredis'
import { startTcpProxy } from './tcp-proxy.js'

/** Same image as docker-compose.yml (D-056). */
export const TEST_REDIS_IMAGE = 'redis:7'

export interface TestStack {
  db: DbClient
  redis: Redis
  databaseUrl: string
  redisUrl: string
  /** Empties every table and flushes Redis; call in `beforeEach` to isolate tests. */
  reset: () => Promise<void>
  /**
   * Stops only Redis, to test how the API behaves when Redis is down. Clients reach Redis through
   * a proxy that keeps its port after the stop, so they can't reconnect to another test file's
   * Redis on a reused Docker port.
   */
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
  const proxy = await startTcpProxy({
    host: redisContainer.getHost(),
    port: redisContainer.getMappedPort(6379),
  })
  const redisUrl = `redis://127.0.0.1:${proxy.port}`
  // Fail fast when Redis is down instead of queueing commands forever.
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1 })
  redis.on('error', () => {}) // expected while a test stops Redis
  let redisRunning = true
  const stopRedisContainer = async () => {
    if (!redisRunning) return
    redisRunning = false
    proxy.sever()
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
      await proxy.close()
    },
  }
}
