export const REQUEST_ID_HEADER = 'x-request-id'
// Only accept sane caller-supplied IDs so they can't inject into logs (same rule as the API).
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/

/**
 * Returns the request's ID, stamping a new one onto the request headers when it has none. The
 * API client forwards this header, so one page view has one ID in the web and API logs.
 */
export function ensureRequestId(request: Request): string {
  const existing = request.headers.get(REQUEST_ID_HEADER)
  if (existing && SAFE_REQUEST_ID.test(existing)) return existing
  const id = crypto.randomUUID()
  request.headers.set(REQUEST_ID_HEADER, id)
  return id
}
