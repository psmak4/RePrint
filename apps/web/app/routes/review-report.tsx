import {
  reviewIdParamsSchema,
  reviewReportInputSchema,
  reviewReportResponseSchema,
} from '@reprint/shared'
import { data } from 'react-router'
import { copy } from '../copy/index.js'
import { failed, sendToApi } from '../lib/auth.server.js'
import type { Route } from './+types/review-report'

/** Resource route for the report dialog: POST files a report on a review (PRD §7.9). */
export async function action({ request, params }: Route.ActionArgs) {
  const id = reviewIdParamsSchema.safeParse(params)
  if (!id.success) throw data('Not found', { status: 404 })
  if (request.method !== 'POST') throw data('Method not allowed', { status: 405 })
  const input = reviewReportInputSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) {
    const note = input.error.issues.some((issue) => issue.path[0] === 'note')
    return data(
      note
        ? { fieldErrors: { note: copy.reviews.report.noteRequired } }
        : { formError: copy.reviews.report.failed },
      {
        status: 400,
      },
    )
  }
  const result = await sendToApi(
    request,
    'POST',
    `/v1/reviews/${id.data.id}/reports`,
    input.data,
    copy.reviews.report.failed,
  )
  if (!result.ok) return failed(result)
  return reviewReportResponseSchema.parse(result.body)
}
