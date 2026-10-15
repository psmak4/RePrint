import { type ModQueueItem, modQueueResponseSchema, PERMISSIONS } from '@reprint/shared'
import { useRouteLoaderData } from 'react-router'
import { AdminPage } from '../components/admin/admin-page.js'
import { ModerationDashboard } from '../components/admin/moderation-dashboard.js'
import { adminCopy } from '../copy/admin.js'
import { requireViewerPermission } from '../lib/admin.server.js'
import { apiClientFor } from '../lib/api.server.js'
import { logger } from '../lib/logger.server.js'
import { pageMeta, pageTitle } from '../lib/seo.js'
import type { Route } from './+types/admin-index'
import type { loader as adminLoader } from './admin.js'

export function meta(args: Route.MetaArgs) {
  return pageMeta(args, { title: pageTitle(adminCopy.dashboard.title), noindex: true })
}

/** The three oldest pending reviews for "Waiting longest"; null when the API did not answer. */
async function loadOldest(request: Request): Promise<ModQueueItem[] | null> {
  try {
    const response = await apiClientFor(request).get('/v1/mod/reviews?limit=3')
    if (!response.ok) return null
    const queue = modQueueResponseSchema.safeParse(await response.json())
    return queue.success ? queue.data.items : null
  } catch (error) {
    logger.warn({ err: error }, 'could not load the oldest pending reviews')
    return null
  }
}

/**
 * The three oldest pending reviews. The queue counts come from the `/admin` layout, which already
 * asked `GET /v1/mod/stats` for the nav (D-201).
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  await requireViewerPermission({ request, context }, PERMISSIONS.reviewsModerate)
  return { now: new Date().toISOString(), oldest: await loadOldest(request) }
}

export default function AdminIndex({ loaderData }: Route.ComponentProps) {
  const layout = useRouteLoaderData<typeof adminLoader>('routes/admin')
  const stats = layout?.stats ?? null
  if (!stats) {
    return (
      <AdminPage
        crumbs={[{ label: adminCopy.title }]}
        title={adminCopy.dashboardNav}
        lead={adminCopy.dashboard.lead}
      >
        <p role="alert" className="text-muted-foreground">
          {adminCopy.dashboard.loadFailed}
        </p>
      </AdminPage>
    )
  }
  return <ModerationDashboard stats={stats} now={loaderData.now} oldest={loaderData.oldest} />
}
