import { getTableColumns } from 'drizzle-orm'
import { getTableConfig, pgTable, text } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { timestamps, uuidv7Pk } from './helpers.js'

const sample = pgTable('sample', { id: uuidv7Pk(), name: text('name'), ...timestamps() })

describe('uuidv7Pk', () => {
  it('is a uuid primary key that generates UUIDv7 values in the app', () => {
    const { id } = getTableColumns(sample)
    expect(id.columnType).toBe('PgUUID')
    expect(id.primary).toBe(true)
    expect(id.defaultFn?.()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/)
  })
})

describe('timestamps', () => {
  it('adds created_at and updated_at as NOT NULL timestamptz', () => {
    const { columns } = getTableConfig(sample)
    for (const name of ['created_at', 'updated_at']) {
      const column = columns.find((c) => c.name === name)
      expect(column?.getSQLType()).toBe('timestamp with time zone')
      expect(column?.notNull).toBe(true)
      expect(column?.hasDefault).toBe(true)
    }
  })

  it('refreshes updated_at on update', () => {
    const { updatedAt } = getTableColumns(sample)
    expect(updatedAt.onUpdateFn?.()).toBeInstanceOf(Date)
  })
})
