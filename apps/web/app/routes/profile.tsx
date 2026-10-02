import {
  APP_NAME,
  profileReviewsQuerySchema,
  profileReviewsResponseSchema,
  profileSchema,
} from '@reprint/shared'
import { data, useRouteLoaderData } from 'react-router'
import { ProfilePage } from '../components/profile/profile-page.js'
import { copy } from '../copy/index.js'
import { apiClientFor } from '../lib/api.server.js'
import { logger } from '../lib/logger.server.js'
import type { loader as rootLoader } from '../root.js'
import type { Route } from './+types/profile'

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: APP_NAME }]
  const { profile, canonicalUrl } = loaderData
  const description = copy.profile.metaDescription(profile.displayName, profile.reviewCount)
  return [
    { title: `${copy.profile.title(profile.displayName)} | ${APP_NAME}` },
    { name: 'description', content: description },
    { tagName: 'link', rel: 'canonical', href: canonicalUrl },
    { property: 'og:type', content: 'profile' },
    { property: 'og:site_name', content: APP_NAME },
    { property: 'og:title', content: profile.displayName },
    { property: 'og:description', content: description },
    { property: 'og:url', content: canonicalUrl },
  ]
}

/** A Member's profile and their Approved Reviews, loaded on the server (PRD §7.8). */
export async function loader({ request, params }: Route.LoaderArgs) {
  const username = params.username
  if (!username) throw data('Not found', { status: 404 })

  // A bad page falls back to the first rather than failing the page.
  const parsed = profileReviewsQuerySchema.safeParse({
    page: new URL(request.url).searchParams.get('page') ?? undefined,
  })
  const page = parsed.success ? parsed.data.page : 1

  const api = apiClientFor(request)
  const base = `/v1/users/${encodeURIComponent(username)}`
  let profileResponse: Response
  let reviewsResponse: Response
  try {
    ;[profileResponse, reviewsResponse] = await Promise.all([
      api.get(base),
      api.get(`${base}/reviews?page=${page}`),
    ])
  } catch (error) {
    logger.error({ err: error }, 'could not load profile')
    throw data(copy.profile.loadFailed, { status: 502 })
  }
  if (profileResponse.status === 404) throw data('Not found', { status: 404 })
  if (!profileResponse.ok || !reviewsResponse.ok) {
    logger.error(
      { profile: profileResponse.status, reviews: reviewsResponse.status },
      'profile request failed',
    )
    throw data(copy.profile.loadFailed, { status: 502 })
  }
  const profile = profileSchema.parse(await profileResponse.json())
  const reviews = profileReviewsResponseSchema.parse(await reviewsResponse.json())
  const canonicalUrl = new URL(`/u/${profile.username}`, request.url).toString()

  return {
    profile,
    reviews: reviews.items,
    view: { page: reviews.meta.page, totalPages: reviews.meta.totalPages },
    canonicalUrl,
  }
}

export default function Profile({ loaderData }: Route.ComponentProps) {
  const session = useRouteLoaderData<typeof rootLoader>('root')
  return (
    <ProfilePage
      profile={loaderData.profile}
      reviews={loaderData.reviews}
      view={loaderData.view}
      viewer={session?.viewer ?? null}
    />
  )
}
