import type { FastifyInstance } from 'fastify'
import { HttpProblem } from '../errors.js'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Change requests must carry an `Origin` from the allowed web origins (PRD §10).
 * A missing `Origin` is rejected too: browsers always send it on cross-site writes.
 */
export function registerOriginCheck(app: FastifyInstance, allowedOrigins: readonly string[]): void {
  const allowed = new Set(allowedOrigins.map((origin) => new URL(origin).origin))
  app.addHook('onRequest', async (request) => {
    if (SAFE_METHODS.has(request.method)) return
    const origin = request.headers.origin
    if (!origin || !allowed.has(origin)) {
      throw new HttpProblem(403, 'This request did not come from an allowed origin.')
    }
  })
}
