import { type Database, notifications } from '@reprint/db'
import type { NotificationType } from '@reprint/shared'

/** A database or an open transaction, so callers can notify inside their own transaction. */
type Executor = Pick<Database, 'insert'>

/** Creates an in-app notification. Pass the caller's `tx` so it commits with the change it reports. */
export async function notify(
  executor: Executor,
  userId: string,
  type: NotificationType,
  data: Record<string, unknown> = {},
): Promise<void> {
  await executor.insert(notifications).values({ userId, type, data })
}
