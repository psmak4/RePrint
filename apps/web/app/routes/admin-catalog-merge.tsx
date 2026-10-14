import {
  type AdminMergeCandidatesResponse,
  APP_NAME,
  adminBookMergeResponseSchema,
  adminBookMergeSchema,
  adminMergeCandidatesResponseSchema,
  PERMISSIONS,
} from '@reprint/shared'
import { data } from 'react-router'
import { z } from 'zod'
import { MergeQueue } from '../components/admin/merge-queue.js'
import { adminCopy } from '../copy/admin.js'
import { requireViewerPermission } from '../lib/admin.server.js'
import { apiClientFor } from '../lib/api.server.js'
import { failed, sendToApi } from '../lib/auth.server.js'
import { logger } from '../lib/logger.server.js'
import { pageMeta } from '../lib/seo.js'
import type { Route } from './+types/admin-catalog-merge'

const QUEUE_PAGE_SIZE = 20

export function meta(args: Route.MetaArgs) {
  return pageMeta(args, { title: `${APP_NAME}: ${adminCopy.merge.title}`, noindex: true })
}

/** Open merge candidates, oldest first (PRD §7.11). */
export async function loader({ request, context }: Route.LoaderArgs) {
  await requireViewerPermission({ request, context }, PERMISSIONS.catalogManage)
  const cursor = new URL(request.url).searchParams.get('cursor') || null
  const query = new URLSearchParams({ limit: String(QUEUE_PAGE_SIZE) })
  if (cursor) query.set('cursor', cursor)
  let response: Response
  try {
    response = await apiClientFor(request).get(`/v1/admin/books/merge-candidates?${query}`)
  } catch (error) {
    logger.error({ err: error }, 'could not load the merge queue')
    throw data(adminCopy.merge.loadFailed, { status: 502 })
  }
  if (response.status === 401 || response.status === 403) {
    throw data('Forbidden', { status: response.status })
  }
  if (!response.ok) {
    logger.error({ status: response.status }, 'merge queue request failed')
    throw data(adminCopy.merge.loadFailed, { status: 502 })
  }
  const queue: AdminMergeCandidatesResponse = adminMergeCandidatesResponseSchema.parse(
    await response.json(),
  )
  return { queue }
}

const mergeActionSchema = z.discriminatedUnion('intent', [
  z.object({
    intent: z.literal('merge'),
    candidateId: z.uuid(),
    merge: adminBookMergeSchema,
  }),
  z.object({ intent: z.literal('dismiss'), candidateId: z.uuid() }),
])

/** Merge a pair (one Book into the other) or dismiss it. Each is an audited API call. */
export async function action({ request, context }: Route.ActionArgs) {
  await requireViewerPermission({ request, context }, PERMISSIONS.catalogManage)
  const fallback = adminCopy.merge.failed
  const parsed = mergeActionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return data({ formError: fallback }, { status: 400 })
  const input = parsed.data

  if (input.intent === 'dismiss') {
    const result = await sendToApi(
      request,
      'POST',
      `/v1/admin/books/merge-candidates/${input.candidateId}/dismiss`,
      {},
      fallback,
    )
    if (!result.ok) return failed(result)
    return { done: 'dismissed' as const, candidateId: input.candidateId }
  }
  const result = await sendToApi(request, 'POST', '/v1/admin/books/merge', input.merge, fallback)
  if (!result.ok) return failed(result)
  const { moved } = adminBookMergeResponseSchema.parse(result.body)
  return { done: 'merged' as const, candidateId: input.candidateId, moved }
}

export default function AdminCatalogMerge({ loaderData }: Route.ComponentProps) {
  return <MergeQueue {...loaderData} />
}
