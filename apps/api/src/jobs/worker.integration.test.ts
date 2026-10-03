import { type ChildProcess, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { QueueEvents } from 'bullmq'
import { Redis } from 'ioredis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startTestStack, type TestStack } from '../testing/stack.js'
import { createJobQueue, type JobQueue, QUEUE_NAME, queueCheck } from './queue.js'

const workerEntry = fileURLToPath(new URL('../../dist/worker.js', import.meta.url))

let stack: TestStack
let jobQueue: JobQueue
let events: QueueEvents
let eventsConnection: Redis
let worker: ChildProcess
let output = ''

function waitForOutput(text: string, timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const timer = setInterval(() => {
      if (output.includes(text)) {
        clearInterval(timer)
        resolve()
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer)
        reject(new Error(`worker never printed "${text}". Output:\n${output}`))
      }
    }, 100)
  })
}

beforeAll(async () => {
  stack = await startTestStack()
  jobQueue = createJobQueue(stack.redisUrl)
  eventsConnection = new Redis(stack.redisUrl, { maxRetriesPerRequest: null })
  eventsConnection.on('error', () => {})
  events = new QueueEvents(QUEUE_NAME, { connection: eventsConnection })
  events.on('error', () => {})
  await events.waitUntilReady()
  // The built worker, exactly as production starts it (`pnpm build` runs first through Turbo).
  worker = spawn(process.execPath, [workerEntry], {
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'test',
      LOG_LEVEL: 'info',
      DATABASE_URL: stack.databaseUrl,
      REDIS_URL: stack.redisUrl,
    },
  })
  worker.stdout?.on('data', (chunk: Buffer) => {
    output += chunk.toString()
  })
  worker.stderr?.on('data', (chunk: Buffer) => {
    output += chunk.toString()
  })
  await waitForOutput('worker ready')
})

afterAll(async () => {
  worker?.kill('SIGTERM')
  await events?.close()
  eventsConnection?.disconnect()
  await jobQueue?.close()
  await stack?.stop()
})

describe('worker (dist/worker.js)', () => {
  it('processes a system.heartbeat job', async () => {
    const id = await jobQueue.enqueue('system.heartbeat', { note: 'integration' })
    const job = await jobQueue.queue.getJob(id)
    const result = (await job?.waitUntilFinished(events, 20_000)) as { at: string }
    expect(new Date(result.at).toString()).not.toBe('Invalid Date')
    expect(output).toContain('heartbeat')
  })

  it('registers each repeatable schedule once', async () => {
    const schedulers = await jobQueue.queue.getJobSchedulers()
    expect(schedulers.map((scheduler) => scheduler.name).sort()).toEqual([
      'accounts.erase',
      'catalog.purgeSourceRecords',
      'discover.rebuild',
      'privacy.clearOldIps',
      'ratings.recompute',
      'sitemaps.build',
      'system.heartbeat',
      'system.monitor',
      'users.lift_suspensions',
    ])
  })

  it('rejects an invalid payload before it is enqueued', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: deliberately violates the payload type
    await expect(jobQueue.enqueue('system.heartbeat', { note: 5 } as any)).rejects.toThrow()
  })

  it('exits cleanly on SIGTERM', async () => {
    const exited = new Promise<number | null>((resolve) => worker.once('exit', resolve))
    worker.kill('SIGTERM')
    expect(await exited).toBe(0)
  })
})

describe('queue readiness check', () => {
  it('resolves while Redis is up (the down case is covered by GET /v1/ready)', async () => {
    await expect(queueCheck(jobQueue).check()).resolves.toBeDefined()
  })
})
