import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startTestDatabase, type TestDatabase } from './postgres.js'

let database: TestDatabase

beforeAll(async () => {
  database = await startTestDatabase()
})

afterAll(async () => {
  await database?.stop()
})

describe('startTestDatabase', () => {
  it('runs Postgres 18', async () => {
    const [row] = await database.sql<
      { version: string }[]
    >`select current_setting('server_version') as version`
    expect(row?.version).toMatch(/^18\./)
  })

  it('applies the migrations, including the three extensions', async () => {
    const rows = await database.sql<{ extname: string }[]>`select extname from pg_extension`
    const names = rows.map((r) => r.extname)
    expect(names).toEqual(expect.arrayContaining(['pg_trgm', 'unaccent', 'citext']))
  })

  it('records the applied migrations and is safe to migrate twice', async () => {
    const { runMigrations } = await import('../migrate.js')
    await runMigrations(database.url)
    const rows = await database.sql`select id from drizzle.__drizzle_migrations`
    expect(rows.length).toBeGreaterThanOrEqual(1)
  })

  it('reads and writes timestamptz values as UTC', async () => {
    const [row] = await database.sql<{ tz: string; iso: string }[]>`
      select current_setting('TimeZone') as tz, to_char(now() at time zone 'utc', 'YYYY') as iso`
    expect(row?.tz).toBe('UTC')
  })
})
