import { resolveBookResponseSchema, slugParamsSchema } from '@reprint/shared'
import { data } from 'react-router'
import { copy } from '../copy/index.js'
import { sendToApi } from '../lib/auth.server.js'
import type { Route } from './+types/book-reached'

/**
 * Resource route for a click on a stored Book in search results or suggestions: the reader has
 * reached it, so a Book a Series sync brought in may fill in its own Series (D-200).
 */
export async function action({ request, params }: Route.ActionArgs) {
  const parsed = slugParamsSchema.safeParse(params)
  if (!parsed.success) throw data('Not found', { status: 404 })
  if (request.method !== 'POST') throw data('Method not allowed', { status: 405 })
  const result = await sendToApi(
    request,
    'POST',
    `/v1/books/${parsed.data.slug}/reached`,
    null,
    copy.resolve.failedBody,
  )
  if (!result.ok) return data(result.failure, { status: result.status })
  return resolveBookResponseSchema.parse(result.body)
}
