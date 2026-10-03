import type { Database } from '@reprint/db'
import { permissions, rolePermissions, sessions, userRoles, users } from '@reprint/db'
import { and, eq, gt } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Env } from '../../config/env.js'
import { SESSION_COOKIE, sessionCookieOptions } from './session-cookie.js'
import { generateToken, hashToken } from './tokens.js'

/** D-027: a session is only rewritten (and its expiry pushed out) when last seen over a day ago. */
export const SESSION_RENEW_AFTER_MS = 24 * 60 * 60 * 1000

/** Who is making the request. `null` on `request.auth` means Visitor. */
export interface AuthContext {
  sessionId: string
  user: {
    id: string
    email: string
    username: string
    displayName: string
    emailVerifiedAt: Date | null
  }
  /** Permission names granted through the user's roles. Checks use these, never role names. */
  permissions: ReadonlySet<string>
}

export interface SessionService {
  /** Creates a session for `userId` and sets the `rp_session` cookie on the reply. */
  start: (request: FastifyRequest, reply: FastifyReply, userId: string) => Promise<void>
  /** Deletes the current session (if any) and clears the cookie. */
  end: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null
  }
  interface FastifyInstance {
    sessions: SessionService
  }
}

/**
 * Reads `rp_session` on every request, looks up its hashed token, and sets `request.auth`.
 * Expired sessions, sessions older than `SESSION_MAX_DAYS`, and sessions of suspended or deleted users are treated as signed out.
 */
export function registerSessions(app: FastifyInstance, env: Env, db: Database | undefined): void {
  app.decorateRequest('auth', null)
  if (!db) return
  const cookieOptions = sessionCookieOptions(env)
  const ttlMs = env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
  const maxAgeMs = Math.max(env.SESSION_MAX_DAYS, env.SESSION_TTL_DAYS) * 24 * 60 * 60 * 1000

  app.decorate('sessions', {
    async start(request, reply, userId) {
      const token = generateToken()
      await db.insert(sessions).values({
        tokenHash: hashToken(token),
        userId,
        expiresAt: new Date(Date.now() + ttlMs),
        ip: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
      })
      reply.setCookie(SESSION_COOKIE, token, cookieOptions)
    },
    async end(request, reply) {
      if (request.auth) await db.delete(sessions).where(eq(sessions.id, request.auth.sessionId))
      reply.clearCookie(SESSION_COOKIE, withoutMaxAge(cookieOptions))
    },
  } satisfies SessionService)

  app.addHook('onRequest', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE]
    if (!token) return
    const now = new Date()
    const [found] = await db
      .select({
        sessionId: sessions.id,
        lastSeenAt: sessions.lastSeenAt,
        userId: users.id,
        email: users.email,
        username: users.username,
        displayName: users.displayName,
        emailVerifiedAt: users.emailVerifiedAt,
        status: users.status,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.tokenHash, hashToken(token)),
          gt(sessions.expiresAt, now),
          gt(sessions.createdAt, new Date(now.getTime() - maxAgeMs)),
        ),
      )
      .limit(1)
    const row = found?.status === 'active' ? found : undefined
    if (!row) {
      // Stale cookie: drop it so the browser stops sending it.
      reply.clearCookie(SESSION_COOKIE, withoutMaxAge(cookieOptions))
      return
    }

    if (now.getTime() - row.lastSeenAt.getTime() > SESSION_RENEW_AFTER_MS) {
      await db
        .update(sessions)
        .set({ lastSeenAt: now, expiresAt: new Date(now.getTime() + ttlMs) })
        .where(eq(sessions.id, row.sessionId))
      reply.setCookie(SESSION_COOKIE, token, cookieOptions)
    }

    const granted = await db
      .selectDistinct({ name: permissions.name })
      .from(userRoles)
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(userRoles.userId, row.userId))

    request.auth = {
      sessionId: row.sessionId,
      user: {
        id: row.userId,
        email: row.email,
        username: row.username,
        displayName: row.displayName,
        emailVerifiedAt: row.emailVerifiedAt,
      },
      permissions: new Set(granted.map((permission) => permission.name)),
    }
  })
}

function withoutMaxAge(options: ReturnType<typeof sessionCookieOptions>) {
  const { maxAge: _maxAge, ...rest } = options
  return rest
}
