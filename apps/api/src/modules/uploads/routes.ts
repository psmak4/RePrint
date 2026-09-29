import type { FastifyPluginAsync } from 'fastify'
import { HttpProblem } from '../../errors.js'
import type { LocalImageStorage } from '../../storage/index.js'

const SERVABLE_KEY = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.webp$/

/** Serves locally stored uploads (`STORAGE_DRIVER=local`). In deployed environments the CDN does this. */
export const uploadRoutes: FastifyPluginAsync<{ storage: LocalImageStorage }> = async (
  app,
  options,
) => {
  app.get<{ Params: { '*': string } }>(
    '/uploads/*',
    // Image loads are not API reads, so they skip the anonymous read limit.
    { config: { rateLimit: false } },
    async (request, reply) => {
      const key = request.params['*']
      const body = SERVABLE_KEY.test(key) ? await options.storage.read(key) : null
      if (!body) throw new HttpProblem(404, 'No such image.')
      return (
        reply
          .type('image/webp')
          .header('cache-control', 'public, max-age=31536000, immutable')
          // helmet's default is same-origin; the web app on another origin must be able to show these.
          .header('cross-origin-resource-policy', 'cross-origin')
          .send(body)
      )
    },
  )
}
