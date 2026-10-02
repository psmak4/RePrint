import {
  candidateRefSchema,
  resolveBookRequestSchema,
  resolveBookResponseSchema,
} from '@reprint/shared'
import { data, redirect } from 'react-router'
import { ResolvePage } from '../components/books/resolve-page.js'
import { copy } from '../copy/index.js'
import { apiClientFor } from '../lib/api.server.js'
import { sendToApi } from '../lib/auth.server.js'
import { logger } from '../lib/logger.server.js'
import type { Route } from './+types/resolve'

export function meta() {
  return [{ title: copy.resolve.title }, { name: 'robots', content: 'noindex' }]
}

/** Stores a search result the Catalog doesn't have yet, then sends the reader to its page (PRD §6). */
export async function loader({ request }: Route.LoaderArgs) {
  const ref = candidateRefSchema.safeParse(new URL(request.url).searchParams.get('ref'))
  if (!ref.success) return data({ state: 'notFound' as const, ref: null }, { status: 404 })

  try {
    const response = await apiClientFor(request).request('/v1/books/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ref: ref.data }),
    })
    if (response.status === 404)
      return data({ state: 'notFound' as const, ref: null }, { status: 404 })
    if (!response.ok) {
      logger.warn({ status: response.status }, 'resolve request failed')
      return data({ state: 'failed' as const, ref: ref.data }, { status: 503 })
    }
    const { slug } = resolveBookResponseSchema.parse(await response.json())
    return redirect(`/books/${slug}`)
  } catch (error) {
    logger.error({ err: error }, 'could not resolve book')
    return data({ state: 'failed' as const, ref: ref.data }, { status: 503 })
  }
}

export default function Resolve({ loaderData }: Route.ComponentProps) {
  return <ResolvePage state={loaderData.state} candidateRef={loaderData.ref} />
}

/** Stores a search result for the shelf control, which shelves the Book once it has a slug (PRD §6, §7.7). */
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== 'POST') throw data('Method not allowed', { status: 405 })
  const input = resolveBookRequestSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) throw data('Bad request', { status: 400 })
  const result = await sendToApi(
    request,
    'POST',
    '/v1/books/resolve',
    { ref: input.data.ref },
    copy.shelves.failed,
  )
  if (!result.ok) return data(result.failure, { status: result.status })
  return resolveBookResponseSchema.parse(result.body)
}
