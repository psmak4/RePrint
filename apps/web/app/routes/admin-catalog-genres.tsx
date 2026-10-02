import {
  type AdminGenre,
  type AdminSubjectRule,
  APP_NAME,
  adminGenreCreateSchema,
  adminGenreEditSchema,
  adminGenreSchema,
  adminGenresResponseSchema,
  adminSubjectRuleCreateSchema,
  adminSubjectRulesResponseSchema,
  PERMISSIONS,
} from '@reprint/shared'
import { data } from 'react-router'
import { z } from 'zod'
import { GenreManager } from '../components/admin/genre-manager.js'
import { copy } from '../copy/index.js'
import { requireViewerPermission } from '../lib/admin.server.js'
import { apiClientFor } from '../lib/api.server.js'
import { failed, sendToApi } from '../lib/auth.server.js'
import { logger } from '../lib/logger.server.js'
import type { Route } from './+types/admin-catalog-genres'

export function meta() {
  return [
    { title: `${APP_NAME}: ${copy.admin.genres.title}` },
    { name: 'robots', content: 'noindex' },
  ]
}

/** Every Genre (archived too) and every Subject rule (PRD §5.4, §7.11). */
export async function loader({ request }: Route.LoaderArgs) {
  await requireViewerPermission(request, PERMISSIONS.catalogManage)
  const client = apiClientFor(request)
  let genresResponse: Response
  let rulesResponse: Response
  try {
    ;[genresResponse, rulesResponse] = await Promise.all([
      client.get('/v1/admin/genres'),
      client.get('/v1/admin/subject-rules'),
    ])
  } catch (error) {
    logger.error({ err: error }, 'could not load Genres and rules')
    throw data(copy.admin.genres.loadFailed, { status: 502 })
  }
  for (const response of [genresResponse, rulesResponse]) {
    if (response.status === 401 || response.status === 403) {
      throw data('Forbidden', { status: response.status })
    }
  }
  if (!genresResponse.ok || !rulesResponse.ok) {
    logger.error(
      { genres: genresResponse.status, rules: rulesResponse.status },
      'Genre admin request failed',
    )
    throw data(copy.admin.genres.loadFailed, { status: 502 })
  }
  const genres: AdminGenre[] = adminGenresResponseSchema.parse(await genresResponse.json()).items
  const rules: AdminSubjectRule[] = adminSubjectRulesResponseSchema.parse(
    await rulesResponse.json(),
  ).items
  return { genres, rules }
}

const genreActionSchema = z.discriminatedUnion('intent', [
  z.object({ intent: z.literal('createGenre'), genre: adminGenreCreateSchema }),
  z.object({
    intent: z.literal('editGenre'),
    genreId: z.uuid(),
    changes: adminGenreEditSchema,
  }),
  z.object({ intent: z.literal('addRule'), rule: adminSubjectRuleCreateSchema }),
  z.object({ intent: z.literal('removeRule'), ruleId: z.uuid() }),
])

/** Each action is one permission-checked, audited API call. */
export async function action({ request }: Route.ActionArgs) {
  await requireViewerPermission(request, PERMISSIONS.catalogManage)
  const fallback = copy.admin.genres.failed
  const parsed = genreActionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return data({ formError: fallback }, { status: 400 })
  const input = parsed.data

  if (input.intent === 'createGenre') {
    const result = await sendToApi(request, 'POST', '/v1/admin/genres', input.genre, fallback)
    if (!result.ok) return failed(result)
    adminGenreSchema.parse(result.body)
    return { done: 'created' as const }
  }
  if (input.intent === 'editGenre') {
    const result = await sendToApi(
      request,
      'PATCH',
      `/v1/admin/genres/${input.genreId}`,
      input.changes,
      fallback,
    )
    if (!result.ok) return failed(result)
    adminGenreSchema.parse(result.body)
    const done =
      input.changes.archived === true
        ? ('archived' as const)
        : input.changes.archived === false
          ? ('restored' as const)
          : ('saved' as const)
    return { done, genreId: input.genreId }
  }
  if (input.intent === 'addRule') {
    const result = await sendToApi(request, 'POST', '/v1/admin/subject-rules', input.rule, fallback)
    if (!result.ok) return failed(result)
    return { done: 'ruleAdded' as const }
  }
  const result = await sendToApi(
    request,
    'DELETE',
    `/v1/admin/subject-rules/${input.ruleId}`,
    null,
    fallback,
  )
  if (!result.ok) return failed(result)
  return { done: 'ruleRemoved' as const }
}

export default function AdminCatalogGenres({ loaderData }: Route.ComponentProps) {
  return <GenreManager {...loaderData} />
}
