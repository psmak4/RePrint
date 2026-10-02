import { auditLog, newId, sessions } from '@reprint/db'
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { jobs } from '../../jobs/registry.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'
import { createTestUser } from '../../testing/users.js'
import { recordAudit } from './audit.js'
import { clearOldIps } from './retention.js'

const DAY_MS = 86_400_000

let stack: TestStack

beforeAll(async () => {
  stack = await startTestStack()
})

afterAll(async () => {
  await stack?.stop()
})

beforeEach(async () => {
  await stack.reset()
})

async function seedSession(userId: string, ageDays: number) {
  const [row] = await stack.db.db
    .insert(sessions)
    .values({
      tokenHash: newId(),
      userId,
      expiresAt: new Date(Date.now() + DAY_MS),
      ip: '203.0.113.9',
      createdAt: new Date(Date.now() - ageDays * DAY_MS),
    })
    .returning({ id: sessions.id })
  return row?.id ?? ''
}

async function seedAudit(actorId: string, ageDays: number) {
  const targetId = newId()
  await stack.db.db.transaction((tx) =>
    recordAudit(tx, {
      actorId,
      action: 'review.approve',
      targetType: 'review',
      targetId,
      ip: '203.0.113.9',
    }),
  )
  // Age the row by disabling the guard for this fixture only.
  await stack.db.db.transaction(async (tx) => {
    await tx.execute(sql`alter table audit_log disable trigger audit_log_append_only`)
    await tx.execute(
      sql`update audit_log set created_at = now() - make_interval(days => ${ageDays}) where target_id = ${targetId}`,
    )
    await tx.execute(sql`alter table audit_log enable trigger audit_log_append_only`)
  })
  return targetId
}

const sessionIp = async (id: string) =>
  (await stack.db.db.select().from(sessions).where(eq(sessions.id, id)))[0]?.ip
const auditIp = async (targetId: string) =>
  (await stack.db.db.select().from(auditLog).where(eq(auditLog.targetId, targetId)))[0]?.ip

describe('clearOldIps', () => {
  it('clears IPs older than 90 days and keeps newer ones', async () => {
    const user = await createTestUser(stack.db.db, { roles: ['moderator'] })
    const oldSession = await seedSession(user.id, 91)
    const newSession = await seedSession(user.id, 10)
    const oldAudit = await seedAudit(user.id, 91)
    const newAudit = await seedAudit(user.id, 10)

    expect(await clearOldIps(stack.db.db)).toEqual({ sessions: 1, auditLog: 1 })

    expect(await sessionIp(oldSession)).toBeNull()
    expect(await sessionIp(newSession)).toBe('203.0.113.9')
    expect(await auditIp(oldAudit)).toBeNull()
    expect(await auditIp(newAudit)).toBe('203.0.113.9')
    expect(await clearOldIps(stack.db.db)).toEqual({ sessions: 0, auditLog: 0 })
  })

  it('honors a clock override and leaves every other audit column alone', async () => {
    const user = await createTestUser(stack.db.db, { roles: ['moderator'] })
    const session = await seedSession(user.id, 10)
    const targetId = await seedAudit(user.id, 10)

    expect(await clearOldIps(stack.db.db, new Date(Date.now() + 75 * DAY_MS))).toEqual({
      sessions: 0,
      auditLog: 0,
    })
    // A clock past the database's is capped at the database's, which the trigger also uses.
    expect(await clearOldIps(stack.db.db, new Date(Date.now() + 100 * DAY_MS))).toEqual({
      sessions: 1,
      auditLog: 0,
    })
    expect(await sessionIp(session)).toBeNull()
    const [row] = await stack.db.db.select().from(auditLog).where(eq(auditLog.targetId, targetId))
    expect(row).toMatchObject({ action: 'review.approve', ip: '203.0.113.9' })
  })

  it('still refuses any other audit_log change', async () => {
    const user = await createTestUser(stack.db.db, { roles: ['moderator'] })
    const targetId = await seedAudit(user.id, 91)
    await clearOldIps(stack.db.db)
    await expect(
      stack.db.db.execute(sql`update audit_log set action = 'x' where target_id = ${targetId}`),
    ).rejects.toThrow()
    await expect(
      stack.db.db.execute(sql`delete from audit_log where target_id = ${targetId}`),
    ).rejects.toThrow()
  })
})

describe('privacy.clearOldIps job', () => {
  it('is scheduled daily and runs the clear', async () => {
    const job = jobs['privacy.clearOldIps']
    expect(job.schedule?.everyMs).toBe(DAY_MS)
    const user = await createTestUser(stack.db.db)
    const old = await seedSession(user.id, 100)
    const log = { info: () => undefined } as never
    const result = await job.handler({}, { db: stack.db.db, log } as unknown as Parameters<
      typeof job.handler
    >[1])
    expect(result.sessions).toBe(1)
    expect(await sessionIp(old)).toBeNull()
  })
})
