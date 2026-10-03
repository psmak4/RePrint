import { books, newId, reviews } from '@reprint/db'
import { Queue } from 'bullmq'
import { pino } from 'pino'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createSourceGateway } from '../../catalog/gateway/gateway.js'
import { createSourceMetrics } from '../../catalog/gateway/metrics.js'
import { jobs } from '../../jobs/registry.js'
import type { Alert } from '../../observability/sentry.js'
import { recordingMailer } from '../../testing/mailer.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'
import { createTestUser } from '../../testing/users.js'
import { runMonitor } from './monitor.js'

const HOUR_MS = 3_600_000

let stack: TestStack
let queue: Queue

beforeAll(async () => {
  stack = await startTestStack()
  // No worker runs here, so added jobs stay waiting.
  queue = new Queue('monitor-test', { connection: stack.redis.duplicate() })
  queue.on('error', () => {})
})

afterAll(async () => {
  await queue?.close()
  await stack?.stop()
})

beforeEach(async () => {
  await stack.reset()
  await queue.obliterate({ force: true })
})

const monitor = (now = new Date(), sourceRps = 2) =>
  runMonitor({ db: stack.db.db, redis: stack.redis, queue, sourceRps, now })

async function seedPendingReview(ageMs: number) {
  const user = await createTestUser(stack.db.db)
  const [book] = await stack.db.db
    .insert(books)
    .values({ title: 'Dune', slug: `dune-${newId()}` })
    .returning({ id: books.id })
  await stack.db.db.insert(reviews).values({
    userId: user.id,
    bookId: book?.id ?? '',
    rating: 4,
    body: 'A thoughtful, well paced book that rewards a careful reading from start to finish.',
    status: 'pending',
    submittedAt: new Date(Date.now() - ageMs),
  })
}

describe('runMonitor', () => {
  it('reports nothing when everything is healthy', async () => {
    await queue.add('x', {})
    await seedPendingReview(HOUR_MS)
    expect(await monitor()).toEqual([])
  })

  it('reports a queue with more than 1,000 waiting jobs', async () => {
    await queue.addBulk(Array.from({ length: 1001 }, () => ({ name: 'x', data: {} })))
    expect((await monitor()).map((a) => a.signal)).toEqual(['queue_stuck'])
  })

  it('reports a queue whose oldest waiting job is over 15 minutes old', async () => {
    await queue.add('x', {}, { timestamp: Date.now() - 16 * 60_000 })
    expect((await monitor()).map((a) => a.signal)).toEqual(['queue_stuck'])
  })

  it('reports the oldest pending review only after 48 hours', async () => {
    await seedPendingReview(47 * HOUR_MS)
    expect(await monitor()).toEqual([])
    await seedPendingReview(49 * HOUR_MS)
    expect((await monitor()).map((a) => a.signal)).toEqual(['review_queue_stale'])
  })

  it('reports an open circuit breaker published by the gateway, and clears when it closes', async () => {
    const gateway = createSourceGateway({
      redis: stack.redis,
      rps: 1000,
      timeoutMs: 1000,
      version: 'test',
      contactEmail: 'ops@example.test',
      failureThreshold: 2,
      cooldownMs: 5000,
      fetch: async () => new Response('down', { status: 503 }),
    })
    await gateway.fetch('http://source.test/a')
    await gateway.fetch('http://source.test/b')
    await new Promise((resolve) => setTimeout(resolve, 50)) // the mark is written without awaiting
    expect((await monitor()).map((a) => a.signal)).toEqual(['source_breaker_open'])
    await createSourceMetrics(stack.redis).recordBreakerClosed()
    expect(await monitor()).toEqual([])
  })

  it('reports Source usage above 70% of the limit over the last hour', async () => {
    const now = new Date()
    const second = Math.floor(now.getTime() / 1000)
    const pipeline = stack.redis.pipeline()
    // Two requests every second for an hour: 7,200 requests.
    for (let i = 0; i < 3600; i++) pipeline.set(`source:metrics:requests:${second - i}`, 2)
    await pipeline.exec()
    expect((await monitor(now, 2)).map((a) => a.signal)).toEqual(['source_usage_high'])
    expect(await monitor(now, 4)).toEqual([]) // the same traffic is 50% of a 4 rps limit
  })
})

describe('system.monitor job', () => {
  it('hands each alert to the reporter', async () => {
    await queue.add('x', {}, { timestamp: Date.now() - 20 * 60_000 })
    const reported: Alert[] = []
    const result = await jobs['system.monitor'].handler(
      {},
      {
        log: pino({ level: 'silent' }),
        mailer: recordingMailer().mailer,
        db: stack.db.db,
        redis: stack.redis,
        storage: undefined as never,
        catalog: undefined as never,
        queue,
        sourceRps: 2,
        alert: (alert) => reported.push(alert),
      },
    )
    expect(result).toEqual({ alerts: ['queue_stuck'] })
    expect(reported.map((a) => a.signal)).toEqual(['queue_stuck'])
  })
})
