import { Writable } from 'node:stream'
import { problemDetailsSchema } from '@reprint/shared'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { buildApp } from './app.js'
import { loadEnv } from './config/env.js'

const WEB_ORIGIN = 'http://www.reprint.test:5173'
const BACKING_SERVICES = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
}

let app: FastifyInstance
let logLines: string[]

beforeEach(async () => {
  logLines = []
  const logStream = new Writable({
    write(chunk, _encoding, callback) {
      logLines.push(...String(chunk).split('\n').filter(Boolean))
      callback()
    },
  })
  app = await buildApp(
    loadEnv({ ...BACKING_SERVICES, WEB_ORIGINS: WEB_ORIGIN, LOG_LEVEL: 'info', NODE_ENV: 'test' }),
    {
      logStream,
    },
  )
  app.post(
    '/v1/echo',
    {
      schema: {
        body: z.object({ name: z.string().min(1) }),
        querystring: z.object({ n: z.coerce.number().int() }),
      },
    },
    async () => ({ ok: true }),
  )
  await app.ready()
})

afterEach(async () => {
  await app.close()
})

describe('GET /v1/health', () => {
  it('returns 200', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/health' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
  })
})

describe('errors', () => {
  it('returns a 400 Problem Details body with errors[] for a validation failure', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/echo?n=x',
      headers: { origin: WEB_ORIGIN },
      payload: { name: '' },
    })
    expect(response.statusCode).toBe(400)
    expect(response.headers['content-type']).toContain('application/problem+json')
    const body = problemDetailsSchema.parse(response.json())
    expect(body.status).toBe(400)
    expect(body.errors?.map((error) => error.path)).toEqual(['body.name'])

    const query = await app.inject({
      method: 'POST',
      url: '/v1/echo?n=x',
      headers: { origin: WEB_ORIGIN },
      payload: { name: 'ok' },
    })
    expect(query.statusCode).toBe(400)
    expect(problemDetailsSchema.parse(query.json()).errors?.map((e) => e.path)).toEqual([
      'querystring.n',
    ])
  })

  it('returns a 404 Problem Details body for unknown routes', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/nope' })
    expect(response.statusCode).toBe(404)
    expect(problemDetailsSchema.parse(response.json()).status).toBe(404)
  })

  it('returns a 500 Problem Details body without leaking the error', async () => {
    const failing = await buildApp(
      loadEnv({ ...BACKING_SERVICES, WEB_ORIGINS: WEB_ORIGIN, LOG_LEVEL: 'silent' }),
    )
    failing.get('/boom', async () => {
      throw new Error('secret internals')
    })
    const response = await failing.inject({ method: 'GET', url: '/boom' })
    expect(response.statusCode).toBe(500)
    expect(response.body).not.toContain('secret internals')
    expect(problemDetailsSchema.parse(response.json()).status).toBe(500)
    await failing.close()
  })
})

describe('Origin check', () => {
  it('rejects a non-GET request from a foreign Origin with 403', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/echo?n=1',
      headers: { origin: 'https://evil.test' },
      payload: { name: 'x' },
    })
    expect(response.statusCode).toBe(403)
    expect(problemDetailsSchema.parse(response.json()).status).toBe(403)
  })

  it('rejects a non-GET request with no Origin', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/echo?n=1',
      payload: { name: 'x' },
    })
    expect(response.statusCode).toBe(403)
  })

  it('allows a non-GET request from an allowed Origin', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/echo?n=1',
      headers: { origin: WEB_ORIGIN },
      payload: { name: 'x' },
    })
    expect(response.statusCode).toBe(200)
  })

  it('does not check GET requests', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/health',
      headers: { origin: 'https://evil.test' },
    })
    expect(response.statusCode).toBe(200)
    expect(response.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('answers CORS for an allowed origin with credentials', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/health',
      headers: { origin: WEB_ORIGIN },
    })
    expect(response.headers['access-control-allow-origin']).toBe(WEB_ORIGIN)
    expect(response.headers['access-control-allow-credentials']).toBe('true')
  })
})

describe('request IDs and logging', () => {
  it('echoes x-request-id and logs it in pino JSON', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/health',
      headers: { 'x-request-id': 'req-abc.123' },
    })
    expect(response.headers['x-request-id']).toBe('req-abc.123')
    const entries = logLines.map((line) => JSON.parse(line) as Record<string, unknown>)
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.every((entry) => entry.reqId === 'req-abc.123')).toBe(true)
  })

  it('generates a request ID when none is sent or the one sent is unsafe', async () => {
    const none = await app.inject({ method: 'GET', url: '/v1/health' })
    expect(none.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
    const unsafe = await app.inject({
      method: 'GET',
      url: '/v1/health',
      headers: { 'x-request-id': 'bad id\t{}' },
    })
    expect(unsafe.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('echoes the request ID on error responses', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/nope',
      headers: { 'x-request-id': 'r-1' },
    })
    expect(response.headers['x-request-id']).toBe('r-1')
  })
})

describe('security headers (PRD §11)', () => {
  it('sets HSTS with preload, nosniff, the referrer policy, and a CSP that allows nothing', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/health' })
    expect(response.headers['strict-transport-security']).toBe(
      'max-age=63072000; includeSubDomains; preload',
    )
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
    const csp = String(response.headers['content-security-policy'])
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).not.toContain('unsafe-inline')
  })

  it('sets the same headers on error responses', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/nope' })
    expect(response.statusCode).toBe(404)
    expect(response.headers['strict-transport-security']).toContain('preload')
    expect(response.headers['x-content-type-options']).toBe('nosniff')
  })
})
