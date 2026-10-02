import { auditLog } from '@reprint/db'
import { adminAuditResponseSchema } from '@reprint/shared'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { loadEnv } from '../../config/env.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'
import { createTestUser } from '../../testing/users.js'
import { SESSION_COOKIE } from '../auth/session-cookie.js'
import { csvCell } from './audit.js'

const ORIGIN = 'http://www.reprint.test:5173'

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
  })
  app = await buildApp(env, { database: stack.db.db, redis: stack.redis })
  app.get('/test/start/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string }
    await app.sessions.start(request, reply, userId)
    return { ok: true }
  })
  await app.ready()
})

afterAll(async () => {
  await app?.close()
  await stack?.stop()
})

beforeEach(async () => {
  await stack.reset()
})

async function person(roles: string[] = ['member']) {
  const user = await createTestUser(stack.db.db, { roles })
  const started = await app.inject({ method: 'GET', url: `/test/start/${user.id}` })
  const cookies = {
    [SESSION_COOKIE]: started.cookies.find((c) => c.name === SESSION_COOKIE)?.value ?? '',
  }
  return { user, cookies }
}

const audit = (cookies?: Record<string, string>, query = '') =>
  app.inject({ method: 'GET', url: `/v1/admin/audit${query}`, cookies })
const csv = (cookies?: Record<string, string>, query = '') =>
  app.inject({ method: 'GET', url: `/v1/admin/audit.csv${query}`, cookies })

async function entry(
  actorId: string | null,
  action: string,
  over: Partial<typeof auditLog.$inferInsert> = {},
) {
  const [row] = await stack.db.db
    .insert(auditLog)
    .values({ actorId, action, targetType: 'user', ...over })
    .returning()
  if (!row) throw new Error('seed failed')
  return row
}

describe('GET /v1/admin/audit', () => {
  it('lists entries newest first with actor and before/after for Admins', async () => {
    const admin = await person(['admin'])
    const first = await entry(admin.user.id, 'role.grant', { after: { role: 'moderator' } })
    const second = await entry(admin.user.id, 'user.suspend', {
      before: { status: 'active' },
      after: { status: 'suspended' },
      ip: '203.0.113.9',
    })
    const response = await audit(admin.cookies)
    expect(response.statusCode).toBe(200)
    const body = adminAuditResponseSchema.parse(response.json())
    expect(body.items.map((item) => item.id)).toEqual([second.id, first.id])
    expect(body.items[0]).toMatchObject({
      action: 'user.suspend',
      actor: { id: admin.user.id, username: admin.user.username },
      before: { status: 'active' },
      after: { status: 'suspended' },
      ip: '203.0.113.9',
    })
    expect(body.meta.nextCursor).toBeNull()
  })

  it('filters by actor, action, target, and date range', async () => {
    const admin = await person(['admin'])
    const other = await person(['moderator'])
    const target = other.user.id
    const old = await entry(admin.user.id, 'role.grant', {
      targetId: target,
      createdAt: new Date('2026-01-05T12:00:00Z'),
    })
    const mine = await entry(admin.user.id, 'user.suspend', { targetId: target })
    const theirs = await entry(other.user.id, 'review.approve', { targetType: 'review' })

    const ids = async (query: string) =>
      adminAuditResponseSchema
        .parse((await audit(admin.cookies, query)).json())
        .items.map((i) => i.id)
    expect(await ids(`?actor=${other.user.username}`)).toEqual([theirs.id])
    expect(await ids('?action=role.grant')).toEqual([old.id])
    expect(await ids('?targetType=review')).toEqual([theirs.id])
    expect(await ids(`?targetId=${target}`)).toEqual([mine.id, old.id])
    expect(await ids('?from=2026-01-05&to=2026-01-05')).toEqual([old.id])
    expect(await ids('?to=2026-01-04')).toEqual([])
  })

  it('pages with a cursor', async () => {
    const admin = await person(['admin'])
    const rows = [
      await entry(admin.user.id, 'role.grant'),
      await entry(admin.user.id, 'role.remove'),
      await entry(admin.user.id, 'user.suspend'),
    ]
    const one = adminAuditResponseSchema.parse((await audit(admin.cookies, '?limit=2')).json())
    expect(one.items.map((i) => i.id)).toEqual([rows[2]?.id, rows[1]?.id])
    expect(one.meta.nextCursor).not.toBeNull()
    const two = adminAuditResponseSchema.parse(
      (await audit(admin.cookies, `?limit=2&cursor=${one.meta.nextCursor}`)).json(),
    )
    expect(two.items.map((i) => i.id)).toEqual([rows[0]?.id])
    expect(two.meta.nextCursor).toBeNull()
  })

  it('rejects a bad cursor and an unknown action with 400', async () => {
    const admin = await person(['admin'])
    expect((await audit(admin.cookies, '?cursor=nope')).statusCode).toBe(400)
    expect((await audit(admin.cookies, '?action=nuke')).statusCode).toBe(400)
  })

  it('denies Moderators and Members with 403 and Visitors with 401', async () => {
    const moderator = await person(['moderator'])
    const member = await person()
    expect((await audit(moderator.cookies)).statusCode).toBe(403)
    expect((await audit(member.cookies)).statusCode).toBe(403)
    expect((await audit()).statusCode).toBe(401)
  })
})

describe('GET /v1/admin/audit.csv', () => {
  it('streams the filtered rows with a header row, escaped, and guards against formula injection', async () => {
    const admin = await person(['admin'])
    await entry(admin.user.id, 'role.grant')
    await entry(admin.user.id, 'user.suspend', {
      before: { reason: '=HYPERLINK("http://evil.example")' },
      after: { note: 'a, b' },
      ip: '+1.2.3.4',
    })
    const response = await csv(admin.cookies, '?action=user.suspend')
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/csv')
    expect(response.headers['content-disposition']).toContain('attachment')
    const lines = response.body.split('\r\n').filter(Boolean)
    expect(lines[0]).toBe('id,created_at,actor,action,target_type,target_id,ip,before,after')
    expect(lines).toHaveLength(2)
    const row = lines[1] ?? ''
    expect(row).toContain(`,${admin.user.username},user.suspend,user,,'+1.2.3.4,`)
    expect(row).toContain('"{""reason"":""=HYPERLINK(')
    expect(row).toContain('"{""note"":""a, b""}"')
  })

  it('prefixes cells that start with a formula character', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(csvCell('@cmd')).toBe("'@cmd")
    expect(csvCell('-1')).toBe("'-1")
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell(null)).toBe('')
  })

  it('exports more rows than one batch', async () => {
    const admin = await person(['admin'])
    await stack.db.db.insert(auditLog).values(
      Array.from({ length: 1200 }, () => ({
        actorId: admin.user.id,
        action: 'role.grant',
        targetType: 'user',
      })),
    )
    const response = await csv(admin.cookies)
    expect(response.body.split('\r\n').filter(Boolean)).toHaveLength(1201)
  })

  it('denies Moderators and Members with 403 and Visitors with 401', async () => {
    const moderator = await person(['moderator'])
    expect((await csv(moderator.cookies)).statusCode).toBe(403)
    expect((await csv()).statusCode).toBe(401)
  })
})
