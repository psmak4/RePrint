import { type NotificationListResponse, notificationListResponseSchema } from '@reprint/shared'
import { apiClientFor } from './api.server.js'
import { logger } from './logger.server.js'

/** How many notifications the header bell lists. */
const BELL_PAGE_SIZE = 10

/** The viewer's newest notifications for the header bell. A down API just hides the bell's list. */
export async function loadNotifications(
  request: Request,
): Promise<NotificationListResponse | null> {
  try {
    const response = await apiClientFor(request).get(
      `/v1/me/notifications?pageSize=${BELL_PAGE_SIZE}`,
    )
    if (!response.ok) return null
    return notificationListResponseSchema.parse(await response.json())
  } catch (error) {
    logger.error({ err: error }, 'could not load notifications')
    return null
  }
}
