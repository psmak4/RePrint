import { z } from 'zod'
import { pageOf, pageQuerySchema } from './pagination.js'

/** In-app notification types (PRD §7.12): review decisions and account security events. */
export const NOTIFICATION_TYPES = [
  'review_approved',
  'review_rejected',
  'review_unpublished',
  'password_changed',
  'email_changed',
] as const

export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES)
export type NotificationType = z.infer<typeof notificationTypeSchema>

export const notificationSchema = z.object({
  id: z.uuid(),
  type: notificationTypeSchema,
  /** Type-specific details, such as the Book of a review decision. */
  data: z.record(z.string(), z.unknown()),
  read: z.boolean(),
  createdAt: z.iso.datetime(),
})
export type Notification = z.infer<typeof notificationSchema>

export const notificationListQuerySchema = pageQuerySchema
export const notificationListResponseSchema = pageOf(notificationSchema).extend({
  unreadCount: z.number().int().min(0),
})
export type NotificationListResponse = z.infer<typeof notificationListResponseSchema>

/** Mark the listed notifications read, or every unread one with `all`. */
export const MAX_NOTIFICATION_READ_IDS = 50
export const markNotificationsReadRequestSchema = z.union([
  z.strictObject({ all: z.literal(true) }),
  z.strictObject({ ids: z.array(z.uuid()).min(1).max(MAX_NOTIFICATION_READ_IDS) }),
])
export const markNotificationsReadResponseSchema = z.object({
  unreadCount: z.number().int().min(0),
})
