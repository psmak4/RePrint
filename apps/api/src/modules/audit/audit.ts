import { auditLog, type Database } from '@reprint/db'
import type { AuditAction, AuditTargetType } from '@reprint/shared'

/** A database or an open transaction, so the audit row commits with the action it records. */
type Executor = Pick<Database, 'insert'>

export interface AuditEntry {
  /** The Moderator or Admin who acted. */
  actorId: string
  action: AuditAction
  targetType: AuditTargetType
  targetId?: string | null
  /** The target's relevant fields before the action; omit for actions that create something. */
  before?: Record<string, unknown> | null
  /** The target's relevant fields after the action; omit for actions that remove something. */
  after?: Record<string, unknown> | null
  /** The request's IP address (`request.ip`). Cleared after 90 days (D-042). */
  ip?: string | null
}

/**
 * Records an elevated action (PRD §4, D-036). Every Moderator or Admin action calls this inside
 * the transaction that makes the change, so the change and its audit row commit or roll back
 * together. Pass the caller's `tx`.
 */
export async function recordAudit(executor: Executor, entry: AuditEntry): Promise<void> {
  await executor.insert(auditLog).values({
    actorId: entry.actorId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    ip: entry.ip ?? null,
  })
}
