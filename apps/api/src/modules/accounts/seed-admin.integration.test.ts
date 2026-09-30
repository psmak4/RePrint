import { roles, userRoles, users } from '@reprint/db'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startTestStack, type TestStack } from '../../testing/stack.js'
import { verifyPassword } from '../auth/password.js'
import { createFirstAdmin, SeedAdminError } from './seed-admin.js'

let stack: TestStack

beforeAll(async () => {
  stack = await startTestStack()
})
afterAll(async () => {
  await stack.stop()
})

const input = {
  email: 'root@example.test',
  username: 'root_admin',
  password: 'correct horse battery',
}

describe('createFirstAdmin', () => {
  it('rejects input that fails the account rules before touching the database', async () => {
    await expect(
      createFirstAdmin(stack.db.db, { ...input, username: 'no', password: 'short' }),
    ).rejects.toThrow(SeedAdminError)
    expect(await stack.db.db.select().from(users)).toHaveLength(0)
  })

  it('creates a verified Admin with the Member and Admin roles and an Argon2id hash', async () => {
    const created = await createFirstAdmin(stack.db.db, input)
    const [user] = await stack.db.db.select().from(users).where(eq(users.id, created.id))
    expect(user?.emailVerifiedAt).not.toBeNull()
    expect(user?.status).toBe('active')
    expect(user?.passwordHash.startsWith('$argon2id$')).toBe(true)
    expect(await verifyPassword(user?.passwordHash ?? '', input.password)).toBe(true)
    const granted = await stack.db.db
      .select({ name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(userRoles.userId, created.id))
    expect(granted.map((r) => r.name).sort()).toEqual(['admin', 'member'])
  })

  it('refuses once an Admin exists, and changes nothing', async () => {
    await expect(
      createFirstAdmin(stack.db.db, {
        email: 'second@example.test',
        username: 'second_admin',
        password: 'another long password',
      }),
    ).rejects.toThrow('An Admin already exists')
    expect(await stack.db.db.select().from(users)).toHaveLength(1)
  })
})
