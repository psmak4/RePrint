import { helpfulVoteResponseSchema, reviewIdParamsSchema } from '@reprint/shared'
import { data } from 'react-router'
import { copy } from '../copy/index.js'
import { sendToApi } from '../lib/auth.server.js'
import type { Route } from './+types/review-helpful'

/** Resource route for the helpful button: POST marks a review helpful, DELETE takes the vote back. */
export async function action({ request, params }: Route.ActionArgs) {
  const parsed = reviewIdParamsSchema.safeParse(params)
  if (!parsed.success) throw data('Not found', { status: 404 })
  if (request.method !== 'POST' && request.method !== 'DELETE') {
    throw data('Method not allowed', { status: 405 })
  }
  const result = await sendToApi(
    request,
    request.method,
    `/v1/reviews/${parsed.data.id}/helpful`,
    null,
    copy.reviews.list.helpfulFailed,
  )
  if (!result.ok) return data(result.failure, { status: result.status })
  return helpfulVoteResponseSchema.parse(result.body)
}
