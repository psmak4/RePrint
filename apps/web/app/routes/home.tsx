import { APP_NAME, type DiscoverResponse, discoverResponseSchema } from '@reprint/shared'
import { useRouteLoaderData } from 'react-router'
import { DiscoverPage } from '../components/books/discover-page.js'
import { copy } from '../copy/index.js'
import { apiClientFor } from '../lib/api.server.js'
import { logger } from '../lib/logger.server.js'
import { pageMeta } from '../lib/seo.js'
import type { loader as rootLoader } from '../root.js'
import type { Route } from './+types/home'

export function meta(args: Route.MetaArgs) {
  return pageMeta(args, {
    title: `${APP_NAME}: ${copy.home.title}`,
    description: copy.home.metaDescription,
    openGraph: { type: 'website' },
  })
}

const NO_ROWS: DiscoverResponse = {
  recentlyReviewed: null,
  topRated: null,
  mostReviewedThisMonth: null,
  featuredGenres: null,
  featuredReview: null,
}

/** The Discover rows from the API's cache (PRD §7.2). If they can't load, the page still renders without rows. */
export async function loader({ request }: Route.LoaderArgs) {
  try {
    const response = await apiClientFor(request).get('/v1/discover')
    if (response.ok) return { discover: discoverResponseSchema.parse(await response.json()) }
    logger.error({ status: response.status }, 'discover request failed')
  } catch (error) {
    logger.error({ err: error }, 'could not load discover')
  }
  return { discover: NO_ROWS }
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const session = useRouteLoaderData<typeof rootLoader>('root')
  return <DiscoverPage discover={loaderData.discover} viewer={session?.viewer ?? null} />
}
