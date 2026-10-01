import { authTokens, covers, type Database, sessions, users } from '@reprint/db'
import {
  ACCOUNT_ERASE_AFTER_DAYS,
  changeEmailRequestSchema,
  changeEmailResponseSchema,
  changePasswordRequestSchema,
  changePasswordResponseSchema,
  confirmEmailChangeRequestSchema,
  confirmEmailChangeResponseSchema,
  deleteAccountRequestSchema,
  deleteAccountResponseSchema,
  type Me,
  meSchema,
  updateMeRequestSchema,
} from '@reprint/shared'
import { and, eq, gt, isNull, ne } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { HttpProblem } from '../../errors.js'
import type { ImageStorage } from '../../storage/index.js'
import { isBreachedPassword } from '../auth/breached-password.js'
import { requireAuth } from '../auth/guards.js'
import { hashPassword, verifyPassword } from '../auth/password.js'
import { type AuthRoutesOptions, VERIFY_EMAIL_TTL_MS } from '../auth/register.js'
import { generateToken, hashToken } from '../auth/tokens.js'
import { notify } from '../notifications/notify.js'
import { rateLimit } from '../rate-limit/plugin.js'
import { removeMemberFromAggregates } from '../reviews/aggregates.js'

const ownAccount = {
  id: users.id,
  email: users.email,
  username: users.username,
  displayName: users.displayName,
  bio: users.bio,
  emailVerifiedAt: users.emailVerifiedAt,
  libraryPublic: users.libraryPublic,
  emailReviewDecisions: users.emailReviewDecisions,
  avatarKey: covers.r2Key,
}

function toMe(
  row: {
    id: string
    email: string
    username: string
    displayName: string
    bio: string | null
    emailVerifiedAt: Date | null
    libraryPublic: boolean
    emailReviewDecisions: boolean
    avatarKey: string | null
  },
  storage: ImageStorage,
): Me {
  const { emailVerifiedAt, avatarKey, ...rest } = row
  return {
    ...rest,
    avatarUrl: avatarKey ? storage.url(avatarKey) : null,
    verified: emailVerifiedAt !== null,
  }
}

async function loadOwnAccount(db: Database, userId: string) {
  const [row] = await db
    .select(ownAccount)
    .from(users)
    .leftJoin(covers, eq(covers.id, users.avatarId))
    .where(eq(users.id, userId))
  return row
}

export interface MeRoutesOptions extends AuthRoutesOptions {
  storage: ImageStorage
}

export const meRoutes: FastifyPluginAsyncZod<MeRoutesOptions> = async (app, options) => {
  const { env, db, jobs, storage } = options
  const webBase = (env.WEB_URL ?? env.WEB_ORIGINS[0] ?? '').replace(/\/$/, '')

  app.get(
    '/me',
    { preHandler: [requireAuth], schema: { response: { 200: meSchema } } },
    async (request) => {
      if (!db || !request.auth) throw new Error('me routes need a database')
      const row = await loadOwnAccount(db, request.auth.user.id)
      if (!row) throw new HttpProblem(401, 'Sign in to continue.')
      return toMe(row, storage)
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
      await db.update(users).set(request.body).where(eq(users.id, request.auth.user.id))
      const row = await loadOwnAccount(db, request.auth.user.id)
      if (!row) throw new HttpProblem(401, 'Sign in to continue.')
      return toMe(row, storage)
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
        await notify(tx, user.id, 'password_changed')
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

  app.post(
    '/me/email',
    {
      // Like the password change, this asks for the current password, so count attempts per Member.
      preHandler: [requireAuth, rateLimit('emailChange')],
      schema: { body: changeEmailRequestSchema, response: { 200: changeEmailResponseSchema } },
    },
    async (request) => {
      if (!db || !jobs || !request.auth)
        throw new Error('me routes need a database and a job queue')
      const { user } = request.auth
      const { currentPassword, newEmail } = request.body
      const [account] = await db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, user.id))
      if (!account || !(await verifyPassword(account.passwordHash, currentPassword))) {
        throw new HttpProblem(400, 'The request did not pass validation.', {
          errors: [{ path: 'body.currentPassword', message: 'That is not your current password.' }],
        })
      }
      const [taken] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, newEmail))
        .limit(1)
      if (taken) {
        throw new HttpProblem(409, 'That email address is already in use.', {
          errors: [{ path: 'body.newEmail', message: 'Use a different email address.' }],
        })
      }
      const token = generateToken()
      await db.transaction(async (tx) => {
        // The newest request wins: earlier unused change links stop working.
        await tx
          .delete(authTokens)
          .where(
            and(
              eq(authTokens.userId, user.id),
              eq(authTokens.purpose, 'change_email'),
              isNull(authTokens.usedAt),
            ),
          )
        await tx.insert(authTokens).values({
          userId: user.id,
          tokenHash: hashToken(token),
          purpose: 'change_email',
          newEmail,
          expiresAt: new Date(Date.now() + VERIFY_EMAIL_TTL_MS),
        })
      })
      try {
        await jobs.enqueue('email.send', {
          template: 'email-change-confirm',
          to: newEmail,
          props: {
            username: user.username,
            confirmUrl: `${webBase}/confirm-email-change?token=${encodeURIComponent(token)}`,
          },
        })
        await jobs.enqueue('email.send', {
          template: 'email-change-requested',
          to: user.email,
          props: { username: user.username, newEmail, resetUrl: `${webBase}/forgot-password` },
        })
      } catch (error) {
        request.log.error({ err: error }, 'could not queue the email change emails')
      }
      return { status: 'check_your_email' as const }
    },
  )

  app.delete(
    '/me',
    {
      // Like the password change, this asks for the password, so count attempts per Member.
      preHandler: [requireAuth, rateLimit('passwordChange')],
      schema: { body: deleteAccountRequestSchema, response: { 200: deleteAccountResponseSchema } },
    },
    async (request, reply) => {
      if (!db || !jobs || !request.auth)
        throw new Error('me routes need a database and a job queue')
      const { user } = request.auth
      const [account] = await db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, user.id))
      if (!account || !(await verifyPassword(account.passwordHash, request.body.password))) {
        throw new HttpProblem(400, 'The request did not pass validation.', {
          errors: [{ path: 'body.password', message: 'That is not your password.' }],
        })
      }
      await db.transaction(async (tx) => {
        // Disabled now, erased by the `accounts.erase` job after 30 days (D-043, D-088).
        await tx
          .update(users)
          .set({ status: 'deleted', deletedAt: new Date() })
          .where(eq(users.id, user.id))
        await tx.delete(sessions).where(eq(sessions.userId, user.id))
        // Unused links must not outlive the account's usefulness.
        await tx.delete(authTokens).where(eq(authTokens.userId, user.id))
        // Their Approved reviews stop counting at once (D-043).
        await removeMemberFromAggregates(tx, user.id)
      })
      await app.sessions.end(request, reply)
      try {
        await jobs.enqueue('email.send', {
          template: 'account-deletion-scheduled',
          to: user.email,
          props: { username: user.username, eraseAfterDays: ACCOUNT_ERASE_AFTER_DAYS },
        })
      } catch (error) {
        request.log.error({ err: error }, 'could not queue the account deletion email')
      }
      return { status: 'account_deletion_scheduled' as const }
    },
  )

  app.post(
    '/me/email/confirm',
    {
      // The link may open in another browser, so no session is needed; the token is the proof.
      schema: {
        body: confirmEmailChangeRequestSchema,
        response: { 200: confirmEmailChangeResponseSchema },
      },
    },
    async (request) => {
      if (!db || !jobs) throw new Error('me routes need a database and a job queue')
      const now = new Date()
      const invalid = () =>
        new HttpProblem(400, 'This email change link has expired or was already used.', {
          errors: [{ path: 'body.token', message: 'Request the change again from your settings.' }],
        })
      let changed: { username: string; oldEmail: string; newEmail: string } | null
      try {
        changed = await db.transaction(async (tx) => {
          // One conditional UPDATE consumes the token, so two concurrent requests can't both succeed.
          const [consumed] = await tx
            .update(authTokens)
            .set({ usedAt: now })
            .where(
              and(
                eq(authTokens.tokenHash, hashToken(request.body.token)),
                eq(authTokens.purpose, 'change_email'),
                isNull(authTokens.usedAt),
                gt(authTokens.expiresAt, now),
              ),
            )
            .returning({ userId: authTokens.userId, newEmail: authTokens.newEmail })
          if (!consumed?.newEmail) return null
          const [before] = await tx
            .select({ email: users.email, username: users.username })
            .from(users)
            .where(and(eq(users.id, consumed.userId), eq(users.status, 'active')))
          if (!before) return null
          // The link proves the Member controls the new address, so it counts as verified.
          await tx
            .update(users)
            .set({ email: consumed.newEmail, emailVerifiedAt: now })
            .where(eq(users.id, consumed.userId))
          await notify(tx, consumed.userId, 'email_changed')
          return { username: before.username, oldEmail: before.email, newEmail: consumed.newEmail }
        })
      } catch (error) {
        // Someone registered the address after the request; the unique index refuses the switch.
        if (isUniqueViolation(error)) throw invalid()
        throw error
      }
      if (!changed) throw invalid()
      const props = { ...changed, resetUrl: `${webBase}/forgot-password` }
      try {
        // Both the old and the new address hear about it (PRD §7.12).
        await jobs.enqueue('email.send', { template: 'email-changed', to: changed.oldEmail, props })
        await jobs.enqueue('email.send', { template: 'email-changed', to: changed.newEmail, props })
      } catch (error) {
        request.log.error({ err: error }, 'could not queue the email changed emails')
      }
      return { status: 'email_changed' as const }
    },
  )
}

function isUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } } | null)?.cause
  return (error as { code?: string } | null)?.code === '23505' || cause?.code === '23505'
}
