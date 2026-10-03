import { APP_NAME, authorDetailSchema, slugSchema } from '@reprint/shared'
import { data } from 'react-router'
import { AuthorPage } from '../components/books/author-page.js'
import { copy } from '../copy/index.js'
import { apiClientFor } from '../lib/api.server.js'
import { coverUrl } from '../lib/cover-url.js'
import { logger } from '../lib/logger.server.js'
import { pageMeta } from '../lib/seo.js'
import type { Route } from './+types/author'

const META_DESCRIPTION_LIMIT = 160

export function meta(args: Route.MetaArgs) {
  if (!args.loaderData) return [{ title: APP_NAME }]
  const { author, canonicalUrl, metaDescription } = args.loaderData
  return pageMeta(args, {
    title: `${author.name} | ${APP_NAME}`,
    description: metaDescription,
    canonicalUrl,
    openGraph: { type: 'profile', title: author.name, image: coverUrl(author.photo, 'large') },
  })
}

/** The Author and their Books grouped by Role, loaded on the server (PRD §7.5). */
export async function loader({ request, params }: Route.LoaderArgs) {
  const slug = slugSchema.safeParse(params.slug)
  if (!slug.success) throw data('Not found', { status: 404 })

  let response: Response
  try {
    response = await apiClientFor(request).get(`/v1/authors/${slug.data}`)
  } catch (error) {
    logger.error({ err: error }, 'could not load author')
    throw data(copy.author.loadFailed, { status: 502 })
  }
  if (response.status === 404) throw data('Not found', { status: 404 })
  if (!response.ok) {
    logger.error({ status: response.status }, 'author request failed')
    throw data(copy.author.loadFailed, { status: 502 })
  }
  const author = authorDetailSchema.parse(await response.json())

  const bio = author.bio?.trim().replace(/\s+/g, ' ')
  const metaDescription = bio
    ? bio.length > META_DESCRIPTION_LIMIT
      ? `${bio.slice(0, META_DESCRIPTION_LIMIT - 1)}…`
      : bio
    : copy.author.metaDescription(author.name)
  const canonicalUrl = new URL(`/authors/${author.slug}`, request.url).toString()

  return { author, canonicalUrl, metaDescription }
}

export default function Author({ loaderData }: Route.ComponentProps) {
  return <AuthorPage author={loaderData.author} />
}
