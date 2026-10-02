import { z } from 'zod'
import { adminUserAuditEntrySchema } from './admin-users-api.js'
import { auditActionSchema, auditTargetTypeSchema } from './audit.js'
import { cursorPageOf, cursorQuerySchema } from './pagination.js'

/** Filters shared by `GET /admin/audit` and `GET /admin/audit.csv` (PRD §7.11, D-154). */
export const adminAuditFiltersSchema = z.object({
  /** The actor's username (exact match). */
  actor: z.string().trim().min(1).max(100).optional(),
  action: auditActionSchema.optional(),
  targetType: auditTargetTypeSchema.optional(),
  targetId: z.uuid().optional(),
  /** Inclusive dates (UTC, `YYYY-MM-DD`). */
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
})
export type AdminAuditFilters = z.infer<typeof adminAuditFiltersSchema>

/** `GET /admin/audit?actor=&action=&targetType=&targetId=&from=&to=&cursor=&limit=`. */
export const adminAuditQuerySchema = cursorQuerySchema.extend(adminAuditFiltersSchema.shape)
export type AdminAuditQuery = z.infer<typeof adminAuditQuerySchema>

export const adminAuditResponseSchema = cursorPageOf(adminUserAuditEntrySchema)
export type AdminAuditResponse = z.infer<typeof adminAuditResponseSchema>
