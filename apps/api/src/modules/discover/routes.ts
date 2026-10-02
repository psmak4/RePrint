import { discoverResponseSchema } from '@reprint/shared'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { Redis } from 'ioredis'
import type { AuthRoutesOptions } from '../auth/register.js'
import { publicCacheHook } from '../catalog/public-cache.js'
import { addViewerShelves } from '../library/viewer-shelf.js'
import { loadDiscover } from './cache.js'

export interface DiscoverRoutesOptions extends AuthRoutesOptions {
  redis?: Redis
}

export const discoverRoutes: FastifyPluginAsyncZod<DiscoverRoutesOptions> = async (
  app,
  options,
) => {
  const { db, redis } = options
  app.addHook('onSend', publicCacheHook)

  // Rows are the same for everyone and cached in Redis; a signed-in viewer's Shelves are added
  // per request, and that response is private (PRD §7.2, §7.7).
  app.get(
    '/discover',
    { schema: { response: { 200: discoverResponseSchema } } },
    async (request) => {
      if (!db || !redis) throw new Error('discover needs a database and Redis')
      const rows = await loadDiscover(db, redis)
      await addViewerShelves(db, request, [
        ...(rows.recentlyReviewed ?? []),
        ...(rows.topRated ?? []),
        ...(rows.mostReviewedThisMonth ?? []),
        ...(rows.featuredReview ? [rows.featuredReview.book] : []),
      ])
      return rows
    },
  )
}
