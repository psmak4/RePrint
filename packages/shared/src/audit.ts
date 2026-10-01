import { z } from 'zod'

/**
 * Every elevated action that writes an `audit_log` row (PRD §4, D-036). Claims and reads are not
 * audited. Later endpoints pick from this list, so adding an action is one line here.
 */
export const AUDIT_ACTIONS = [
  'review.approve',
  'review.reject',
  'review.unpublish',
  'report.dismiss',
  'role.grant',
  'role.remove',
  'user.suspend',
  'user.unsuspend',
  'session.revoke',
  'user.resend_verification',
  'book.edit',
  'cover.upload',
  'book.primary_edition',
  'book.refresh',
  'book.merge',
  'merge.dismiss',
  'genre.change',
  'subject_rule.change',
  'featured.change',
] as const

export const auditActionSchema = z.enum(AUDIT_ACTIONS)
export type AuditAction = z.infer<typeof auditActionSchema>

/** What an audited action was done to. */
export const AUDIT_TARGET_TYPES = [
  'review',
  'report',
  'user',
  'session',
  'book',
  'cover',
  'merge_candidate',
  'genre',
  'subject_rule',
  'featured_item',
] as const

export const auditTargetTypeSchema = z.enum(AUDIT_TARGET_TYPES)
export type AuditTargetType = z.infer<typeof auditTargetTypeSchema>
