import { sessions, users } from '@reprint/db'
import { loginRequestSchema, loginResponseSchema, logoutResponseSchema } from '@reprint/shared'
import { eq } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { HttpProblem } from '../../errors.js'
import { rateLimit } from '../rate-limit/plugin.js'
import { requireAuth } from './guards.js'
import { hashPassword, verifyPassword } from './password.js'
import type { AuthRoutesOptions } from './register.js'

/** Verified against when the email is unknown, so a miss costs the same time as a wrong password. */
let decoyHash: Promise<string> | undefined
function getDecoyHash(): Promise<string> {
  decoyHash ??= hashPassword('decoy-password-for-constant-time-login')
  return decoyHash
}

function badCredentials(): HttpProblem {
  return new HttpProblem(401, 'The email or password is incorrect.')
}

export const loginRoutes: FastifyPluginAsyncZod<AuthRoutesOptions> = async (app, options) => {
  const { db } = options

  app.post(
    '/auth/login',
    {
      // Every attempt counts, so guessing is capped whether or not the account exists.
      preHandler: [
        rateLimit('loginIp'),
        rateLimit('loginAccount', (request) =>
          (request.body as { email?: string } | null)?.email?.trim().toLowerCase(),
        ),
      ],
      schema: {
        body: loginRequestSchema,
        response: { 200: loginResponseSchema },
      },
    },
    async (request, reply) => {
      if (!db) throw new Error('auth routes need a database')
      const { email, password } = request.body

      const [user] = await db
        .select({
          id: users.id,
          passwordHash: users.passwordHash,
          status: users.status,
          suspendedUntil: users.suspendedUntil,
        })
        .from(users)
        .where(eq(users.email, email))
        .limit(1)

      const passwordOk = await verifyPassword(
        user?.passwordHash ?? (await getDecoyHash()),
        password,
      )
      // Deleted accounts get the generic answer: the 30-day window is not something to reveal (D-043).
      if (!user || !passwordOk || user.status === 'deleted') throw badCredentials()

      if (user.status === 'suspended') {
        // Only after a correct password, so this message can't be used to find accounts (D-047).
        const until = user.suspendedUntil
          ? ` until ${user.suspendedUntil.toISOString().slice(0, 10)}`
          : ''
        throw new HttpProblem(403, `This account is suspended${until}.`)
      }

      await app.sessions.start(request, reply, user.id)
      return { status: 'logged_in' as const }
    },
  )

  app.post(
    '/auth/logout',
    {
      preHandler: [requireAuth],
      schema: { response: { 200: logoutResponseSchema } },
    },
    async (request, reply) => {
      await app.sessions.end(request, reply)
      return { status: 'logged_out' as const }
    },
  )

  app.post(
    '/auth/logout-all',
    {
      preHandler: [requireAuth],
      schema: { response: { 200: logoutResponseSchema } },
    },
    async (request, reply) => {
      if (!db || !request.auth) throw new Error('auth routes need a database')
      await db.delete(sessions).where(eq(sessions.userId, request.auth.user.id))
      await app.sessions.end(request, reply)
      return { status: 'logged_out' as const }
    },
  )
}
