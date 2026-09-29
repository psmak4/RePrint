import { createHash, timingSafeEqual } from 'node:crypto'
import { authTokens, type Database, newId, roles, userRoles, users } from '@reprint/db'
import {
  registerRequestSchema,
  registerResponseSchema,
  sessionResponseSchema,
} from '@reprint/shared'
import { eq } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { Env } from '../../config/env.js'
import { HttpProblem } from '../../errors.js'
import type { JobQueue } from '../../jobs/queue.js'
import { rateLimit } from '../rate-limit/plugin.js'
import { isBreachedPassword } from './breached-password.js'
import { hashPassword } from './password.js'
import { generateToken, hashToken } from './tokens.js'

/** Verification links work once and for 24 hours (PRD §7.1). */
export const VERIFY_EMAIL_TTL_MS = 24 * 60 * 60 * 1000

export interface AuthRoutesOptions {
  env: Env
  /** Both are omitted only by spec generation, which describes the routes but never serves them. */
  db: Database | undefined
  jobs: Pick<JobQueue, 'enqueue'> | undefined
}

type UniqueColumn = 'email' | 'username'

/** Reads which unique constraint Postgres refused, or `undefined` for any other error. */
function uniqueViolation(error: unknown): UniqueColumn | undefined {
  let current: unknown = error
  // Drizzle wraps the driver error; the Postgres fields are on the cause.
  while (current instanceof Error) {
    const { code, constraint_name: constraint } = current as Error & {
      code?: string
      constraint_name?: string
    }
    if (code === '23505') {
      if (constraint === 'users_email_unique') return 'email'
      if (constraint === 'users_username_unique') return 'username'
    }
    current = current.cause
  }
  return undefined
}

/** Compares digests in constant time, and against every code, so timing reveals nothing about the list. */
function isInviteCode(candidate: string | undefined, codes: readonly string[]): boolean {
  if (!candidate) return false
  const digest = (value: string) => createHash('sha256').update(value).digest()
  const given = digest(candidate)
  let match = false
  for (const code of codes) {
    if (timingSafeEqual(given, digest(code))) match = true
  }
  return match
}

function usernameTaken(): HttpProblem {
  return new HttpProblem(400, 'The request did not pass validation.', {
    errors: [{ path: 'body.username', message: 'That username is taken.' }],
  })
}

export const authRoutes: FastifyPluginAsyncZod<AuthRoutesOptions> = async (app, options) => {
  const { env, db, jobs } = options
  const webBase = (env.WEB_URL ?? env.WEB_ORIGINS[0] ?? '').replace(/\/$/, '')

  app.get('/auth/session', { schema: { response: { 200: sessionResponseSchema } } }, async () => ({
    signupsOpen: env.PUBLIC_SIGNUPS,
  }))

  app.post(
    '/auth/register',
    {
      preHandler: [rateLimit('register')],
      schema: {
        body: registerRequestSchema,
        response: { 201: registerResponseSchema },
      },
    },
    async (request, reply) => {
      if (!db || !jobs) throw new Error('auth routes need a database and a job queue')
      const { email, username, password, inviteCode } = request.body

      if (!env.PUBLIC_SIGNUPS && !isInviteCode(inviteCode, env.SIGNUP_INVITE_CODES)) {
        throw new HttpProblem(403, 'Registration is by invitation only right now.', {
          errors: [{ path: 'body.inviteCode', message: 'Enter a valid invite code.' }],
        })
      }

      if (await isBreachedPassword(password, { mode: env.HIBP_MODE, log: request.log })) {
        throw new HttpProblem(400, 'The request did not pass validation.', {
          errors: [
            {
              path: 'body.password',
              message: 'This password appears in a known data breach. Choose a different one.',
            },
          ],
        })
      }

      // Hash before looking anything up so a taken email costs the same time as a new one (D-048).
      const passwordHash = await hashPassword(password)

      const [existing] = await db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(eq(users.email, email))
        .limit(1)
      if (existing) {
        await sendAlreadyRegistered(email, existing.username)
        reply.code(201)
        return { status: 'check_your_email' as const }
      }

      const token = generateToken()
      const userId = newId()
      try {
        await db.transaction(async (tx) => {
          await tx.insert(users).values({
            id: userId,
            email,
            username,
            passwordHash,
            displayName: username,
          })
          const [member] = await tx.select().from(roles).where(eq(roles.name, 'member'))
          if (!member) throw new Error('the member role is missing; run migrations')
          await tx.insert(userRoles).values({ userId, roleId: member.id })
          await tx.insert(authTokens).values({
            userId,
            tokenHash: hashToken(token),
            purpose: 'verify_email',
            expiresAt: new Date(Date.now() + VERIFY_EMAIL_TTL_MS),
          })
        })
      } catch (error) {
        const column = uniqueViolation(error)
        if (column === 'username') throw usernameTaken()
        if (column === 'email') {
          // Lost a race with another registration for the same email: treat it as already registered.
          await sendAlreadyRegistered(email, username)
          reply.code(201)
          return { status: 'check_your_email' as const }
        }
        throw error
      }

      await app.sessions.start(request, reply, userId)
      try {
        await jobs.enqueue('email.send', {
          template: 'verify-email',
          to: email,
          props: {
            username,
            verifyUrl: `${webBase}/verify-email?token=${encodeURIComponent(token)}`,
          },
        })
      } catch (error) {
        // The account exists; the unverified banner's "resend" recovers from a missed email.
        request.log.error({ err: error }, 'could not queue the verification email')
      }
      reply.code(201)
      return { status: 'check_your_email' as const }
    },
  )

  async function sendAlreadyRegistered(email: string, ownerUsername: string): Promise<void> {
    try {
      await jobs?.enqueue('email.send', {
        template: 'email-already-registered',
        to: email,
        props: { username: ownerUsername, loginUrl: `${webBase}/login` },
      })
    } catch (error) {
      app.log.error({ err: error }, 'could not queue the already-registered email')
    }
  }
}
