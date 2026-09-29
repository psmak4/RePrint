import { problemDetailsSchema } from '@reprint/shared'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { loadEnv } from '../../config/env.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'

const ORIGIN = 'http://www.reprint.test:5173'

let stack: TestStack

async function appWith(publicSignups: 'true' | 'false'): Promise<FastifyInstance> {
  const env = loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    WEB_ORIGINS: ORIGIN,
    DATABASE_URL: stack.databaseUrl,
    REDIS_URL: stack.redisUrl,
    HIBP_MODE: 'off',
    PUBLIC_SIGNUPS: publicSignups,
    SIGNUP_INVITE_CODES: 'beta-one, beta-two',
  })
  const app = await buildApp(env, {
    database: stack.db.db,
    redis: stack.redis,
    jobs: { enqueue: async () => '1' },
  })
  await app.ready()
  return app
}

function register(app: FastifyInstance, extra: Record<string, unknown> = {}) {
  return app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    headers: { origin: ORIGIN },
    payload: {
      email: 'ada@example.test',
      username: 'ada_l',
      password: 'correct horse battery',
      ...extra,
    },
  })
}

beforeAll(async () => {
  stack = await startTestStack()
})

afterAll(async () => {
  await stack?.stop()
})

beforeEach(async () => {
  await stack.reset()
})

describe('private beta signup gate', () => {
  let closed: FastifyInstance
  let open: FastifyInstance

  beforeAll(async () => {
    closed = await appWith('false')
    open = await appWith('true')
  })

  afterAll(async () => {
    await closed?.close()
    await open?.close()
  })

  it('refuses registration without an invite code while signups are closed', async () => {
    const response = await register(closed)
    expect(response.statusCode).toBe(403)
    const body = problemDetailsSchema.parse(response.json())
    expect(body.errors?.[0]?.path).toBe('body.inviteCode')
  })

  it('refuses a code that is not on the list', async () => {
    const response = await register(closed, { inviteCode: 'nope' })
    expect(response.statusCode).toBe(403)
  })

  it('accepts a listed code, including a later one in the list', async () => {
    const response = await register(closed, { inviteCode: 'beta-two' })
    expect(response.statusCode).toBe(201)
  })

  it('needs no code while signups are open', async () => {
    expect((await register(open)).statusCode).toBe(201)
  })

  it('exposes signupsOpen on GET /v1/auth/session', async () => {
    const closedResponse = await closed.inject({ method: 'GET', url: '/v1/auth/session' })
    expect(closedResponse.json()).toEqual({ signupsOpen: false, viewer: null })
    const openResponse = await open.inject({ method: 'GET', url: '/v1/auth/session' })
    expect(openResponse.json()).toEqual({ signupsOpen: true, viewer: null })
  })
})
