import type { Logger } from 'pino'
import { ensureRequestId, REQUEST_ID_HEADER } from './request-id.server.js'

type Next = () => Promise<unknown>

/**
 * Root route middleware: assigns the request ID before any loader runs, logs one line per request,
 * and echoes the ID on the response.
 */
export function createRequestLogMiddleware(log: Logger) {
  return async ({ request }: { request: Request }, next: Next): Promise<unknown> => {
    const reqId = ensureRequestId(request)
    const started = performance.now()
    const { pathname } = new URL(request.url)
    const result = await next()
    const status = result instanceof Response ? result.status : undefined
    if (result instanceof Response) result.headers.set(REQUEST_ID_HEADER, reqId)
    log.info(
      {
        reqId,
        method: request.method,
        path: pathname,
        status,
        durationMs: Math.round(performance.now() - started),
      },
      'request completed',
    )
    return result
  }
}
