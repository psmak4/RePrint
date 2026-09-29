import { type Database, newId, roles, userRoles, users } from '@reprint/db'
import type { UserStatus } from '@reprint/shared'
import { inArray } from 'drizzle-orm'

export interface TestUserOptions {
  /** Seeded role names to grant (`member`, `moderator`, `admin`). Defaults to `member`. */
  roles?: string[]
  verified?: boolean
  status?: UserStatus
}

/** Inserts a user directly, for tests that need an account without going through registration. */
export async function createTestUser(db: Database, options: TestUserOptions = {}) {
  const id = newId()
  const suffix = id.slice(-8)
  const [user] = await db
    .insert(users)
    .values({
      id,
      email: `user-${suffix}@example.test`,
      username: `user_${suffix}`,
      passwordHash: 'not-a-real-hash',
      displayName: `User ${suffix}`,
      emailVerifiedAt: options.verified === false ? null : new Date(),
      status: options.status ?? 'active',
    })
    .returning()
  if (!user) throw new Error('failed to insert test user')
  const roleNames = options.roles ?? ['member']
  const roleRows = await db.select().from(roles).where(inArray(roles.name, roleNames))
  if (roleRows.length > 0) {
    await db.insert(userRoles).values(roleRows.map((role) => ({ userId: id, roleId: role.id })))
  }
  return user
}
