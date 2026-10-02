import { Readable } from 'node:stream'
import { auditLog, type Database, users } from '@reprint/db'
import {
  type AdminAuditFilters,
  type AdminAuditResponse,
  type AuditAction,
  type AuditTargetType,
  adminAuditFiltersSchema,
  adminAuditQuerySchema,
  adminAuditResponseSchema,
} from '@reprint/shared'
import { and, desc, eq, gte, lt, type SQL, sql } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { requirePermission } from '../auth/guards.js'
import type { AuthRoutesOptions } from '../auth/register.js'
import { decodeCursor, encodeCursor } from '../moderation/cursor.js'

const DAY_MS = 86_400_000
const CSV_BATCH = 500
const CSV_HEADER = [
  'id',
  'created_at',
  'actor',
  'action',
  'target_type',
  'target_id',
  'ip',
  'before',
  'after',
]

function conditionsFor(filters: AdminAuditFilters): SQL[] {
  const conditions: SQL[] = []
  if (filters.actor) conditions.push(eq(users.username, filters.actor))
  if (filters.action) conditions.push(eq(auditLog.action, filters.action))
  if (filters.targetType) conditions.push(eq(auditLog.targetType, filters.targetType))
  if (filters.targetId) conditions.push(eq(auditLog.targetId, filters.targetId))
  if (filters.from) conditions.push(gte(auditLog.createdAt, new Date(`${filters.from}T00:00:00Z`)))
  if (filters.to) {
    conditions.push(
      lt(auditLog.createdAt, new Date(Date.parse(`${filters.to}T00:00:00Z`) + DAY_MS)),
    )
  }
  return conditions
}

/** One page of audit rows, newest first; `after` is the previous page's last row. */
async function fetchPage(
  db: Database,
  filters: AdminAuditFilters,
  after: { at: string; id: string } | null,
  limit: number,
) {
  const conditions = conditionsFor(filters)
  if (after) {
    conditions.push(
      sql`(${auditLog.createdAt}, ${auditLog.id}) < (${after.at}::timestamptz, ${after.id}::uuid)`,
    )
  }
  const rows = await db
    .select({
      entry: auditLog,
      actorName: users.username,
      createdAtText: sql<string>`${auditLog.createdAt}::text`,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(and(...conditions))
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(limit + 1)
  const page = rows.slice(0, limit)
  const last = page.at(-1)
  return { page, next: rows.length > limit && last ? last : null }
}

/**
 * A CSV cell. A value that starts with a formula character is prefixed with an apostrophe so a
 * spreadsheet shows it as text (CSV injection); values with commas, quotes, or line breaks are quoted.
 */
export function csvCell(value: string | null): string {
  if (value === null || value === '') return ''
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

const csvRow = (cells: (string | null)[]) => `${cells.map(csvCell).join(',')}\r\n`

/** The audit log: filtered, paged, and exported (PRD §7.11, D-154). Needs `audit.view`. */
export const adminAuditRoutes: FastifyPluginAsyncZod<AuthRoutesOptions> = async (app, options) => {
  const { db } = options
  const view = requirePermission('audit.view')

  app.get(
    '/admin/audit',
    {
      preHandler: [view],
      schema: { querystring: adminAuditQuerySchema, response: { 200: adminAuditResponseSchema } },
    },
    async (request): Promise<AdminAuditResponse> => {
      if (!db) throw new Error('admin routes need a database')
      const { cursor, limit, ...filters } = request.query
      const { page, next } = await fetchPage(
        db,
        filters,
        cursor ? decodeCursor(cursor) : null,
        limit,
      )
      return {
        items: page.map(({ entry, actorName }) => ({
          id: entry.id,
          action: entry.action as AuditAction,
          targetType: entry.targetType as AuditTargetType,
          targetId: entry.targetId,
          actor: entry.actorId && actorName ? { id: entry.actorId, username: actorName } : null,
          before: entry.before,
          after: entry.after,
          ip: entry.ip,
          createdAt: entry.createdAt.toISOString(),
        })),
        meta: { nextCursor: next ? encodeCursor(next.createdAtText, next.entry.id) : null },
      }
    },
  )

  app.get(
    '/admin/audit.csv',
    { preHandler: [view], schema: { querystring: adminAuditFiltersSchema } },
    async (request, reply) => {
      if (!db) throw new Error('admin routes need a database')
      const filters = request.query
      async function* rows() {
        yield csvRow(CSV_HEADER)
        let after: { at: string; id: string } | null = null
        while (true) {
          const { page, next } = await fetchPage(db as Database, filters, after, CSV_BATCH)
          for (const { entry, actorName } of page) {
            yield csvRow([
              entry.id,
              entry.createdAt.toISOString(),
              actorName,
              entry.action,
              entry.targetType,
              entry.targetId,
              entry.ip,
              entry.before ? JSON.stringify(entry.before) : null,
              entry.after ? JSON.stringify(entry.after) : null,
            ])
          }
          if (!next) return
          after = { at: next.createdAtText, id: next.entry.id }
        }
      }
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', 'attachment; filename="audit-log.csv"')
        .header('cache-control', 'no-store')
        .send(Readable.from(rows()))
    },
  )
}
