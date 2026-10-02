import { createHash } from 'node:crypto'
import type { FastifyRequest, onSendAsyncHookHandler } from 'fastify'

/** Shared caches may keep a public response for a minute and serve it stale for five more (PRD §10). */
export const PUBLIC_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300'

/** A response with the viewer's own data: only that browser may keep it, and it must recheck. */
export const PRIVATE_CACHE_CONTROL = 'private, max-age=0, must-revalidate'

const viewerSpecific = new WeakSet<FastifyRequest>()

/**
 * Marks this request's response as holding the viewer's own data (such as `viewerShelf`), so
 * `publicCacheHook` keeps it out of shared caches (D-139).
 */
export function markViewerSpecific(request: FastifyRequest): void {
  viewerSpecific.add(request)
}

function matches(header: string | undefined, etag: string): boolean {
  if (!header) return false
  return header
    .split(',')
    .map((value) => value.trim().replace(/^W\//, ''))
    .some((value) => value === '*' || value === etag.replace(/^W\//, ''))
}

/** `onSend` hook for public GETs: `Cache-Control` and a weak ETag, and 304 on `If-None-Match`. */
export const publicCacheHook: onSendAsyncHookHandler = async (request, reply, payload) => {
  if (reply.statusCode !== 200 || typeof payload !== 'string') return payload
  const etag = `W/"${createHash('sha1').update(payload).digest('base64url')}"`
  // Signed-in and Visitor copies of one URL differ, so caches must key on the session cookie.
  const vary = reply.getHeader('Vary')
  reply.header('Vary', [vary, 'Cookie'].flat().filter(Boolean).join(', '))
  reply
    .header(
      'Cache-Control',
      viewerSpecific.has(request) ? PRIVATE_CACHE_CONTROL : PUBLIC_CACHE_CONTROL,
    )
    .header('ETag', etag)
  if (matches(request.headers['if-none-match'], etag)) {
    reply.code(304)
    return ''
  }
  return payload
}
