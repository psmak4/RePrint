import { discoverResponseSchema } from '@reprint/shared'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { Redis } from 'ioredis'
import type { AuthRoutesOptions } from '../auth/register.js'
import { publicCacheHook } from '../catalog/public-cache.js'
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

  // The same page for Visitors and Members, so it is public and shared-cacheable (PRD §7.2).
  app.get('/discover', { schema: { response: { 200: discoverResponseSchema } } }, async () => {
    if (!db || !redis) throw new Error('discover needs a database and Redis')
    return loadDiscover(db, redis)
  })
}
