import { sql } from 'drizzle-orm'
import { index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { users } from './accounts.js'
import { timestamptz, uuidv7Pk } from './helpers.js'

/**
 * Record of elevated actions (PRD §4, §9, D-036). Append-only: a trigger in the migration rejects
 * UPDATE and DELETE, except clearing `ip` after 90 days (D-042) and clearing `actor_id` when the
 * actor's account is erased (D-037). `action` and `target_type` are free text here; the allowed
 * names live in `@reprint/shared` so a new action needs no migration.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuidv7Pk(),
    /** The Moderator or Admin; null once their account is erased. */
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: uuid('target_id'),
    before: jsonb('before').$type<Record<string, unknown> | null>(),
    after: jsonb('after').$type<Record<string, unknown> | null>(),
    ip: text('ip'),
    createdAt: timestamptz('created_at').notNull().default(sql`now()`),
  },
  (t) => [
    index('audit_log_actor_id_created_at_idx').on(t.actorId, t.createdAt),
    index('audit_log_target_idx').on(t.targetType, t.targetId),
    index('audit_log_created_at_idx').on(t.createdAt),
  ],
)

export type AuditLogRow = typeof auditLog.$inferSelect
