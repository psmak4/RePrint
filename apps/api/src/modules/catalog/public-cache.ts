import { createHash } from 'node:crypto'
import type { onSendAsyncHookHandler } from 'fastify'

/** Shared caches may keep a public response for a minute and serve it stale for five more (PRD §10). */
export const PUBLIC_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300'

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
  reply.header('Cache-Control', PUBLIC_CACHE_CONTROL).header('ETag', etag)
  if (matches(request.headers['if-none-match'], etag)) {
    reply.code(304)
    return ''
  }
  return payload
}
