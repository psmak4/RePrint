import { auditLog, reviewReports, reviews, roles, sessions, userRoles, users } from '@reprint/db'
import {
  type AdminUserDetail,
  type AdminUserRolesResponse,
  type AdminUserStatus,
  type AdminUserSummary,
  type AdminUsersResponse,
  type AuditAction,
  type AuditTargetType,
  adminUserDetailSchema,
  adminUserParamsSchema,
  adminUserRoleParamsSchema,
  adminUserRolesResponseSchema,
  adminUsersQuerySchema,
  adminUsersResponseSchema,
  hasPermission,
  REVIEW_STATUSES,
  type ReviewStatus,
} from '@reprint/shared'
import { and, count, desc, eq, gt, gte, ilike, inArray, lt, or, sql } from 'drizzle-orm'
import type { FastifyRequest } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { HttpProblem } from '../../errors.js'
import { recordAudit } from '../audit/audit.js'
import { requirePermission } from '../auth/guards.js'
import type { AuthRoutesOptions } from '../auth/register.js'
import { deviceName } from '../me/sessions.js'
import { decodeCursor, encodeCursor } from '../moderation/cursor.js'

const DAY_MS = 86_400_000
const AUDIT_HISTORY_LIMIT = 50

/** The status an Admin sees: an active account with no verified email is "unverified". */
function displayStatus(row: { status: string; emailVerifiedAt: Date | null }): AdminUserStatus {
  if (row.status === 'suspended' || row.status === 'deleted') return row.status
  return row.emailVerifiedAt ? 'active' : 'unverified'
}

function isRoleName(name: string): name is AdminUserSummary['roles'][number] {
  return name === 'member' || name === 'moderator' || name === 'admin'
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`)
}

/** Admin user search, detail, and role changes (PRD §7.11). Suspensions are in `suspensions.ts`. */
export const adminUserRoutes: FastifyPluginAsyncZod<AuthRoutesOptions> = async (app, options) => {
  const { db } = options
  const view = requirePermission('users.view')
  const assign = requirePermission('roles.assign')

  app.get(
    '/admin/users',
    {
      preHandler: [view],
      schema: { querystring: adminUsersQuerySchema, response: { 200: adminUsersResponseSchema } },
    },
    async (request): Promise<AdminUsersResponse> => {
      if (!db || !request.auth) throw new Error('admin routes need a database')
      const full = hasPermission(request.auth.permissions, 'audit.view')
      const { q, role, status, joinedFrom, joinedTo, cursor, limit } = request.query
      const after = cursor ? decodeCursor(cursor) : null

      const conditions = []
      if (q) {
        const pattern = `%${escapeLike(q)}%`
        // Only the full view may search by email, or a search would reveal it.
        conditions.push(
          full
            ? or(ilike(users.username, pattern), ilike(users.email, pattern))
            : ilike(users.username, pattern),
        )
      }
      if (role) {
        conditions.push(
          inArray(
            users.id,
            db
              .select({ id: userRoles.userId })
              .from(userRoles)
              .innerJoin(roles, eq(roles.id, userRoles.roleId))
              .where(eq(roles.name, role)),
          ),
        )
      }
      if (status === 'active') {
        conditions.push(eq(users.status, 'active'), sql`${users.emailVerifiedAt} is not null`)
      } else if (status === 'unverified') {
        conditions.push(eq(users.status, 'active'), sql`${users.emailVerifiedAt} is null`)
      } else if (status) {
        conditions.push(eq(users.status, status))
      }
      if (joinedFrom) conditions.push(gte(users.createdAt, new Date(`${joinedFrom}T00:00:00Z`)))
      if (joinedTo) {
        conditions.push(lt(users.createdAt, new Date(Date.parse(`${joinedTo}T00:00:00Z`) + DAY_MS)))
      }
      if (after) {
        conditions.push(
          sql`(${users.createdAt}, ${users.id}) < (${after.at}::timestamptz, ${after.id}::uuid)`,
        )
      }

      const rows = await db
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          email: users.email,
          status: users.status,
          emailVerifiedAt: users.emailVerifiedAt,
          createdAt: users.createdAt,
          createdAtText: sql<string>`${users.createdAt}::text`,
        })
        .from(users)
        .where(and(...conditions))
        .orderBy(desc(users.createdAt), desc(users.id))
        .limit(limit + 1)

      const page = rows.slice(0, limit)
      const last = page.at(-1)
      const nextCursor =
        rows.length > limit && last ? encodeCursor(last.createdAtText, last.id) : null
      const ids = page.map((row) => row.id)
      const [roleMap, countMap] = await Promise.all([rolesFor(ids), countsFor(ids)])

      const items: AdminUserSummary[] = page.map((row) => ({
        id: row.id,
        username: row.username,
        displayName: row.displayName,
        email: full ? row.email : null,
        status: displayStatus(row),
        roles: roleMap.get(row.id) ?? [],
        joinedAt: row.createdAt.toISOString(),
        reviewCount: countMap.get(row.id)?.approved ?? 0,
        reportsReceived: countMap.get(row.id)?.received ?? 0,
      }))
      return { items, meta: { nextCursor } }
    },
  )

  app.get(
    '/admin/users/:id',
    {
      preHandler: [view],
      schema: { params: adminUserParamsSchema, response: { 200: adminUserDetailSchema } },
    },
    async (request): Promise<AdminUserDetail> => {
      if (!db || !request.auth) throw new Error('admin routes need a database')
      const full = hasPermission(request.auth.permissions, 'audit.view')
      const { id } = request.params

      const [row] = await db.select().from(users).where(eq(users.id, id))
      if (!row) throw new HttpProblem(404, 'User not found.')

      const [roleMap, countMap, filed] = await Promise.all([
        rolesFor([id]),
        countsFor([id]),
        db
          .select({ total: count() })
          .from(reviewReports)
          .where(eq(reviewReports.reporterId, id))
          .then((result) => result[0]?.total ?? 0),
      ])
      const counts = countMap.get(id)
      const byStatus = Object.fromEntries(
        REVIEW_STATUSES.map((name) => [name, counts?.byStatus[name] ?? 0]),
      ) as Record<ReviewStatus, number>

      let admin: AdminUserDetail['admin'] = null
      if (full) {
        const [sessionRows, auditRows] = await Promise.all([
          db
            .select()
            .from(sessions)
            .where(and(eq(sessions.userId, id), gt(sessions.expiresAt, new Date())))
            .orderBy(desc(sessions.lastSeenAt)),
          db
            .select({ entry: auditLog, actorName: users.username })
            .from(auditLog)
            .leftJoin(users, eq(users.id, auditLog.actorId))
            .where(
              or(
                and(eq(auditLog.targetType, 'user'), eq(auditLog.targetId, id)),
                eq(auditLog.actorId, id),
              ),
            )
            .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
            .limit(AUDIT_HISTORY_LIMIT),
        ])
        admin = {
          sessions: sessionRows.map((session) => ({
            id: session.id,
            device: deviceName(session.userAgent),
            ip: session.ip,
            createdAt: session.createdAt.toISOString(),
            lastSeenAt: session.lastSeenAt.toISOString(),
          })),
          audit: auditRows.map(({ entry, actorName }) => ({
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
        }
      }

      return {
        user: {
          id: row.id,
          username: row.username,
          displayName: row.displayName,
          email: full ? row.email : null,
          status: displayStatus(row),
          roles: roleMap.get(id) ?? [],
          joinedAt: row.createdAt.toISOString(),
          reviewCount: byStatus.approved,
          reportsReceived: counts?.received ?? 0,
          bio: row.bio,
          emailVerifiedAt: full ? (row.emailVerifiedAt?.toISOString() ?? null) : null,
          suspendedUntil: row.suspendedUntil?.toISOString() ?? null,
          suspendedReason: full ? row.suspendedReason : null,
          deletedAt: row.deletedAt?.toISOString() ?? null,
        },
        reviews: byStatus,
        reports: { filed, received: counts?.received ?? 0 },
        admin,
      }
    },
  )

  /** Grants or removes a role in one transaction with its audit row (PRD §4, D-150). */
  async function changeRole(
    request: FastifyRequest<{ Params: { id: string; role: 'moderator' | 'admin' } }>,
    grant: boolean,
  ): Promise<AdminUserRolesResponse> {
    if (!db || !request.auth) throw new Error('admin routes need a database')
    const actorId = request.auth.user.id
    const { id, role } = request.params
    return db.transaction(async (tx) => {
      const [target] = await tx.select().from(users).where(eq(users.id, id)).for('update')
      if (!target) throw new HttpProblem(404, 'User not found.')
      if (target.status === 'deleted') {
        throw new HttpProblem(409, 'Roles cannot be changed on a deleted account.')
      }
      const [roleRow] = await tx.select().from(roles).where(eq(roles.name, role))
      if (!roleRow) throw new Error(`role ${role} is not seeded`)

      const held = async () => {
        const rows = await tx
          .select({ name: roles.name })
          .from(userRoles)
          .innerJoin(roles, eq(roles.id, userRoles.roleId))
          .where(eq(userRoles.userId, id))
          .orderBy(roles.name)
        return rows.map((row) => row.name).filter(isRoleName)
      }
      const before = await held()
      if (before.includes(role) === grant) return { userId: id, roles: before, changed: false }

      if (!grant && role === 'admin' && id === actorId) {
        // Lock every Admin grant so two Admins removing themselves at once cannot both pass.
        const admins = await tx
          .select({ userId: userRoles.userId })
          .from(userRoles)
          .where(eq(userRoles.roleId, roleRow.id))
          .for('update')
        if (admins.every((row) => row.userId === actorId)) {
          throw new HttpProblem(409, 'You are the last Admin, so you cannot remove your own role.')
        }
      }

      if (grant) await tx.insert(userRoles).values({ userId: id, roleId: roleRow.id })
      else {
        await tx
          .delete(userRoles)
          .where(and(eq(userRoles.userId, id), eq(userRoles.roleId, roleRow.id)))
      }
      const after = await held()
      await recordAudit(tx, {
        actorId,
        action: grant ? 'role.grant' : 'role.remove',
        targetType: 'user',
        targetId: id,
        before: { roles: before },
        after: { roles: after },
        ip: request.ip,
      })
      return { userId: id, roles: after, changed: true }
    })
  }

  app.put(
    '/admin/users/:id/roles/:role',
    {
      preHandler: [assign],
      schema: {
        params: adminUserRoleParamsSchema,
        response: { 200: adminUserRolesResponseSchema },
      },
    },
    (request) => changeRole(request, true),
  )

  app.delete(
    '/admin/users/:id/roles/:role',
    {
      preHandler: [assign],
      schema: {
        params: adminUserRoleParamsSchema,
        response: { 200: adminUserRolesResponseSchema },
      },
    },
    (request) => changeRole(request, false),
  )

  async function rolesFor(ids: string[]): Promise<Map<string, AdminUserSummary['roles']>> {
    const map = new Map<string, AdminUserSummary['roles']>()
    if (!db || ids.length === 0) return map
    const rows = await db
      .select({ userId: userRoles.userId, name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(inArray(userRoles.userId, ids))
      .orderBy(roles.name)
    for (const { userId, name } of rows) {
      if (name !== 'member' && name !== 'moderator' && name !== 'admin') continue
      map.set(userId, [...(map.get(userId) ?? []), name])
    }
    return map
  }

  async function countsFor(ids: string[]) {
    const map = new Map<
      string,
      { approved: number; received: number; byStatus: Partial<Record<ReviewStatus, number>> }
    >()
    if (!db || ids.length === 0) return map
    const [reviewRows, reportRows] = await Promise.all([
      db
        .select({ userId: reviews.userId, status: reviews.status, total: count() })
        .from(reviews)
        .where(inArray(reviews.userId, ids))
        .groupBy(reviews.userId, reviews.status),
      db
        .select({ userId: reviews.userId, total: count() })
        .from(reviewReports)
        .innerJoin(reviews, eq(reviews.id, reviewReports.reviewId))
        .where(inArray(reviews.userId, ids))
        .groupBy(reviews.userId),
    ])
    const entry = (userId: string) => {
      let value = map.get(userId)
      if (!value) {
        value = { approved: 0, received: 0, byStatus: {} }
        map.set(userId, value)
      }
      return value
    }
    for (const { userId, status, total } of reviewRows) {
      const value = entry(userId)
      value.byStatus[status] = total
      if (status === 'approved') value.approved = total
    }
    for (const { userId, total } of reportRows) entry(userId).received = total
    return map
  }
}
