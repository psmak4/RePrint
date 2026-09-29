import { sql } from 'drizzle-orm'
import { customType, timestamp, uuid } from 'drizzle-orm/pg-core'
import { newId } from '../ids.js'

/** Primary key column: UUIDv7 generated in the app (PRD §9). */
export const uuidv7Pk = (name = 'id') =>
  uuid(name)
    .primaryKey()
    .$defaultFn(() => newId())

/** A `timestamptz` column. Postgres stores UTC; the client reads and writes `Date`s (PRD §9). */
export const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })

/** `created_at` and `updated_at`, both `timestamptz` NOT NULL, set by the database on insert. */
export const timestamps = () => ({
  createdAt: timestamptz('created_at').notNull().default(sql`now()`),
  updatedAt: timestamptz('updated_at')
    .notNull()
    .default(sql`now()`)
    .$onUpdate(() => new Date()),
})

/** Case-insensitive text (the `citext` extension, enabled by the first migration). */
export const citext = customType<{ data: string }>({
  dataType: () => 'citext',
})
