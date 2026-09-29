import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema/index.js'

export type Database = ReturnType<typeof drizzle<typeof schema>>

export interface DbClient {
  db: Database
  /** The underlying postgres.js client, for raw catalog queries and shutdown. */
  sql: postgres.Sql
  close: () => Promise<void>
}

export interface CreateDbOptions {
  /** Maximum pool size. */
  max?: number
}

/** Connects with the session time zone pinned to UTC (PRD §9). Parameters are always bound, never interpolated. */
export function createDb(url: string, options: CreateDbOptions = {}): DbClient {
  const client = postgres(url, {
    max: options.max ?? 10,
    connection: { TimeZone: 'UTC' },
    onnotice: () => {},
  })
  const db = drizzle(client, { schema })
  return { db, sql: client, close: () => client.end({ timeout: 5 }) }
}
