import { authTokens, users } from '@reprint/db'
import { renderEmail } from '@reprint/email'
import { problemDetailsSchema } from '@reprint/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { loadEnv } from '../../config/env.js'
import { createMailer, type Mailer } from '../../email/mailer.js'
import { emailSendPayload, type JobName, type JobPayload } from '../../jobs/registry.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'
import { createTestUser } from '../../testing/users.js'
import { hashPassword } from '../auth/password.js'
import { SESSION_COOKIE } from '../auth/session-cookie.js'

const ORIGIN = 'http://www.reprint.test:5173'
const PASSWORD = 'correct horse battery staple'
const NEW_EMAIL = 'fresh-address@example.test'

let stack: TestStack
let app: FastifyInstance
let mailpit: StartedTestContainer
let mailer: Mailer
let mailpitUrl: string
let enqueued: { name: JobName; payload: JobPayload<JobName> }[]

beforeAll(async () => {
  stack = await startTestStack()
  mailpit = await new GenericContainer('axllent/mailpit')
    .withExposedPorts(1025, 8025)
    .withWaitStrategy(Wait.forHttp('/readyz', 8025))
    .start()
  mailpitUrl = `http://${mailpit.getHost()}:${mailpit.getMappedPort(8025)}`
  mailer = createMailer({
    EMAIL_TRANSPORT: 'smtp',
    EMAIL_FROM: 'RePrint <no-reply@reprint.test>',
    SMTP_HOST: mailpit.getHost(),
    SMTP_PORT: mailpit.getMappedPort(1025),
  })
  const env = loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    WEB_ORIGINS: ORIGIN,
    DATABASE_URL: stack.databaseUrl,
    REDIS_URL: stack.redisUrl,
    HIBP_MODE: 'off',
  })
  enqueued = []
  app = await buildApp(env, {
    database: stack.db.db,
    redis: stack.redis,
    jobs: {
      enqueue: async (name, payload) => {
        enqueued.push({ name, payload })
        return String(enqueued.length)
      },
    },
  })
  app.get('/test/start/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string }
    await app.sessions.start(request, reply, userId)
    return { ok: true }
  })
  await app.ready()
})

afterAll(async () => {
  await app?.close()
  mailer?.close()
  await mailpit?.stop()
  await stack?.stop()
})

beforeEach(async () => {
  await stack.reset()
  enqueued.length = 0
})

async function signedInMember() {
  const user = await createTestUser(stack.db.db)
  await stack.db.db
    .update(users)
    .set({ passwordHash: await hashPassword(PASSWORD) })
    .where(eq(users.id, user.id))
  const started = await app.inject({ method: 'GET', url: `/test/start/${user.id}` })
  const cookie = started.cookies.find((c) => c.name === SESSION_COOKIE)?.value ?? ''
  return { user, cookies: { [SESSION_COOKIE]: cookie } }
}

function post(url: string, payload: Record<string, unknown>, cookies?: Record<string, string>) {
  return app.inject({ method: 'POST', url, cookies, headers: { origin: ORIGIN }, payload })
}

function requestChange(cookies: Record<string, string>, body: Record<string, unknown> = {}) {
  return post('/v1/me/email', { currentPassword: PASSWORD, newEmail: NEW_EMAIL, ...body }, cookies)
}

/** The raw token from the link in the queued confirmation email. */
function queuedToken(): string {
  const job = enqueued.find(
    (j) => (j.payload as { template: string }).template === 'email-change-confirm',
  )
  if (!job) throw new Error('no confirmation email was queued')
  const url = (job.payload as { props: { confirmUrl: string } }).props.confirmUrl
  return new URL(url).searchParams.get('token') ?? ''
}

/** Sends every queued email through the real mailer, as the worker would. */
async function deliverQueuedEmails() {
  for (const job of enqueued) {
    const payload = emailSendPayload.parse(job.payload)
    const email = await renderEmail(payload.template, payload.props)
    await mailer.send({ to: payload.to, ...email })
  }
}

async function subjectsFor(address: string): Promise<string[]> {
  const response = await fetch(
    `${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`,
  )
  const body = (await response.json()) as { messages: { Subject: string }[] }
  return body.messages.map((m) => m.Subject)
}

describe('POST /v1/me/email', () => {
  it('leaves the address alone until the link sent to the new address is used', async () => {
    const { user, cookies } = await signedInMember()
    const response = await requestChange(cookies)
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'check_your_email' })

    const [before] = await stack.db.db.select().from(users).where(eq(users.id, user.id))
    expect(before?.email).toBe(user.email)

    const confirmed = await post('/v1/me/email/confirm', { token: queuedToken() })
    expect(confirmed.statusCode).toBe(200)
    expect(confirmed.json()).toEqual({ status: 'email_changed' })
    const [after] = await stack.db.db.select().from(users).where(eq(users.id, user.id))
    expect(after?.email).toBe(NEW_EMAIL)
    expect(after?.emailVerifiedAt).not.toBeNull()
  })

  it('emails both the old and the new address (Mailpit)', async () => {
    const { user, cookies } = await signedInMember()
    await requestChange(cookies)
    await post('/v1/me/email/confirm', { token: queuedToken() })
    await deliverQueuedEmails()

    expect((await subjectsFor(NEW_EMAIL)).sort()).toEqual([
      'Confirm your new email address',
      'Your email address was changed',
    ])
    expect((await subjectsFor(user.email)).sort()).toEqual([
      'Email change requested for your account',
      'Your email address was changed',
    ])
  })

  it('refuses a wrong current password without creating a link', async () => {
    const { cookies } = await signedInMember()
    const response = await requestChange(cookies, { currentPassword: 'not the password at all' })
    expect(response.statusCode).toBe(400)
    expect(problemDetailsSchema.parse(response.json()).errors?.[0]?.path).toBe(
      'body.currentPassword',
    )
    expect(await stack.db.db.select().from(authTokens)).toHaveLength(0)
    expect(enqueued).toHaveLength(0)
  })

  it('rejects an address already in use with 409, in any letter case', async () => {
    const { cookies } = await signedInMember()
    const other = await createTestUser(stack.db.db)
    const response = await requestChange(cookies, { newEmail: other.email.toUpperCase() })
    expect(response.statusCode).toBe(409)
    expect(problemDetailsSchema.parse(response.json()).status).toBe(409)
    expect(enqueued).toHaveLength(0)
  })

  it('rejects unauthenticated callers with 401', async () => {
    const response = await requestChange({})
    expect(response.statusCode).toBe(401)
  })

  it('lets only the newest link work', async () => {
    const { cookies } = await signedInMember()
    await requestChange(cookies)
    const first = queuedToken()
    enqueued.length = 0
    await requestChange(cookies, { newEmail: 'second-choice@example.test' })
    expect((await post('/v1/me/email/confirm', { token: first })).statusCode).toBe(400)
    expect((await post('/v1/me/email/confirm', { token: queuedToken() })).statusCode).toBe(200)
  })

  it('limits requests to 5 per hour per Member', async () => {
    const { cookies } = await signedInMember()
    for (let i = 0; i < 5; i += 1) {
      expect((await requestChange(cookies, { newEmail: `try-${i}@example.test` })).statusCode).toBe(
        200,
      )
    }
    const limited = await requestChange(cookies)
    expect(limited.statusCode).toBe(429)
    expect(limited.headers['retry-after']).toBeDefined()
  })
})

describe('POST /v1/me/email/confirm', () => {
  it('rejects reused, expired, and unknown tokens with 400', async () => {
    const { cookies } = await signedInMember()
    await requestChange(cookies)
    const token = queuedToken()
    expect((await post('/v1/me/email/confirm', { token })).statusCode).toBe(200)
    expect((await post('/v1/me/email/confirm', { token })).statusCode).toBe(400)
    expect((await post('/v1/me/email/confirm', { token: 'nonsense' })).statusCode).toBe(400)

    enqueued.length = 0
    await requestChange(cookies, { newEmail: 'late@example.test' })
    await stack.db.db
      .update(authTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(authTokens.purpose, 'change_email'))
    expect((await post('/v1/me/email/confirm', { token: queuedToken() })).statusCode).toBe(400)
  })

  it('does not accept a verification or reset token', async () => {
    const { user, cookies } = await signedInMember()
    await requestChange(cookies)
    await stack.db.db
      .update(authTokens)
      .set({ purpose: 'verify_email' })
      .where(eq(authTokens.userId, user.id))
    expect((await post('/v1/me/email/confirm', { token: queuedToken() })).statusCode).toBe(400)
  })

  it('refuses the switch when someone took the address in the meantime', async () => {
    const { user, cookies } = await signedInMember()
    await requestChange(cookies)
    await stack.db.db.insert(users).values({
      email: NEW_EMAIL,
      username: 'took_it_first',
      passwordHash: 'x',
      displayName: 'Took It',
    })
    const response = await post('/v1/me/email/confirm', { token: queuedToken() })
    expect(response.statusCode).toBe(400)
    const [after] = await stack.db.db.select().from(users).where(eq(users.id, user.id))
    expect(after?.email).toBe(user.email)
  })
})
