import { COVER_ORIGINS } from '@reprint/shared'
import { sql } from 'drizzle-orm'
import { check, integer, pgTable, text } from 'drizzle-orm/pg-core'
import { timestamptz, uuidv7Pk } from './helpers.js'

/** Cover and author images, and Member avatars (PRD §9, D-030). */
export const covers = pgTable(
  'covers',
  {
    id: uuidv7Pk(),
    origin: text('origin', { enum: COVER_ORIGINS }).notNull(),
    /** The origin's own reference, such as a cover ID; empty for uploads. */
    originRef: text('origin_ref'),
    /** Object key in our storage; set for uploads only. */
    r2Key: text('r2_key').unique(),
    width: integer('width'),
    height: integer('height'),
    createdAt: timestamptz('created_at').notNull().default(sql`now()`),
  },
  (t) => [
    check('covers_origin_check', sql`${t.origin} in ('open_library', 'upload')`),
    check('covers_upload_key_check', sql`${t.origin} <> 'upload' or ${t.r2Key} is not null`),
  ],
)
