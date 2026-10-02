import { setShelfInputSchema, shelfResponseSchema, slugParamsSchema } from '@reprint/shared'
import { data } from 'react-router'
import { copy } from '../copy/index.js'
import { sendToApi } from '../lib/auth.server.js'
import type { Route } from './+types/book-shelf'

/** Resource route for the shelf control: PUT sets or replaces the Shelf, DELETE removes the Book from it. */
export async function action({ request, params }: Route.ActionArgs) {
  const parsed = slugParamsSchema.safeParse(params)
  if (!parsed.success) throw data('Not found', { status: 404 })
  if (request.method !== 'PUT' && request.method !== 'DELETE') {
    throw data('Method not allowed', { status: 405 })
  }
  let body: unknown = null
  if (request.method === 'PUT') {
    const input = setShelfInputSchema.safeParse(await request.json().catch(() => null))
    if (!input.success) throw data('Bad request', { status: 400 })
    body = input.data
  }
  const result = await sendToApi(
    request,
    request.method,
    `/v1/books/${parsed.data.slug}/shelf`,
    body,
    copy.shelves.failed,
  )
  if (!result.ok) return data(result.failure, { status: result.status })
  return shelfResponseSchema.parse(result.body)
}
