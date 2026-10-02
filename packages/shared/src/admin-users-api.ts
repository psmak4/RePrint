import { z } from 'zod'
import { auditActionSchema, auditTargetTypeSchema } from './audit.js'
import { cursorPageOf, cursorQuerySchema } from './pagination.js'
import { ROLES } from './permissions.js'
import { reviewStatusSchema } from './reviews.js'

const roleNameSchema = z.enum([ROLES.member, ROLES.moderator, ROLES.admin])

/** Response shapes for the Admin users endpoints (PRD §7.11, §10, D-044, D-149). */

/**
 * What an Admin sees a user as. `unverified` is an active account whose email is not yet verified;
 * the stored status has only active, suspended, and deleted.
 */
export const ADMIN_USER_STATUSES = ['active', 'unverified', 'suspended', 'deleted'] as const
export const adminUserStatusSchema = z.enum(ADMIN_USER_STATUSES)
export type AdminUserStatus = z.infer<typeof adminUserStatusSchema>

/** `GET /admin/users?q=&role=&status=&joinedFrom=&joinedTo=&cursor=&limit=`. */
export const adminUsersQuerySchema = cursorQuerySchema.extend({
  /** Email or username fragment; Moderators match on username only. */
  q: z.string().trim().min(1).max(100).optional(),
  role: roleNameSchema.optional(),
  status: adminUserStatusSchema.optional(),
  /** Inclusive dates (UTC, `YYYY-MM-DD`). */
  joinedFrom: z.iso.date().optional(),
  joinedTo: z.iso.date().optional(),
})
export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>

export const adminUserParamsSchema = z.object({ id: z.uuid() })

export const adminUserSummarySchema = z.object({
  id: z.uuid(),
  username: z.string(),
  displayName: z.string(),
  /** Null in the limited view (D-044). */
  email: z.string().nullable(),
  status: adminUserStatusSchema,
  roles: z.array(roleNameSchema),
  joinedAt: z.iso.datetime(),
  /** Approved Reviews. */
  reviewCount: z.number().int().min(0),
  /** Reports (any status) on the user's Reviews. */
  reportsReceived: z.number().int().min(0),
})
export type AdminUserSummary = z.infer<typeof adminUserSummarySchema>

export const adminUsersResponseSchema = cursorPageOf(adminUserSummarySchema)
export type AdminUsersResponse = z.infer<typeof adminUsersResponseSchema>

export const adminUserSessionSchema = z.object({
  id: z.uuid(),
  device: z.string(),
  ip: z.string().nullable(),
  createdAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
})

export const adminUserAuditEntrySchema = z.object({
  id: z.uuid(),
  action: auditActionSchema,
  targetType: auditTargetTypeSchema,
  targetId: z.uuid().nullable(),
  actor: z.object({ id: z.uuid(), username: z.string() }).nullable(),
  before: z.record(z.string(), z.unknown()).nullable(),
  after: z.record(z.string(), z.unknown()).nullable(),
  ip: z.string().nullable(),
  createdAt: z.iso.datetime(),
})

/** `GET /admin/users/:id`. `admin` is null in the limited view (D-044). */
export const adminUserDetailSchema = z.object({
  user: adminUserSummarySchema.extend({
    bio: z.string().nullable(),
    emailVerifiedAt: z.iso.datetime().nullable(),
    suspendedUntil: z.iso.datetime().nullable(),
    /** Null in the limited view and for accounts that are not suspended. */
    suspendedReason: z.string().nullable(),
    deletedAt: z.iso.datetime().nullable(),
  }),
  /** The user's Reviews by status. */
  reviews: z.record(reviewStatusSchema, z.number().int().min(0)),
  reports: z.object({
    filed: z.number().int().min(0),
    received: z.number().int().min(0),
  }),
  admin: z
    .object({
      sessions: z.array(adminUserSessionSchema),
      /** Newest first; entries about the user or done by them, up to 50. */
      audit: z.array(adminUserAuditEntrySchema),
    })
    .nullable(),
})
export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>

/** Roles an Admin can grant or remove. Everyone is a Member, so that role is not changeable (D-150). */
export const ASSIGNABLE_ROLES = [ROLES.moderator, ROLES.admin] as const
export const assignableRoleSchema = z.enum(ASSIGNABLE_ROLES)

/** `PUT` and `DELETE /admin/users/:id/roles/:role`. */
export const adminUserRoleParamsSchema = z.object({
  id: z.uuid(),
  role: assignableRoleSchema,
})

/** The user's roles after a grant or removal. `changed` is false when the user already was in that state. */
export const adminUserRolesResponseSchema = z.object({
  userId: z.uuid(),
  roles: z.array(roleNameSchema),
  changed: z.boolean(),
})
export type AdminUserRolesResponse = z.infer<typeof adminUserRolesResponseSchema>

/** `POST /admin/users/:id/suspend`. `until` is optional; without it the suspension lasts until lifted. */
export const suspendUserRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  until: z.iso.datetime().optional(),
})
export type SuspendUserRequest = z.infer<typeof suspendUserRequestSchema>

/** `POST /admin/users/:id/suspend` and `/unsuspend`. */
export const adminUserSuspensionResponseSchema = z.object({
  userId: z.uuid(),
  status: z.enum(['active', 'suspended']),
  suspendedUntil: z.iso.datetime().nullable(),
})
export type AdminUserSuspensionResponse = z.infer<typeof adminUserSuspensionResponseSchema>

/** `POST /admin/users/:id/revoke-sessions`: how many sessions were ended. */
export const adminUserRevokeSessionsResponseSchema = z.object({
  userId: z.uuid(),
  revoked: z.number().int().min(0),
})
export type AdminUserRevokeSessionsResponse = z.infer<typeof adminUserRevokeSessionsResponseSchema>

/** `POST /admin/users/:id/resend-verification`. `sent` is false when the email is already verified. */
export const adminUserResendVerificationResponseSchema = z.object({
  userId: z.uuid(),
  sent: z.boolean(),
})
export type AdminUserResendVerificationResponse = z.infer<
  typeof adminUserResendVerificationResponseSchema
>
