import { searchSuggestResponseSchema } from '@reprint/shared'
import { data } from 'react-router'
import { apiClientFor } from '../lib/api.server.js'
import { logger } from '../lib/logger.server.js'
import type { Route } from './+types/search-suggest'

const NONE = { books: [], authors: [] }

/** Resource route for the header search box: Catalog suggestions for what the visitor has typed. */
export async function loader({ request }: Route.LoaderArgs) {
  const q = new URL(request.url).searchParams.get('q') ?? ''
  try {
    const response = await apiClientFor(request).get(
      `/v1/search/suggest?q=${encodeURIComponent(q)}`,
    )
    if (!response.ok) return data(NONE, { status: response.status })
    return searchSuggestResponseSchema.parse(await response.json())
  } catch (error) {
    logger.error({ err: error }, 'could not load search suggestions')
    return data(NONE, { status: 502 })
  }
}
