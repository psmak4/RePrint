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
  /**
   * Shuts down the Redis server but keeps its container, to test how the API behaves when Redis
   * is down. Keeping the container keeps its IP and host port reserved, so clients that reconnect
   * can't reach another test file's Redis.
   */
  stopRedis: () => Promise<void>
  /** Closes the clients and stops both containers. */
  stop: () => Promise<void>
}

/** Starts throwaway Postgres 18 (migrated) and Redis 7 containers and connects clients. Needs Docker. */
export async function startTestStack(): Promise<TestStack> {
  const [database, redisContainer] = await Promise.all([
    startTestDatabase(),
    // A shell is PID 1 so `stopRedis()` can end redis-server without stopping the container.
    // Removing the container frees its bridge IP, which Docker hands straight to the next new
    // container while the host port forwarder is still accepting reconnects to the old one.
    new RedisContainer(TEST_REDIS_IMAGE)
      .withCommand(['sh', '-c', 'docker-entrypoint.sh redis-server; sleep infinity'])
      .start(),
  ])
  const redisUrl = redisContainer.getConnectionUrl()
  // Fail fast when Redis is down instead of queueing commands forever.
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1 })
  redis.on('error', () => {}) // expected while a test stops Redis
  let redisRunning = true
  const stopRedisServer = async () => {
    if (!redisRunning) return
    redisRunning = false
    await redisContainer.exec(['redis-cli', 'shutdown', 'nosave'])
    const ping = await redisContainer.exec(['redis-cli', 'ping'])
    if (ping.exitCode === 0 && ping.output.includes('PONG')) {
      throw new Error('Redis still answers after SHUTDOWN')
    }
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
    stopRedis: stopRedisServer,
    stop: async () => {
      redis.disconnect()
      await database.stop()
      await redisContainer.stop()
    },
  }
}
