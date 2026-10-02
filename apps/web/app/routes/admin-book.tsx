import {
  type AdminBookDetail,
  type AdminGenre,
  APP_NAME,
  adminBookDetailSchema,
  adminBookEditSchema,
  adminBookSchema,
  adminGenresResponseSchema,
  PERMISSIONS,
} from '@reprint/shared'
import { data } from 'react-router'
import { z } from 'zod'
import { BookEditor } from '../components/admin/book-editor.js'
import { copy } from '../copy/index.js'
import { requireViewerPermission } from '../lib/admin.server.js'
import { apiClientFor } from '../lib/api.server.js'
import { failed, sendToApi } from '../lib/auth.server.js'
import { logger } from '../lib/logger.server.js'
import type { Route } from './+types/admin-book'

export function meta() {
  return [
    { title: `${APP_NAME}: ${copy.admin.book.title}` },
    { name: 'robots', content: 'noindex' },
  ]
}

/** One Book as an Admin edits it, with the Genres to choose from (PRD §7.11). */
export async function loader({ request, params }: Route.LoaderArgs) {
  await requireViewerPermission(request, PERMISSIONS.catalogManage)
  const client = apiClientFor(request)
  let bookResponse: Response
  let genresResponse: Response
  try {
    ;[bookResponse, genresResponse] = await Promise.all([
      client.get(`/v1/admin/books/${encodeURIComponent(params.id)}`),
      client.get('/v1/admin/genres'),
    ])
  } catch (error) {
    logger.error({ err: error }, 'could not load the admin Book')
    throw data(copy.admin.book.loadFailed, { status: 502 })
  }
  for (const response of [bookResponse, genresResponse]) {
    if (response.status === 401 || response.status === 403) {
      throw data('Forbidden', { status: response.status })
    }
  }
  if (bookResponse.status === 404 || bookResponse.status === 400) {
    throw data('Not found', { status: 404 })
  }
  if (!bookResponse.ok || !genresResponse.ok) {
    logger.error(
      { book: bookResponse.status, genres: genresResponse.status },
      'admin Book request failed',
    )
    throw data(copy.admin.book.loadFailed, { status: 502 })
  }
  const book: AdminBookDetail = adminBookDetailSchema.parse(await bookResponse.json())
  const genres: AdminGenre[] = adminGenresResponseSchema
    .parse(await genresResponse.json())
    .items.filter((genre) => !genre.archived)
  return { book, genres }
}

const bookActionSchema = z.discriminatedUnion('intent', [
  z.object({ intent: z.literal('edit'), changes: adminBookEditSchema }),
  z.object({ intent: z.literal('refresh') }),
])

/** Each action is one permission-checked, audited API call. The Cover goes up as multipart. */
export async function action({ request, params }: Route.ActionArgs) {
  await requireViewerPermission(request, PERMISSIONS.catalogManage)
  const base = `/v1/admin/books/${encodeURIComponent(params.id)}`
  const fallback = copy.admin.book.failed

  if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
    const file = (await request.formData().catch(() => null))?.get('file')
    if (!(file instanceof File) || file.size === 0) {
      return data({ formError: copy.admin.book.coverChoose }, { status: 400 })
    }
    const upload = new FormData()
    upload.set('file', file, file.name)
    const result = await sendToApi(request, 'POST', `${base}/cover`, upload, fallback)
    if (!result.ok) return failed(result)
    return { done: 'cover' as const, book: adminBookSchema.parse(result.body) }
  }

  const parsed = bookActionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return data({ formError: fallback }, { status: 400 })
  if (parsed.data.intent === 'refresh') {
    const result = await sendToApi(request, 'POST', `${base}/refresh`, {}, fallback)
    if (!result.ok) return failed(result)
    return { done: 'refresh' as const }
  }
  const result = await sendToApi(request, 'PATCH', base, parsed.data.changes, fallback)
  if (!result.ok) return failed(result)
  return { done: 'edit' as const, book: adminBookSchema.parse(result.body) }
}

export default function AdminBook({ loaderData }: Route.ComponentProps) {
  return <BookEditor {...loaderData} />
}
