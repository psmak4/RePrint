import { notifications } from '@reprint/db'
import {
  buildPageMeta,
  markNotificationsReadRequestSchema,
  markNotificationsReadResponseSchema,
  type Notification,
  type NotificationType,
  notificationListQuerySchema,
  notificationListResponseSchema,
} from '@reprint/shared'
import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { requireAuth } from '../auth/guards.js'
import type { AuthRoutesOptions } from '../auth/register.js'

export const notificationRoutes: FastifyPluginAsyncZod<AuthRoutesOptions> = async (
  app,
  options,
) => {
  const { db } = options

  app.get(
    '/me/notifications',
    {
      preHandler: [requireAuth],
      schema: {
        querystring: notificationListQuerySchema,
        response: { 200: notificationListResponseSchema },
      },
    },
    async (request) => {
      if (!db || !request.auth) throw new Error('notification routes need a database')
      const userId = request.auth.user.id
      const query = request.query
      const [rows, [total], [unread]] = await Promise.all([
        db
          .select()
          .from(notifications)
          .where(eq(notifications.userId, userId))
          .orderBy(desc(notifications.createdAt), desc(notifications.id))
          .limit(query.pageSize)
          .offset((query.page - 1) * query.pageSize),
        db.select({ n: count() }).from(notifications).where(eq(notifications.userId, userId)),
        db
          .select({ n: count() })
          .from(notifications)
          .where(and(eq(notifications.userId, userId), isNull(notifications.readAt))),
      ])
      const items: Notification[] = rows.map((row) => ({
        id: row.id,
        // The column is free text; only `notify` writes it, with NotificationType values.
        type: row.type as NotificationType,
        data: row.data as Record<string, unknown>,
        read: row.readAt !== null,
        createdAt: row.createdAt.toISOString(),
      }))
      return {
        items,
        meta: buildPageMeta(query, total?.n ?? 0),
        unreadCount: unread?.n ?? 0,
      }
    },
  )

  app.post(
    '/me/notifications/read',
    {
      preHandler: [requireAuth],
      schema: {
        body: markNotificationsReadRequestSchema,
        response: { 200: markNotificationsReadResponseSchema },
      },
    },
    async (request) => {
      if (!db || !request.auth) throw new Error('notification routes need a database')
      const userId = request.auth.user.id
      const body = request.body
      // Scoped to the viewer's own unread rows, so another Member's IDs are silently ignored.
      const target =
        'ids' in body
          ? and(
              eq(notifications.userId, userId),
              isNull(notifications.readAt),
              inArray(notifications.id, body.ids),
            )
          : and(eq(notifications.userId, userId), isNull(notifications.readAt))
      await db.update(notifications).set({ readAt: new Date() }).where(target)
      const [unread] = await db
        .select({ n: count() })
        .from(notifications)
        .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
      return { unreadCount: unread?.n ?? 0 }
    },
  )
}
