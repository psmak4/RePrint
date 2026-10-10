import {
  APP_NAME,
  type DiscoverResponse,
  discoverResponseSchema,
  libraryResponseSchema,
  type Shelf,
} from '@reprint/shared'
import { useRouteLoaderData } from 'react-router'
import { DiscoverPage, type YourReading } from '../components/books/discover-page.js'
import { copy } from '../copy/index.js'
import { apiClientFor } from '../lib/api.server.js'
import { loadSession } from '../lib/auth.server.js'
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
  justApproved: null,
}

const READING_ENTRIES = 4

async function loadShelf(request: Request, username: string, shelf: Shelf, pageSize: number) {
  const search = new URLSearchParams({ shelf, sort: 'added_desc', pageSize: String(pageSize) })
  const response = await apiClientFor(request).get(
    `/v1/users/${encodeURIComponent(username)}/library?${search}`,
  )
  if (!response.ok) throw new Error(`library request failed with ${response.status}`)
  return libraryResponseSchema.parse(await response.json()).items
}

/** The viewer's Reading and Want to Read entries; a failure hides the strip. */
async function loadYourReading(request: Request): Promise<YourReading | null> {
  try {
    const { viewer } = await loadSession(request)
    if (!viewer) return null
    const [reading, wantToRead] = await Promise.all([
      loadShelf(request, viewer.username, 'reading', READING_ENTRIES),
      loadShelf(request, viewer.username, 'want_to_read', 1),
    ])
    return { reading, wantToRead }
  } catch (error) {
    logger.error({ err: error }, 'could not load the viewer reading shelves')
    return null
  }
}

async function loadDiscover(request: Request): Promise<DiscoverResponse> {
  try {
    const response = await apiClientFor(request).get('/v1/discover')
    if (response.ok) return discoverResponseSchema.parse(await response.json())
    logger.error({ status: response.status }, 'discover request failed')
  } catch (error) {
    logger.error({ err: error }, 'could not load discover')
  }
  return NO_ROWS
}

/** The Discover rows from the API's cache (PRD §7.2). If they can't load, the page still renders without rows. */
export async function loader({ request }: Route.LoaderArgs) {
  const [discover, reading] = await Promise.all([loadDiscover(request), loadYourReading(request)])
  return { discover, reading }
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const session = useRouteLoaderData<typeof rootLoader>('root')
  return (
    <DiscoverPage
      discover={loaderData.discover}
      viewer={session?.viewer ?? null}
      reading={loaderData.reading}
    />
  )
}
