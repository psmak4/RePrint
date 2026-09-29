import {
  ALL_PERMISSIONS,
  AUTH_TOKEN_PURPOSES,
  ROLE_PERMISSIONS,
  type RoleName,
  USER_STATUSES,
} from '@reprint/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startTestDatabase, type TestDatabase, truncateAllTables } from '../testing/postgres.js'

let database: TestDatabase

beforeAll(async () => {
  database = await startTestDatabase()
})

afterAll(async () => {
  await database?.stop()
})

async function insertUser(fields: { email?: string; username?: string; status?: string } = {}) {
  const [row] = await database.sql<{ id: string }[]>`
    insert into users (id, email, username, password_hash, display_name, status)
    values (uuidv7(), ${fields.email ?? 'ada@example.com'}, ${fields.username ?? 'Ada'}, 'x', 'Ada',
      ${fields.status ?? 'active'})
    returning id`
  return row?.id ?? ''
}

describe('accounts schema', () => {
  it('creates every accounts table', async () => {
    const rows = await database.sql<{ tablename: string }[]>`
      select tablename from pg_tables where schemaname = 'public'`
    const names = rows.map((r) => r.tablename)
    for (const table of [
      'users',
      'roles',
      'permissions',
      'role_permissions',
      'user_roles',
      'sessions',
      'auth_tokens',
      'notifications',
    ]) {
      expect(names).toContain(table)
    }
  })

  describe('seeded roles', () => {
    it('inserts Member, Moderator, and Admin', async () => {
      const rows = await database.sql<{ name: string }[]>`select name from roles order by name`
      expect(rows.map((r) => r.name)).toEqual(['admin', 'member', 'moderator'])
    })

    it('inserts exactly the permissions in packages/shared', async () => {
      const rows = await database.sql<{ name: string }[]>`select name from permissions`
      expect(rows.map((r) => r.name).sort()).toEqual([...ALL_PERMISSIONS].sort())
    })

    it.each(Object.keys(ROLE_PERMISSIONS) as RoleName[])(
      'grants %s exactly the PRD §4 permissions',
      async (role) => {
        const rows = await database.sql<{ name: string }[]>`
        select p.name from role_permissions rp
        join roles r on r.id = rp.role_id
        join permissions p on p.id = rp.permission_id
        where r.name = ${role}`
        expect(rows.map((r) => r.name).sort()).toEqual([...ROLE_PERMISSIONS[role]].sort())
      },
    )

    it('keeps the seeded rows when tests truncate the database', async () => {
      await truncateAllTables(database.sql)
      const [row] = await database.sql<{ n: number }[]>`select count(*)::int as n from roles`
      expect(row?.n).toBe(3)
    })
  })

  describe('users', () => {
    it('treats email and username as case-insensitive unique', async () => {
      await truncateAllTables(database.sql)
      await insertUser({ email: 'Ada@Example.com', username: 'Ada' })
      await expect(insertUser({ email: 'ada@example.COM', username: 'other' })).rejects.toThrow(
        /users_email_unique/,
      )
      await expect(insertUser({ email: 'b@example.com', username: 'ADA' })).rejects.toThrow(
        /users_username_unique/,
      )
    })

    it('allows only the statuses in packages/shared', async () => {
      await truncateAllTables(database.sql)
      for (const [i, status] of USER_STATUSES.entries()) {
        await insertUser({ email: `s${i}@example.com`, username: `s${i}`, status })
      }
      await expect(insertUser({ status: 'banned' })).rejects.toThrow(/users_status_check/)
    })

    it('has the notification preference column defaulting to on (D-032)', async () => {
      await truncateAllTables(database.sql)
      const id = await insertUser()
      const [row] = await database.sql<{ email_review_decisions: boolean }[]>`
        select email_review_decisions from users where id = ${id}`
      expect(row?.email_review_decisions).toBe(true)
    })

    it('rejects a bio over 280 characters', async () => {
      await truncateAllTables(database.sql)
      const id = await insertUser()
      await expect(
        database.sql`update users set bio = ${'x'.repeat(281)} where id = ${id}`,
      ).rejects.toThrow(/users_bio_length_check/)
    })
  })

  describe('dependent rows', () => {
    it('cascades from users to sessions, auth tokens, notifications, and user roles', async () => {
      await truncateAllTables(database.sql)
      const id = await insertUser()
      await database.sql`insert into user_roles (user_id, role_id)
        select ${id}, id from roles where name = 'member'`
      await database.sql`insert into sessions (id, token_hash, user_id, expires_at)
        values (uuidv7(), 'hash-1', ${id}, now() + interval '30 days')`
      await database.sql`insert into auth_tokens (id, user_id, token_hash, purpose, expires_at)
        values (uuidv7(), ${id}, 'hash-2', ${AUTH_TOKEN_PURPOSES[0]}, now() + interval '1 day')`
      await database.sql`insert into notifications (id, user_id, type)
        values (uuidv7(), ${id}, 'password_changed')`
      await database.sql`delete from users where id = ${id}`
      for (const table of ['user_roles', 'sessions', 'auth_tokens', 'notifications']) {
        const [row] = await database.sql<{ n: number }[]>`
          select count(*)::int as n from ${database.sql(table)}`
        expect(row?.n, table).toBe(0)
      }
    })

    it('rejects an unknown auth token purpose', async () => {
      await truncateAllTables(database.sql)
      const id = await insertUser()
      await expect(
        database.sql`insert into auth_tokens (id, user_id, token_hash, purpose, expires_at)
          values (uuidv7(), ${id}, 'hash-3', 'nope', now())`,
      ).rejects.toThrow(/auth_tokens_purpose_check/)
    })
  })
})
