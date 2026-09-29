import { authTokens, users } from '@reprint/db'
import {
  registerResponseSchema,
  resendVerificationRequestSchema,
  verifyEmailRequestSchema,
  verifyEmailResponseSchema,
} from '@reprint/shared'
import { and, eq, gt, isNull } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { HttpProblem } from '../../errors.js'
import { rateLimit } from '../rate-limit/plugin.js'
import { type AuthRoutesOptions, VERIFY_EMAIL_TTL_MS } from './register.js'
import { generateToken, hashToken } from './tokens.js'

export const verificationRoutes: FastifyPluginAsyncZod<AuthRoutesOptions> = async (
  app,
  options,
) => {
  const { env, db, jobs } = options
  const webBase = (env.WEB_URL ?? env.WEB_ORIGINS[0] ?? '').replace(/\/$/, '')

  app.post(
    '/auth/verify-email',
    {
      schema: {
        body: verifyEmailRequestSchema,
        response: { 200: verifyEmailResponseSchema },
      },
    },
    async (request) => {
      if (!db) throw new Error('auth routes need a database')
      const now = new Date()
      const verified = await db.transaction(async (tx) => {
        // One conditional UPDATE consumes the token, so two concurrent requests can't both succeed.
        const [consumed] = await tx
          .update(authTokens)
          .set({ usedAt: now })
          .where(
            and(
              eq(authTokens.tokenHash, hashToken(request.body.token)),
              eq(authTokens.purpose, 'verify_email'),
              isNull(authTokens.usedAt),
              gt(authTokens.expiresAt, now),
            ),
          )
          .returning({ userId: authTokens.userId })
        if (!consumed) return false
        await tx
          .update(users)
          .set({ emailVerifiedAt: now })
          .where(and(eq(users.id, consumed.userId), isNull(users.emailVerifiedAt)))
        return true
      })
      if (!verified) {
        throw new HttpProblem(400, 'This verification link has expired or was already used.', {
          errors: [{ path: 'body.token', message: 'Request a new verification link.' }],
        })
      }
      return { status: 'verified' as const }
    },
  )

  app.post(
    '/auth/resend-verification',
    {
      // Counted per email, whether or not an account exists, so the limit reveals nothing.
      preHandler: [
        rateLimit('resendVerification', (request) =>
          (
            request.auth?.user.email ?? (request.body as { email?: string } | null)?.email
          )?.toLowerCase(),
        ),
      ],
      schema: {
        body: resendVerificationRequestSchema,
        response: { 200: registerResponseSchema },
      },
    },
    async (request) => {
      if (!db || !jobs) throw new Error('auth routes need a database and a job queue')
      const email = request.auth?.user.email ?? request.body.email
      if (!email) {
        throw new HttpProblem(400, 'The request did not pass validation.', {
          errors: [{ path: 'body.email', message: 'Enter your email address.' }],
        })
      }

      const [user] = await db
        .select({ id: users.id, username: users.username, verified: users.emailVerifiedAt })
        .from(users)
        .where(and(eq(users.email, email), eq(users.status, 'active')))
        .limit(1)
      if (user && !user.verified) {
        const token = generateToken()
        await db.transaction(async (tx) => {
          // The newest link wins: earlier unused links stop working.
          await tx
            .delete(authTokens)
            .where(
              and(
                eq(authTokens.userId, user.id),
                eq(authTokens.purpose, 'verify_email'),
                isNull(authTokens.usedAt),
              ),
            )
          await tx.insert(authTokens).values({
            userId: user.id,
            tokenHash: hashToken(token),
            purpose: 'verify_email',
            expiresAt: new Date(Date.now() + VERIFY_EMAIL_TTL_MS),
          })
        })
        try {
          await jobs.enqueue('email.send', {
            template: 'verify-email',
            to: email,
            props: {
              username: user.username,
              verifyUrl: `${webBase}/verify-email?token=${encodeURIComponent(token)}`,
            },
          })
        } catch (error) {
          request.log.error({ err: error }, 'could not queue the verification email')
        }
      }
      // Same body for known, unknown, and already-verified addresses.
      return { status: 'check_your_email' as const }
    },
  )
}
