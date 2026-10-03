import { sitemapChunkParamsSchema, sitemapChunkSchema, sitemapIndexSchema } from '@reprint/shared'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { Redis } from 'ioredis'
import { HttpProblem } from '../../errors.js'
import type { AuthRoutesOptions } from '../auth/register.js'
import { publicCacheHook } from '../catalog/public-cache.js'
import { loadSitemapChunk, loadSitemapIndex } from './build.js'

export interface SitemapRoutesOptions extends AuthRoutesOptions {
  redis?: Redis
}

/** The nightly build, for the web app to render as XML (it knows the public origin). */
export const sitemapRoutes: FastifyPluginAsyncZod<SitemapRoutesOptions> = async (app, options) => {
  const { redis } = options
  app.addHook('onSend', publicCacheHook)

  app.get('/sitemaps', { schema: { response: { 200: sitemapIndexSchema } } }, async () => {
    if (!redis) throw new Error('sitemap routes need Redis')
    const index = await loadSitemapIndex(redis)
    if (!index) throw new HttpProblem(404, 'The sitemap has not been built yet.')
    return index
  })

  app.get(
    '/sitemaps/:number',
    { schema: { params: sitemapChunkParamsSchema, response: { 200: sitemapChunkSchema } } },
    async (request) => {
      if (!redis) throw new Error('sitemap routes need Redis')
      const chunk = await loadSitemapChunk(redis, request.params.number)
      if (!chunk) throw new HttpProblem(404, 'We could not find that sitemap.')
      return chunk
    },
  )
}
