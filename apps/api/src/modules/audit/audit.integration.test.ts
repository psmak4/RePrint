import { auditLog, newId, users } from '@reprint/db'
import { AUDIT_ACTIONS } from '@reprint/shared'
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { startTestStack, type TestStack } from '../../testing/stack.js'
import { createTestUser } from '../../testing/users.js'
import { recordAudit } from './audit.js'

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

/** Drizzle wraps driver errors, so the trigger's message is on `cause`. */
async function expectRefused(statement: Promise<unknown>) {
  const error = await statement.then(
    () => null,
    (e: unknown) => e as Error & { cause?: Error },
  )
  expect(error, 'statement was allowed').not.toBeNull()
  expect(error?.cause?.message ?? error?.message).toMatch(/append-only/)
}

async function newActor() {
  return (await createTestUser(stack.db.db, { roles: ['moderator'] })).id
}

async function insertRow(actorId: string, ip: string | null = '203.0.113.9') {
  const targetId = newId()
  await stack.db.db.transaction((tx) =>
    recordAudit(tx, {
      actorId,
      action: 'review.approve',
      targetType: 'review',
      targetId,
      before: { status: 'pending' },
      after: { status: 'approved' },
      ip,
    }),
  )
  return targetId
}

describe('recordAudit', () => {
  it('writes the row with its before and after values', async () => {
    const actorId = await newActor()
    const targetId = await insertRow(actorId)
    const [row] = await stack.db.db.select().from(auditLog).where(eq(auditLog.targetId, targetId))
    expect(row).toMatchObject({
      actorId,
      action: 'review.approve',
      targetType: 'review',
      before: { status: 'pending' },
      after: { status: 'approved' },
      ip: '203.0.113.9',
    })
    expect(row?.createdAt).toBeInstanceOf(Date)
  })

  it('commits and rolls back with the caller transaction', async () => {
    const actorId = await newActor()
    await expect(
      stack.db.db.transaction(async (tx) => {
        await recordAudit(tx, { actorId, action: 'review.reject', targetType: 'review' })
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(await stack.db.db.select().from(auditLog)).toHaveLength(0)

    await stack.db.db.transaction((tx) =>
      recordAudit(tx, { actorId, action: 'review.reject', targetType: 'review' }),
    )
    const rows = await stack.db.db.select().from(auditLog)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ targetId: null, before: null, after: null, ip: null })
  })

  it('lists D-036 actions without claims or reads', () => {
    expect(AUDIT_ACTIONS).toContain('review.approve')
    expect(AUDIT_ACTIONS.some((a) => a.includes('claim') || a.includes('read'))).toBe(false)
  })
})

describe('audit_log is append-only', () => {
  it('refuses UPDATE of any recorded field', async () => {
    const actorId = await newActor()
    const targetId = await insertRow(actorId)
    for (const change of [
      sql`action = 'review.reject'`,
      sql`after = '{"status":"rejected"}'::jsonb`,
      sql`created_at = now() - interval '1 day'`,
      sql`actor_id = ${newId()}`,
    ]) {
      await expectRefused(
        stack.db.db.execute(sql`update audit_log set ${change} where target_id = ${targetId}`),
      )
    }
  })

  it('refuses DELETE', async () => {
    const actorId = await newActor()
    const targetId = await insertRow(actorId)
    await expectRefused(
      stack.db.db.execute(sql`delete from audit_log where target_id = ${targetId}`),
    )
    expect(await stack.db.db.select().from(auditLog)).toHaveLength(1)
  })

  it('allows clearing the IP only once the row is 90 days old (D-042)', async () => {
    const actorId = await newActor()
    const targetId = await insertRow(actorId)
    await expectRefused(
      stack.db.db.execute(sql`update audit_log set ip = null where target_id = ${targetId}`),
    )

    // Age the row past 90 days by disabling the guard for this fixture only.
    await stack.db.db.transaction(async (tx) => {
      await tx.execute(sql`alter table audit_log disable trigger audit_log_append_only`)
      await tx.execute(
        sql`update audit_log set created_at = now() - interval '91 days' where target_id = ${targetId}`,
      )
      await tx.execute(sql`alter table audit_log enable trigger audit_log_append_only`)
    })
    await stack.db.db.execute(sql`update audit_log set ip = null where target_id = ${targetId}`)
    const [row] = await stack.db.db.select().from(auditLog).where(eq(auditLog.targetId, targetId))
    expect(row?.ip).toBeNull()
    await expectRefused(
      stack.db.db.execute(
        sql`update audit_log set ip = '198.51.100.1' where target_id = ${targetId}`,
      ),
    )
  })

  it('keeps the rows when the actor account is erased, clearing only actor_id', async () => {
    const actorId = await newActor()
    const targetId = await insertRow(actorId)
    await stack.db.db.delete(users).where(eq(users.id, actorId))
    const [row] = await stack.db.db.select().from(auditLog).where(eq(auditLog.targetId, targetId))
    expect(row).toMatchObject({ actorId: null, action: 'review.approve' })
  })
})
