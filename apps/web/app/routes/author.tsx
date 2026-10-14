import {
  APP_NAME,
  AUTHOR_MAX_PAGE,
  authorDetailSchema,
  markdownToText,
  slugSchema,
} from '@reprint/shared'
import { data } from 'react-router'
import { AuthorPage } from '../components/books/author-page.js'
import { JsonLd } from '../components/seo/json-ld.js'
import { copy } from '../copy/index.js'
import { apiClientFor } from '../lib/api.server.js'
import { coverUrl } from '../lib/cover-url.js'
import { authorBreadcrumbs, authorJsonLd } from '../lib/json-ld.js'
import { logger } from '../lib/logger.server.js'
import { toRichTree } from '../lib/rich-text.server.js'
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
  // The Written list's page (D-203); anything outside 1 to 50 shows the first.
  const asked = Number(new URL(request.url).searchParams.get('page'))
  const page = Number.isInteger(asked) && asked >= 1 && asked <= AUTHOR_MAX_PAGE ? asked : 1

  let response: Response
  try {
    response = await apiClientFor(request).get(
      `/v1/authors/${slug.data}${page > 1 ? `?page=${page}` : ''}`,
    )
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

  const bio = markdownToText(author.bio ?? '').replace(/\s+/g, ' ')
  const metaDescription = bio
    ? bio.length > META_DESCRIPTION_LIMIT
      ? `${bio.slice(0, META_DESCRIPTION_LIMIT - 1)}…`
      : bio
    : copy.author.metaDescription(author.name)
  const canonicalUrl = new URL(`/authors/${author.slug}`, request.url).toString()

  const { origin } = new URL(request.url)
  const jsonLd = [authorJsonLd(origin, author), authorBreadcrumbs(origin, author)]

  // Parsed here, so the page draws it without a Markdown parser (M10-T08).
  const bioTree = author.bio?.trim() ? toRichTree(author.bio.trim()) : null
  return { author, bioTree, canonicalUrl, metaDescription, jsonLd, page }
}

export default function Author({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <JsonLd data={loaderData.jsonLd} />
      {/* A new key per Author, so nothing from the last Author's page (a failed photo) carries over. */}
      <AuthorPage
        key={loaderData.author.id}
        author={loaderData.author}
        bioTree={loaderData.bioTree}
        page={loaderData.page}
      />
    </>
  )
}
