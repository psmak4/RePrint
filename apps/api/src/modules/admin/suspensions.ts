import { authTokens, type Database, sessions, users } from '@reprint/db'
import {
  type AdminUserResendVerificationResponse,
  type AdminUserRevokeSessionsResponse,
  type AdminUserSuspensionResponse,
  adminUserParamsSchema,
  adminUserResendVerificationResponseSchema,
  adminUserRevokeSessionsResponseSchema,
  adminUserSuspensionResponseSchema,
  suspendUserRequestSchema,
} from '@reprint/shared'
import { and, eq, isNull, lte } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { HttpProblem } from '../../errors.js'
import { recordAudit } from '../audit/audit.js'
import { requirePermission } from '../auth/guards.js'
import { type AuthRoutesOptions, VERIFY_EMAIL_TTL_MS } from '../auth/register.js'
import { generateToken, hashToken } from '../auth/tokens.js'

/**
 * Lifts suspensions whose end date has passed (all of them, or just `userId`). Automatic lifts are
 * not an elevated action, so they write no audit row.
 */
export async function liftExpiredSuspensions(
  db: Database,
  now: Date = new Date(),
  userId?: string,
): Promise<{ lifted: number }> {
  const lifted = await db
    .update(users)
    .set({ status: 'active', suspendedUntil: null, suspendedReason: null })
    .where(
      and(
        eq(users.status, 'suspended'),
        lte(users.suspendedUntil, now),
        userId ? eq(users.id, userId) : undefined,
      ),
    )
    .returning({ id: users.id })
  return { lifted: lifted.length }
}

/** Suspend, unsuspend, session revocation, and verification resend for Admins (PRD §4, §7.11, D-151). */
export const adminSuspensionRoutes: FastifyPluginAsyncZod<AuthRoutesOptions> = async (
  app,
  options,
) => {
  const { db, jobs, env } = options
  const webBase = (env.WEB_URL ?? env.WEB_ORIGINS[0] ?? '').replace(/\/$/, '')
  const suspend = requirePermission('users.suspend')
  const view = requirePermission('users.view')

  app.post(
    '/admin/users/:id/suspend',
    {
      preHandler: [suspend],
      schema: {
        params: adminUserParamsSchema,
        body: suspendUserRequestSchema,
        response: { 200: adminUserSuspensionResponseSchema },
      },
    },
    async (request): Promise<AdminUserSuspensionResponse> => {
      if (!db || !request.auth) throw new Error('admin routes need a database')
      const actorId = request.auth.user.id
      const { id } = request.params
      const { reason, until } = request.body
      const endsAt = until ? new Date(until) : null
      if (endsAt && endsAt.getTime() <= Date.now()) {
        throw new HttpProblem(400, 'The request did not pass validation.', {
          errors: [{ path: 'body.until', message: 'Choose an end date in the future.' }],
        })
      }
      if (id === actorId) throw new HttpProblem(409, 'You cannot suspend your own account.')

      const target = await db.transaction(async (tx) => {
        const [row] = await tx.select().from(users).where(eq(users.id, id)).for('update')
        if (!row) throw new HttpProblem(404, 'User not found.')
        if (row.status === 'deleted') throw new HttpProblem(409, 'This account is deleted.')
        if (row.status === 'suspended') {
          throw new HttpProblem(409, 'This account is already suspended.')
        }

        await tx
          .update(users)
          .set({ status: 'suspended', suspendedUntil: endsAt, suspendedReason: reason })
          .where(eq(users.id, id))
        // Sessions end immediately, in the same transaction (PRD §4).
        await tx.delete(sessions).where(eq(sessions.userId, id))
        await recordAudit(tx, {
          actorId,
          action: 'user.suspend',
          targetType: 'user',
          targetId: id,
          before: { status: row.status, suspendedUntil: null },
          after: { status: 'suspended', suspendedUntil: endsAt?.toISOString() ?? null, reason },
          ip: request.ip,
        })
        return row
      })

      if (jobs) {
        try {
          await jobs.enqueue('email.send', {
            template: 'account-suspended',
            to: target.email,
            props: {
              username: target.username,
              reason,
              ...(endsAt ? { until: endsAt.toISOString().slice(0, 10) } : {}),
            },
          })
        } catch (error) {
          request.log.error({ err: error }, 'could not queue the suspension email')
        }
      }
      return { userId: id, status: 'suspended', suspendedUntil: endsAt?.toISOString() ?? null }
    },
  )

  app.post(
    '/admin/users/:id/unsuspend',
    {
      preHandler: [suspend],
      schema: {
        params: adminUserParamsSchema,
        response: { 200: adminUserSuspensionResponseSchema },
      },
    },
    async (request): Promise<AdminUserSuspensionResponse> => {
      if (!db || !request.auth) throw new Error('admin routes need a database')
      const actorId = request.auth.user.id
      const { id } = request.params
      await db.transaction(async (tx) => {
        const [row] = await tx.select().from(users).where(eq(users.id, id)).for('update')
        if (!row) throw new HttpProblem(404, 'User not found.')
        if (row.status !== 'suspended') throw new HttpProblem(409, 'This account is not suspended.')
        await tx
          .update(users)
          .set({ status: 'active', suspendedUntil: null, suspendedReason: null })
          .where(eq(users.id, id))
        await recordAudit(tx, {
          actorId,
          action: 'user.unsuspend',
          targetType: 'user',
          targetId: id,
          before: {
            status: 'suspended',
            suspendedUntil: row.suspendedUntil?.toISOString() ?? null,
            reason: row.suspendedReason,
          },
          after: { status: 'active', suspendedUntil: null },
          ip: request.ip,
        })
      })
      return { userId: id, status: 'active', suspendedUntil: null }
    },
  )

  app.post(
    '/admin/users/:id/revoke-sessions',
    {
      preHandler: [suspend],
      schema: {
        params: adminUserParamsSchema,
        response: { 200: adminUserRevokeSessionsResponseSchema },
      },
    },
    async (request): Promise<AdminUserRevokeSessionsResponse> => {
      if (!db || !request.auth) throw new Error('admin routes need a database')
      const actorId = request.auth.user.id
      const { id } = request.params
      return db.transaction(async (tx) => {
        const [row] = await tx.select({ id: users.id }).from(users).where(eq(users.id, id))
        if (!row) throw new HttpProblem(404, 'User not found.')
        const ended = await tx
          .delete(sessions)
          .where(eq(sessions.userId, id))
          .returning({ id: sessions.id })
        await recordAudit(tx, {
          actorId,
          action: 'session.revoke',
          targetType: 'user',
          targetId: id,
          after: { revoked: ended.length },
          ip: request.ip,
        })
        return { userId: id, revoked: ended.length }
      })
    },
  )

  app.post(
    '/admin/users/:id/resend-verification',
    {
      preHandler: [view],
      schema: {
        params: adminUserParamsSchema,
        response: { 200: adminUserResendVerificationResponseSchema },
      },
    },
    async (request): Promise<AdminUserResendVerificationResponse> => {
      if (!db || !jobs || !request.auth) {
        throw new Error('admin routes need a database and a job queue')
      }
      const actorId = request.auth.user.id
      const { id } = request.params
      const [target] = await db.select().from(users).where(eq(users.id, id))
      if (!target) throw new HttpProblem(404, 'User not found.')
      if (target.status !== 'active') {
        throw new HttpProblem(409, 'Verification emails go only to active accounts.')
      }
      if (target.emailVerifiedAt) return { userId: id, sent: false }

      const token = generateToken()
      await db.transaction(async (tx) => {
        // The newest link wins: earlier unused links stop working.
        await tx
          .delete(authTokens)
          .where(
            and(
              eq(authTokens.userId, id),
              eq(authTokens.purpose, 'verify_email'),
              isNull(authTokens.usedAt),
            ),
          )
        await tx.insert(authTokens).values({
          userId: id,
          tokenHash: hashToken(token),
          purpose: 'verify_email',
          expiresAt: new Date(Date.now() + VERIFY_EMAIL_TTL_MS),
        })
        await recordAudit(tx, {
          actorId,
          action: 'user.resend_verification',
          targetType: 'user',
          targetId: id,
          ip: request.ip,
        })
      })
      await jobs.enqueue('email.send', {
        template: 'verify-email',
        to: target.email,
        props: {
          username: target.username,
          verifyUrl: `${webBase}/verify-email?token=${encodeURIComponent(token)}`,
        },
      })
      return { userId: id, sent: true }
    },
  )
}
