import { auditLog, type Database, sessions } from '@reprint/db'
import { and, isNotNull, lt, sql } from 'drizzle-orm'

/** IP addresses are kept this long (PRD §11, D-042). */
export const IP_RETENTION_DAYS = 90

/**
 * Sets `ip` to NULL on sessions and audit rows older than 90 days. The `audit_log` guard trigger
 * judges age by the database clock, so a `now` ahead of it is capped there instead of failing.
 */
export async function clearOldIps(
  db: Database,
  now: Date = new Date(),
): Promise<{ sessions: number; auditLog: number }> {
  const cutoff = new Date(now.getTime() - IP_RETENTION_DAYS * 86_400_000)
  return db.transaction(async (tx) => {
    const clearedSessions = await tx
      .update(sessions)
      .set({ ip: null })
      .where(and(isNotNull(sessions.ip), lt(sessions.createdAt, cutoff)))
      .returning({ id: sessions.id })
    const clearedAudit = await tx
      .update(auditLog)
      .set({ ip: null })
      .where(
        and(
          isNotNull(auditLog.ip),
          lt(
            auditLog.createdAt,
            sql`least(${cutoff.toISOString()}::timestamptz, now() - interval '90 days')`,
          ),
        ),
      )
      .returning({ id: auditLog.id })
    return { sessions: clearedSessions.length, auditLog: clearedAudit.length }
  })
}
