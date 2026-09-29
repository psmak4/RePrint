export type ApiClientOptions = {
  /** Base URL of the API for server-side calls (`API_INTERNAL_URL`). */
  baseUrl: string
  /** The incoming web request whose `cookie` and `x-request-id` headers are forwarded. */
  request: Request
  fetch?: typeof fetch
}

export type ApiClient = {
  get(path: string, init?: RequestInit): Promise<Response>
  request(path: string, init?: RequestInit): Promise<Response>
}

/** Server-side API client for loaders and actions. Never use it in browser code. */
export function createApiClient({
  baseUrl,
  request,
  fetch: fetchImpl = fetch,
}: ApiClientOptions): ApiClient {
  const forwarded = new Headers()
  const cookie = request.headers.get('cookie')
  if (cookie) forwarded.set('cookie', cookie)
  // The API refuses writes without an allowed Origin, and rate limits by client IP.
  forwarded.set('origin', request.headers.get('origin') ?? new URL(request.url).origin)
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) forwarded.set('x-forwarded-for', forwardedFor)
  forwarded.set('x-request-id', request.headers.get('x-request-id') ?? crypto.randomUUID())

  const send = (path: string, init: RequestInit = {}) => {
    const headers = new Headers(forwarded)
    for (const [name, value] of new Headers(init.headers)) headers.set(name, value)
    return fetchImpl(new URL(path, baseUrl), { ...init, headers })
  }
  return { request: send, get: (path, init) => send(path, { ...init, method: 'GET' }) }
}

export function apiClientFor(request: Request): ApiClient {
  const baseUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:3000'
  return createApiClient({ baseUrl, request })
}
