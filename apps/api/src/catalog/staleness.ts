/** A stored Book is refreshed, and a Series' members synced, when older than this (PRD §6, D-199). */
export const STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000

export function isStale(refreshedAt: Date | null, now: Date = new Date()): boolean {
  return refreshedAt === null || now.getTime() - refreshedAt.getTime() > STALE_AFTER_MS
}
