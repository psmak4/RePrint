import { problemDetailsSchema } from '@reprint/shared'
import type { FastifyInstance } from 'fastify'
import { Redis } from 'ioredis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { loadEnv } from '../../config/env.js'
import { createJobQueue, type JobQueue, queueCheck } from '../../jobs/queue.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'
import { postgresCheck, redisCheck } from './readiness.js'

let stack: TestStack
let app: FastifyInstance
let appRedis: Redis
let jobQueue: JobQueue

beforeAll(async () => {
  stack = await startTestStack()
  appRedis = new Redis(stack.redisUrl, { maxRetriesPerRequest: 1 })
  appRedis.on('error', () => {})
  jobQueue = createJobQueue(stack.redisUrl)
  const env = loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    WEB_ORIGINS: 'http://www.reprint.test:5173',
    DATABASE_URL: stack.databaseUrl,
    REDIS_URL: stack.redisUrl,
  })
  app = await buildApp(env, {
    readinessChecks: [postgresCheck(stack.db), redisCheck(appRedis), queueCheck(jobQueue)],
  })
  await app.ready()
})

afterAll(async () => {
  await app?.close()
  await jobQueue?.close()
  appRedis?.disconnect()
  await stack?.stop()
})

describe('security headers', () => {
  it('sets HSTS with preload, nosniff, and a strict referrer policy', async () => {
    const { headers } = await app.inject({ method: 'GET', url: '/v1/ready' })
    expect(headers['strict-transport-security']).toBe(
      'max-age=63072000; includeSubDomains; preload',
    )
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['content-security-policy']).toContain("default-src 'none'")
  })

  it('also sets them on error responses', async () => {
    const { headers, statusCode } = await app.inject({ method: 'GET', url: '/v1/nope' })
    expect(statusCode).toBe(404)
    expect(headers['x-content-type-options']).toBe('nosniff')
  })
})

describe('GET /v1/ready', () => {
  it('returns 200 when Postgres, Redis, and the queue are reachable', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/ready' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      status: 'ok',
      checks: { postgres: 'ok', redis: 'ok', queue: 'ok' },
    })
  })

  // Runs last: it stops the Redis container.
  it('returns 503 Problem Details when Redis is stopped', async () => {
    await stack.stopRedis()
    const response = await app.inject({ method: 'GET', url: '/v1/ready' })
    expect(response.statusCode).toBe(503)
    expect(response.headers['content-type']).toContain('application/problem+json')
    const body = problemDetailsSchema.parse(response.json())
    expect(body.status).toBe(503)
    expect(body.detail).toContain('redis')
    expect(body.detail).toContain('queue')
    expect(body.detail).not.toContain('postgres')
  })
})
