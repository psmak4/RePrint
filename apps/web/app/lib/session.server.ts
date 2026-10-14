import type { SessionResponse } from '@reprint/shared'
import { createContext, type RouterContextProvider } from 'react-router'
import { loadSession } from './auth.server.js'

/** The request's session, loaded on first use and shared by every loader and action (M10-T02). */
const sessionContext = createContext<(() => Promise<SessionResponse>) | null>(null)

/** The cookie the API sets for a signed-in Member; without it the request is a Visitor's. */
const SESSION_COOKIE = 'rp_session'

type Next = () => Promise<unknown>

/**
 * Root route middleware: gives the request one session lookup that its loaders and actions share,
 * so a page asks the API for the session once however many routes need it. Nothing is fetched
 * until a route asks.
 */
export function sessionMiddleware(
  { request, context }: { request: Request; context: Readonly<RouterContextProvider> },
  next: Next,
): Promise<unknown> {
  let session: Promise<SessionResponse> | undefined
  context.set(sessionContext, () => {
    session ??= loadSession(request)
    return session
  })
  return next()
}

/**
 * The viewer and signup state for this request, from the lookup `sessionMiddleware` shares. A call
 * without that context (a loader run on its own, as in route tests) loads it directly.
 */
export function viewerSession({
  request,
  context,
}: {
  request: Request
  context?: Readonly<RouterContextProvider>
}): Promise<SessionResponse> {
  const shared = context?.get(sessionContext)
  return shared ? shared() : loadSession(request)
}

/** Whether the request carries a session cookie, so a signed-in lookup is worth starting early. */
export function hasSessionCookie(request: Request): boolean {
  const cookie = request.headers.get('cookie') ?? ''
  return cookie.split(';').some((part) => part.trim().startsWith(`${SESSION_COOKIE}=`))
}
