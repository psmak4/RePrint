import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { findConventionViolations } from '../testing/conventions.js'
import { startTestDatabase, type TestDatabase } from '../testing/postgres.js'

let database: TestDatabase

beforeAll(async () => {
  database = await startTestDatabase()
})

afterAll(async () => {
  await database?.stop()
})

// PRD §9: every foreign key is indexed and every timestamp is timestamptz.
describe('schema conventions', () => {
  it('the migrated schema has no violations', async () => {
    expect(await findConventionViolations(database.sql)).toEqual([])
  })

  describe('the checker itself', () => {
    beforeAll(async () => {
      await database.sql.unsafe(`
        create schema conv_bad;
        create table conv_bad.parent (id uuid primary key);
        create table conv_bad.child (
          id uuid primary key,
          parent_id uuid not null references conv_bad.parent (id),
          seen_at timestamp not null
        );
        create schema conv_good;
        create table conv_good.parent (id uuid primary key);
        create table conv_good.child (
          id uuid primary key,
          parent_id uuid not null references conv_good.parent (id),
          seen_at timestamptz not null
        );
        create index child_parent_id_idx on conv_good.child (parent_id);
      `)
    })

    it('flags an unindexed foreign key and a timestamp without time zone', async () => {
      const violations = await findConventionViolations(database.sql, 'conv_bad')
      expect(violations.map((v) => v.rule).sort()).toEqual(['fk-index', 'timestamptz'])
    })

    it('accepts an indexed foreign key and timestamptz', async () => {
      expect(await findConventionViolations(database.sql, 'conv_good')).toEqual([])
    })
  })
})
