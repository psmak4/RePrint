import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { startTestStack, type TestStack } from './stack.js'

let stack: TestStack

beforeAll(async () => {
  stack = await startTestStack()
  await stack.db.sql`create table harness_scratch (id int primary key)`
})

afterAll(async () => {
  await stack?.stop()
})

beforeEach(async () => {
  await stack.reset()
})

describe('startTestStack', () => {
  it('runs Postgres 18 with migrations applied and Redis 7', async () => {
    const [row] = await stack.db.sql<
      { version: string }[]
    >`select current_setting('server_version') as version`
    expect(row?.version).toMatch(/^18\./)
    const extensions = await stack.db.sql<{ extname: string }[]>`select extname from pg_extension`
    expect(extensions.map((e) => e.extname)).toEqual(expect.arrayContaining(['citext']))
    expect(await stack.redis.info('server')).toMatch(/redis_version:7\./)
  })

  it('isolates data between tests (first test writes)', async () => {
    await stack.db.sql`insert into harness_scratch values (1)`
    await stack.redis.set('scratch', 'one')
    expect(await stack.redis.get('scratch')).toBe('one')
  })

  it('isolates data between tests (second test sees nothing)', async () => {
    const rows = await stack.db.sql`select id from harness_scratch`
    expect(rows).toHaveLength(0)
    expect(await stack.redis.get('scratch')).toBeNull()
  })

  it('keeps the migration history when resetting', async () => {
    const rows = await stack.db.sql`select id from drizzle.__drizzle_migrations`
    expect(rows.length).toBeGreaterThanOrEqual(1)
  })
})
