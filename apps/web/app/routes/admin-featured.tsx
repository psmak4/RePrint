import {
  APP_NAME,
  adminFeaturedSchema,
  adminFeaturedUpdateSchema,
  PERMISSIONS,
} from '@reprint/shared'
import { data } from 'react-router'
import { FeaturedManager } from '../components/admin/featured-manager.js'
import { copy } from '../copy/index.js'
import { requireViewerPermission } from '../lib/admin.server.js'
import { apiClientFor } from '../lib/api.server.js'
import { failed, sendToApi } from '../lib/auth.server.js'
import { logger } from '../lib/logger.server.js'
import { pageMeta } from '../lib/seo.js'
import type { Route } from './+types/admin-featured'

export function meta(args: Route.MetaArgs) {
  return pageMeta(args, { title: `${APP_NAME}: ${copy.admin.featured.title}`, noindex: true })
}

/** The current picks and what can be picked (PRD §7.2, §7.11). */
export async function loader({ request }: Route.LoaderArgs) {
  const viewer = await requireViewerPermission(request, PERMISSIONS.featuredManage)
  let response: Response
  try {
    response = await apiClientFor(request).get('/v1/admin/featured')
  } catch (error) {
    logger.error({ err: error }, 'could not load featured content')
    throw data(copy.admin.featured.loadFailed, { status: 502 })
  }
  if (response.status === 401 || response.status === 403) {
    throw data('Forbidden', { status: response.status })
  }
  if (!response.ok) {
    logger.error({ status: response.status }, 'featured content request failed')
    throw data(copy.admin.featured.loadFailed, { status: 502 })
  }
  return {
    featured: adminFeaturedSchema.parse(await response.json()),
    canEditGenres: viewer.permissions.includes(PERMISSIONS.featuredGenres),
  }
}

/** Each action is one permission-checked, audited API call; the API rebuilds Discover. */
export async function action({ request }: Route.ActionArgs) {
  await requireViewerPermission(request, PERMISSIONS.featuredManage)
  const fallback = copy.admin.featured.failed
  const parsed = adminFeaturedUpdateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return data({ formError: fallback }, { status: 400 })
  const result = await sendToApi(request, 'PUT', '/v1/admin/featured', parsed.data, fallback)
  if (!result.ok) return failed(result)
  const { genreIds, reviewId } = parsed.data
  if (genreIds !== undefined) return { done: 'genresSaved' as const }
  return { done: reviewId === null ? ('reviewCleared' as const) : ('reviewSaved' as const) }
}

export default function AdminFeatured({ loaderData }: Route.ComponentProps) {
  return <FeaturedManager {...loaderData} />
}
