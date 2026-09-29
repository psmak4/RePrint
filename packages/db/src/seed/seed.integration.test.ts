import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb } from '../client.js'
import { startTestDatabase, type TestDatabase } from '../testing/index.js'
import type { SeedModule } from './registry.js'
import { resetDatabase, runSeed } from './run.js'

// A throwaway table stands in for real seed data until later milestones add schema.
const modules: SeedModule[] = [
  {
    name: 'sample',
    async run({ db, random }) {
      await db.execute(
        sql`create table if not exists seed_sample (id uuid primary key, n int not null)`,
      )
      for (let i = 0; i < 5; i++) {
        await db.execute(
          sql`insert into seed_sample (id, n) values (${random.id()}, ${random.int(1, 1000)})`,
        )
      }
    },
  },
]

let database: TestDatabase

beforeAll(async () => {
  database = await startTestDatabase()
})
afterAll(async () => {
  await database.stop()
})

async function snapshot() {
  const { sql: client, close } = createDb(database.url, { max: 1 })
  try {
    return await client`select id, n from seed_sample order by id`
  } finally {
    await close()
  }
}

describe('db reset', () => {
  it('gives identical row counts and IDs when run twice', async () => {
    await resetDatabase(database.url, { modules })
    const first = await snapshot()
    await resetDatabase(database.url, { modules })
    const second = await snapshot()
    expect(first).toHaveLength(5)
    expect(second).toEqual(first)
  })

  it('rolls back the whole seed when a module fails', async () => {
    await resetDatabase(database.url, { modules })
    const failing: SeedModule = {
      name: 'failing',
      run: async () => {
        throw new Error('boom')
      },
    }
    await expect(runSeed(database.url, { modules: [failing] })).rejects.toThrow('boom')
    expect(await snapshot()).toHaveLength(5)
  })
})
