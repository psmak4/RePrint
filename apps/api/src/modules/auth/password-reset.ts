import { authTokens, sessions, users } from '@reprint/db'
import {
  forgotPasswordRequestSchema,
  forgotPasswordResponseSchema,
  resetPasswordRequestSchema,
  resetPasswordResponseSchema,
} from '@reprint/shared'
import { and, eq, gt, isNull } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { HttpProblem } from '../../errors.js'
import { rateLimit } from '../rate-limit/plugin.js'
import { isBreachedPassword } from './breached-password.js'
import { hashPassword } from './password.js'
import type { AuthRoutesOptions } from './register.js'
import { generateToken, hashToken } from './tokens.js'

export const RESET_PASSWORD_TTL_MS = 60 * 60 * 1000

export const passwordResetRoutes: FastifyPluginAsyncZod<AuthRoutesOptions> = async (
  app,
  options,
) => {
  const { env, db, jobs } = options
  const webBase = (env.WEB_URL ?? env.WEB_ORIGINS[0] ?? '').replace(/\/$/, '')

  app.post(
    '/auth/forgot-password',
    {
      // Counted per email, whether or not an account exists, so the limit reveals nothing.
      preHandler: [
        rateLimit('passwordReset', (request) =>
          (request.body as { email?: string } | null)?.email?.toLowerCase(),
        ),
      ],
      schema: {
        body: forgotPasswordRequestSchema,
        response: { 200: forgotPasswordResponseSchema },
      },
    },
    async (request) => {
      if (!db || !jobs) throw new Error('auth routes need a database and a job queue')
      const { email } = request.body
      const [user] = await db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(and(eq(users.email, email), eq(users.status, 'active')))
        .limit(1)
      if (user) {
        const token = generateToken()
        await db.transaction(async (tx) => {
          // The newest link wins: earlier unused links stop working.
          await tx
            .delete(authTokens)
            .where(
              and(
                eq(authTokens.userId, user.id),
                eq(authTokens.purpose, 'reset_password'),
                isNull(authTokens.usedAt),
              ),
            )
          await tx.insert(authTokens).values({
            userId: user.id,
            tokenHash: hashToken(token),
            purpose: 'reset_password',
            expiresAt: new Date(Date.now() + RESET_PASSWORD_TTL_MS),
          })
        })
        try {
          await jobs.enqueue('email.send', {
            template: 'password-reset',
            to: email,
            props: {
              username: user.username,
              resetUrl: `${webBase}/reset-password?token=${encodeURIComponent(token)}`,
            },
          })
        } catch (error) {
          request.log.error({ err: error }, 'could not queue the password reset email')
        }
      }
      return { status: 'check_your_email' as const }
    },
  )

  app.post(
    '/auth/reset-password',
    {
      schema: {
        body: resetPasswordRequestSchema,
        response: { 200: resetPasswordResponseSchema },
      },
    },
    async (request) => {
      if (!db || !jobs) throw new Error('auth routes need a database and a job queue')
      const { token, password } = request.body
      if (await isBreachedPassword(password, { mode: env.HIBP_MODE, log: request.log })) {
        throw new HttpProblem(400, 'The request did not pass validation.', {
          errors: [
            {
              path: 'body.password',
              message: 'This password has appeared in a data breach. Choose a different one.',
            },
          ],
        })
      }
      const passwordHash = await hashPassword(password)
      const now = new Date()
      const account = await db.transaction(async (tx) => {
        // One conditional UPDATE consumes the token, so two concurrent requests can't both succeed.
        const [consumed] = await tx
          .update(authTokens)
          .set({ usedAt: now })
          .where(
            and(
              eq(authTokens.tokenHash, hashToken(token)),
              eq(authTokens.purpose, 'reset_password'),
              isNull(authTokens.usedAt),
              gt(authTokens.expiresAt, now),
            ),
          )
          .returning({ userId: authTokens.userId })
        if (!consumed) return null
        const [user] = await tx
          .update(users)
          .set({ passwordHash })
          .where(and(eq(users.id, consumed.userId), eq(users.status, 'active')))
          .returning({ email: users.email, username: users.username })
        if (!user) return null
        await tx.delete(sessions).where(eq(sessions.userId, consumed.userId))
        return user
      })
      if (!account) {
        throw new HttpProblem(400, 'This reset link has expired or was already used.', {
          errors: [{ path: 'body.token', message: 'Request a new password reset link.' }],
        })
      }
      try {
        await jobs.enqueue('email.send', {
          template: 'password-changed',
          to: account.email,
          props: { username: account.username, resetUrl: `${webBase}/forgot-password` },
        })
      } catch (error) {
        request.log.error({ err: error }, 'could not queue the password changed email')
      }
      return { status: 'password_reset' as const }
    },
  )
}
