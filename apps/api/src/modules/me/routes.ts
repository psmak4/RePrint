import { sessions, users } from '@reprint/db'
import {
  changePasswordRequestSchema,
  changePasswordResponseSchema,
  type Me,
  meSchema,
  updateMeRequestSchema,
} from '@reprint/shared'
import { and, eq, ne } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { HttpProblem } from '../../errors.js'
import { isBreachedPassword } from '../auth/breached-password.js'
import { requireAuth } from '../auth/guards.js'
import { hashPassword, verifyPassword } from '../auth/password.js'
import type { AuthRoutesOptions } from '../auth/register.js'
import { rateLimit } from '../rate-limit/plugin.js'

const ownAccount = {
  id: users.id,
  email: users.email,
  username: users.username,
  displayName: users.displayName,
  bio: users.bio,
  emailVerifiedAt: users.emailVerifiedAt,
  libraryPublic: users.libraryPublic,
  emailReviewDecisions: users.emailReviewDecisions,
}

function toMe(row: {
  id: string
  email: string
  username: string
  displayName: string
  bio: string | null
  emailVerifiedAt: Date | null
  libraryPublic: boolean
  emailReviewDecisions: boolean
}): Me {
  const { emailVerifiedAt, ...rest } = row
  return { ...rest, verified: emailVerifiedAt !== null }
}

export const meRoutes: FastifyPluginAsyncZod<AuthRoutesOptions> = async (app, options) => {
  const { env, db, jobs } = options
  const webBase = (env.WEB_URL ?? env.WEB_ORIGINS[0] ?? '').replace(/\/$/, '')

  app.get(
    '/me',
    { preHandler: [requireAuth], schema: { response: { 200: meSchema } } },
    async (request) => {
      if (!db || !request.auth) throw new Error('me routes need a database')
      const [row] = await db
        .select(ownAccount)
        .from(users)
        .where(eq(users.id, request.auth.user.id))
      if (!row) throw new HttpProblem(401, 'Sign in to continue.')
      return toMe(row)
    },
  )

  app.patch(
    '/me',
    {
      preHandler: [requireAuth],
      schema: { body: updateMeRequestSchema, response: { 200: meSchema } },
    },
    async (request) => {
      if (!db || !request.auth) throw new Error('me routes need a database')
      const [row] = await db
        .update(users)
        .set(request.body)
        .where(eq(users.id, request.auth.user.id))
        .returning(ownAccount)
      if (!row) throw new HttpProblem(401, 'Sign in to continue.')
      return toMe(row)
    },
  )

  app.post(
    '/me/password',
    {
      // Guessing the current password from a stolen session is the risk, so count attempts per Member.
      preHandler: [requireAuth, rateLimit('passwordChange')],
      schema: {
        body: changePasswordRequestSchema,
        response: { 200: changePasswordResponseSchema },
      },
    },
    async (request) => {
      if (!db || !jobs || !request.auth)
        throw new Error('me routes need a database and a job queue')
      const { user, sessionId } = request.auth
      const { currentPassword, newPassword } = request.body
      const [account] = await db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, user.id))
      if (!account || !(await verifyPassword(account.passwordHash, currentPassword))) {
        throw new HttpProblem(400, 'The request did not pass validation.', {
          errors: [{ path: 'body.currentPassword', message: 'That is not your current password.' }],
        })
      }
      if (await isBreachedPassword(newPassword, { mode: env.HIBP_MODE, log: request.log })) {
        throw new HttpProblem(400, 'The request did not pass validation.', {
          errors: [
            {
              path: 'body.newPassword',
              message: 'This password has appeared in a data breach. Choose a different one.',
            },
          ],
        })
      }
      const passwordHash = await hashPassword(newPassword)
      await db.transaction(async (tx) => {
        await tx.update(users).set({ passwordHash }).where(eq(users.id, user.id))
        // Every other device signs out; this one stays signed in.
        await tx
          .delete(sessions)
          .where(and(eq(sessions.userId, user.id), ne(sessions.id, sessionId)))
      })
      try {
        await jobs.enqueue('email.send', {
          template: 'password-changed',
          to: user.email,
          props: { username: user.username, resetUrl: `${webBase}/forgot-password` },
        })
      } catch (error) {
        request.log.error({ err: error }, 'could not queue the password changed email')
      }
      return { status: 'password_changed' as const }
    },
  )
}
