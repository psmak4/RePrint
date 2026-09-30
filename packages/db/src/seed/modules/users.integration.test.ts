import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb } from '../../client.js'
import { startTestDatabase, type TestDatabase } from '../../testing/index.js'
import { resetDatabase } from '../run.js'
import { SEED_USER_COUNT } from './users.js'

let database: TestDatabase

beforeAll(async () => {
  database = await startTestDatabase()
})
afterAll(async () => {
  await database.stop()
})

async function read() {
  const { sql: client, close } = createDb(database.url, { max: 1 })
  try {
    const rows =
      await client`select id, username, status, email_verified_at is not null as verified from users order by id`
    const grants = await client`
      select r.name, count(*)::int as n from user_roles ur join roles r on r.id = ur.role_id group by r.name order by r.name`
    return { rows, grants }
  } finally {
    await close()
  }
}

describe('users seed', () => {
  it('seeds 50 accounts covering every kind, identically on every reset', async () => {
    await resetDatabase(database.url)
    const first = await read()
    expect(first.rows).toHaveLength(SEED_USER_COUNT)
    const count = (predicate: (r: (typeof first.rows)[number]) => boolean) =>
      first.rows.filter(predicate).length
    expect(count((r) => r.status === 'suspended')).toBeGreaterThan(0)
    expect(count((r) => r.status === 'deleted')).toBeGreaterThan(0)
    expect(count((r) => r.status === 'active' && !r.verified)).toBeGreaterThan(0)
    expect(Object.fromEntries(first.grants.map((g) => [g.name, g.n]))).toEqual({
      admin: 2,
      member: SEED_USER_COUNT,
      moderator: 3,
    })

    await resetDatabase(database.url)
    expect(await read()).toEqual(first)
  })

  it('leaves the database usable for a second query', async () => {
    const { sql: client, close } = createDb(database.url, { max: 1 })
    try {
      const [row] =
        await client`select count(*)::int as n from users where email like '%@example.test'`
      expect(row?.n).toBe(SEED_USER_COUNT)
    } finally {
      await close()
    }
  })
})
