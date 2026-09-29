import { covers, type Database, users } from '@reprint/db'
import { ACCOUNT_ERASE_AFTER_DAYS } from '@reprint/shared'
import { and, eq, inArray, isNotNull, lt } from 'drizzle-orm'
import type { Logger } from 'pino'
import type { ImageStorage } from '../../storage/index.js'

const DAY_MS = 24 * 60 * 60 * 1000
const BATCH_SIZE = 100

/**
 * Hard-deletes accounts deleted more than `ACCOUNT_ERASE_AFTER_DAYS` days before `now`. Everything
 * that belongs to a Member (sessions, tokens, notifications, roles, and later reviews, votes, and
 * shelves) goes by FK cascade; avatar rows and files are not cascaded, so they are removed here.
 */
export async function eraseDeletedAccounts(options: {
  db: Database
  storage: ImageStorage
  log: Logger
  now?: Date
}): Promise<{ erased: number }> {
  const { db, storage, log } = options
  const cutoff = new Date((options.now ?? new Date()).getTime() - ACCOUNT_ERASE_AFTER_DAYS * DAY_MS)
  let erased = 0
  for (;;) {
    const batch = await db
      .select({ id: users.id, avatarId: users.avatarId })
      .from(users)
      .where(
        and(eq(users.status, 'deleted'), isNotNull(users.deletedAt), lt(users.deletedAt, cutoff)),
      )
      .limit(BATCH_SIZE)
    if (batch.length === 0) break
    const avatarIds = batch.flatMap((row) => (row.avatarId ? [row.avatarId] : []))
    const keys = await db.transaction(async (tx) => {
      const avatarKeys =
        avatarIds.length > 0
          ? await tx.select({ key: covers.r2Key }).from(covers).where(inArray(covers.id, avatarIds))
          : []
      await tx.delete(users).where(
        inArray(
          users.id,
          batch.map((row) => row.id),
        ),
      )
      if (avatarIds.length > 0) await tx.delete(covers).where(inArray(covers.id, avatarIds))
      return avatarKeys.flatMap((row) => (row.key ? [row.key] : []))
    })
    erased += batch.length
    // Files go after the commit; a failed removal leaves an orphan file, never a dangling row.
    for (const key of keys) {
      try {
        await storage.remove(key)
      } catch (error) {
        log.warn({ err: error, key }, 'could not remove an erased account’s avatar file')
      }
    }
  }
  log.info({ erased }, 'accounts erased')
  return { erased }
}
