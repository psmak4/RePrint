import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { queueAuthorBookImports } from '../catalog/author-sync.js'
import { queueSeriesMemberImports } from '../catalog/series-sync.js'
import { startTestStack, type TestStack } from '../testing/stack.js'
import { createJobQueue, type JobQueue } from './queue.js'

// No worker runs here, so every job stays waiting where the tests can read it.
let stack: TestStack
let jobQueue: JobQueue

beforeAll(async () => {
  stack = await startTestStack()
  jobQueue = createJobQueue(stack.redisUrl)
})
afterAll(async () => {
  await jobQueue?.close()
  await stack?.stop()
})
beforeEach(async () => {
  await stack.reset()
  vi.restoreAllMocks()
})

const AUTHOR = '0192a3b4-0000-7000-8000-000000000001'
const SERIES = '0192a3b4-0000-7000-8000-000000000002'

/** Jobs not yet run; prioritized ones sit in their own BullMQ list. */
const waiting = () => jobQueue.queue.getJobs(['waiting', 'prioritized'])

describe('enqueueMany (M10-T11)', () => {
  it('adds every job in one bulk call, with its payload, priority, and retry policy', async () => {
    const addBulk = vi.spyOn(jobQueue.queue, 'addBulk')
    const add = vi.spyOn(jobQueue.queue, 'add')
    const books = Array.from({ length: 300 }, (_, i) => ({ authorId: AUTHOR, sourceId: `b${i}` }))
    await queueAuthorBookImports(jobQueue, books)
    expect(addBulk).toHaveBeenCalledTimes(1)
    expect(add).not.toHaveBeenCalled()
    const jobs = await waiting()
    expect(jobs).toHaveLength(300)
    const first = jobs.find((job) => job.data.sourceId === 'b0')
    expect(first?.name).toBe('catalog.author-book')
    expect(first?.opts.priority).toBe(10)
    expect(first?.opts.attempts).toBe(5)
  })

  it('keeps per-job deduplication: a repeat while waiting adds nothing new', async () => {
    const members = [
      { seriesId: SERIES, sourceId: 'w1', position: 1 },
      { seriesId: SERIES, sourceId: 'w2', position: 2 },
    ]
    await queueSeriesMemberImports(jobQueue, members)
    await queueSeriesMemberImports(jobQueue, [
      ...members,
      { seriesId: SERIES, sourceId: 'w3', position: 3 },
    ])
    const jobs = await waiting()
    expect(jobs.map((job) => job.data.sourceId).sort()).toEqual(['w1', 'w2', 'w3'])
  })

  it('adds nothing when one payload is invalid', async () => {
    await expect(
      jobQueue.enqueueMany('catalog.author-book', [
        { payload: { authorId: AUTHOR, sourceId: 'ok' } },
        { payload: { authorId: AUTHOR, sourceId: '' } },
      ]),
    ).rejects.toThrow()
    expect(await waiting()).toHaveLength(0)
  })

  it('makes no call for an empty list', async () => {
    const addBulk = vi.spyOn(jobQueue.queue, 'addBulk')
    expect(await jobQueue.enqueueMany('catalog.author-book', [])).toEqual([])
    expect(addBulk).not.toHaveBeenCalled()
  })
})
