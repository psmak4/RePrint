import { sessions } from '@reprint/db'
import {
  endSessionResponseSchema,
  type SessionInfo,
  sessionInfoSchema,
  sessionListResponseSchema,
  sessionParamsSchema,
} from '@reprint/shared'
import { and, desc, eq, gt } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { UAParser } from 'ua-parser-js'
import { HttpProblem } from '../../errors.js'
import { requireAuth } from '../auth/guards.js'
import type { AuthRoutesOptions } from '../auth/register.js'

const sessionColumns = {
  id: sessions.id,
  ip: sessions.ip,
  userAgent: sessions.userAgent,
  createdAt: sessions.createdAt,
  lastSeenAt: sessions.lastSeenAt,
}

/** "Firefox on macOS", or "Unknown device" when the user agent is missing or unrecognized. */
export function deviceName(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device'
  const { browser, os } = UAParser(userAgent)
  if (browser.name && os.name) return `${browser.name} on ${os.name}`
  return browser.name ?? os.name ?? 'Unknown device'
}

function toSessionInfo(
  row: {
    id: string
    ip: string | null
    userAgent: string | null
    createdAt: Date
    lastSeenAt: Date
  },
  currentId: string,
): SessionInfo {
  return {
    id: row.id,
    device: deviceName(row.userAgent),
    ip: row.ip,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    current: row.id === currentId,
  }
}

export const sessionRoutes: FastifyPluginAsyncZod<AuthRoutesOptions> = async (app, options) => {
  const { db } = options

  app.get(
    '/me/sessions',
    { preHandler: [requireAuth], schema: { response: { 200: sessionListResponseSchema } } },
    async (request) => {
      if (!db || !request.auth) throw new Error('session routes need a database')
      const { user, sessionId } = request.auth
      const rows = await db
        .select(sessionColumns)
        .from(sessions)
        .where(and(eq(sessions.userId, user.id), gt(sessions.expiresAt, new Date())))
        .orderBy(desc(sessions.lastSeenAt))
      return { items: rows.map((row) => toSessionInfo(row, sessionId)) }
    },
  )

  app.get(
    '/me/sessions/:id',
    {
      preHandler: [requireAuth],
      schema: { params: sessionParamsSchema, response: { 200: sessionInfoSchema } },
    },
    async (request) => {
      if (!db || !request.auth) throw new Error('session routes need a database')
      const { user, sessionId } = request.auth
      // Another Member's session looks exactly like one that does not exist.
      const [row] = await db
        .select(sessionColumns)
        .from(sessions)
        .where(
          and(
            eq(sessions.id, request.params.id),
            eq(sessions.userId, user.id),
            gt(sessions.expiresAt, new Date()),
          ),
        )
      if (!row) throw new HttpProblem(404, 'Session not found.')
      return toSessionInfo(row, sessionId)
    },
  )

  app.delete(
    '/me/sessions/:id',
    {
      preHandler: [requireAuth],
      schema: { params: sessionParamsSchema, response: { 200: endSessionResponseSchema } },
    },
    async (request, reply) => {
      if (!db || !request.auth) throw new Error('session routes need a database')
      const { user, sessionId } = request.auth
      const ended = await db
        .delete(sessions)
        .where(and(eq(sessions.id, request.params.id), eq(sessions.userId, user.id)))
        .returning({ id: sessions.id })
      if (ended.length === 0) throw new HttpProblem(404, 'Session not found.')
      // Ending the session in use also clears its cookie, like logging out.
      if (request.params.id === sessionId) await app.sessions.end(request, reply)
      return { status: 'session_ended' as const }
    },
  )
}
