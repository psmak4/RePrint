import { books, sourceLinks } from '@reprint/db'
import { problemDetailsSchema, resolveBookResponseSchema } from '@reprint/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { CANDIDATE_REF_TTL_SECONDS, createCandidateRefs } from '../../catalog/candidate-refs.js'
import { createStubSource } from '../../catalog/sources/stub/stub-adapter.js'
import { type SourceAdapter, SourceError } from '../../catalog/sources/types.js'
import { loadEnv } from '../../config/env.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'

const ORIGIN = 'http://www.reprint.test:5173'
const stub = createStubSource()
/** What the Source does on `getBook`; tests swap it to simulate an outage or a stall. */
let getBook: SourceAdapter['getBook'] = stub.getBook
let getBookCalls = 0

let stack: TestStack
let app: FastifyInstance

beforeAll(async () => {
  stack = await startTestStack()
  const env = loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    WEB_ORIGINS: ORIGIN,
    DATABASE_URL: stack.databaseUrl,
    REDIS_URL: stack.redisUrl,
    HIBP_MODE: 'off',
    SOURCE_TIMEOUT_MS: '300',
  })
  const source: SourceAdapter = {
    ...stub,
    getBook: (sourceId) => {
      getBookCalls += 1
      return getBook(sourceId)
    },
  }
  app = await buildApp(env, {
    database: stack.db.db,
    redis: stack.redis,
    jobs: { enqueue: async () => '1' },
    catalog: { source, interactive: (fn) => fn() },
  })
  await app.ready()
})
afterAll(async () => {
  await app?.close()
  await stack?.stop()
})
beforeEach(async () => {
  getBook = stub.getBook
  getBookCalls = 0
  await stack.reset()
})

const refs = () => createCandidateRefs(stack.redis)

async function issueRef(sourceId = 'stub-book-dune'): Promise<string> {
  const candidate = await stub.getBook(sourceId)
  if (!candidate) throw new Error('missing stub data')
  return refs().issue(candidate)
}

const resolve = (ref: string) =>
  app.inject({
    method: 'POST',
    url: '/v1/books/resolve',
    headers: { origin: ORIGIN },
    payload: { ref },
  })

describe('candidate references', () => {
  it('are opaque, expire after 24 hours, and hold the Source link only in Redis', async () => {
    const ref = await issueRef()
    expect(ref).not.toContain('stub-book-dune')
    const ttl = await stack.redis.ttl(`catalog:candidate:${ref}`)
    expect(ttl).toBeGreaterThan(CANDIDATE_REF_TTL_SECONDS - 5)
    expect((await refs().load(ref))?.sourceLink.sourceId).toBe('stub-book-dune')
  })
})

describe('POST /v1/books/resolve', () => {
  it('stores the Book with its Editions and Authors and returns its slug', async () => {
    const response = await resolve(await issueRef())
    expect(response.statusCode).toBe(200)
    const { slug } = resolveBookResponseSchema.parse(response.json())
    const detail = await app.inject({ method: 'GET', url: `/v1/books/${slug}` })
    expect(detail.statusCode).toBe(200)
    expect(detail.json().title).toBe('Dune')
    expect(detail.json().contributions[0].author.name).toBe('Frank Herbert')
    expect(response.body).not.toContain('stub-book-dune')
  })

  it('returns the same slug on a second resolve without asking the Source again', async () => {
    const first = await resolve(await issueRef())
    expect(getBookCalls).toBe(1)
    const second = await resolve(await issueRef())
    expect(second.statusCode).toBe(200)
    expect(second.json().slug).toBe(first.json().slug)
    expect(getBookCalls).toBe(1)
    expect(await stack.db.db.select().from(books)).toHaveLength(1)
    expect(
      await stack.db.db.select().from(sourceLinks).where(eq(sourceLinks.entityType, 'book')),
    ).toHaveLength(1)
  })

  it('returns 404 Problem Details for an unknown or expired ref', async () => {
    const response = await resolve('A'.repeat(24))
    expect(response.statusCode).toBe(404)
    expect(problemDetailsSchema.parse(response.json()).status).toBe(404)
  })

  it('returns 404 when the Source no longer has the Book', async () => {
    getBook = async () => null
    const response = await resolve(await issueRef())
    expect(response.statusCode).toBe(404)
  })

  it('returns 400 for a malformed ref', async () => {
    const response = await resolve('not a ref!')
    expect(response.statusCode).toBe(400)
  })

  it('returns 503 Problem Details when the Source fails or its breaker is open', async () => {
    getBook = async () => {
      throw new SourceError('The Source circuit breaker is open')
    }
    const response = await resolve(await issueRef())
    expect(response.statusCode).toBe(503)
    expect(problemDetailsSchema.parse(response.json()).status).toBe(503)
    expect(await stack.db.db.select().from(books)).toHaveLength(0)
  })

  it('returns 503 when the Source does not answer within the limit', async () => {
    getBook = () => new Promise(() => {})
    const started = Date.now()
    const response = await resolve(await issueRef())
    expect(response.statusCode).toBe(503)
    expect(Date.now() - started).toBeLessThan(2000)
  })
})
