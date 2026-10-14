import { RouterContextProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const loadSession = vi.fn()
vi.mock('../lib/auth.server.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/auth.server.js')>()),
  loadSession: (r: Request) => loadSession(r),
}))

import { sessionMiddleware } from '../lib/session.server.js'
import { middleware, loader as rootLoader } from '../root.js'
import { loader as adminLoader } from './admin.js'
import { loader as adminUsersLoader } from './admin-users.js'
import { loader as bookLoader } from './book.js'
import { loader as settingsLoader } from './settings.js'
import { loader as settingsProfileLoader } from './settings-profile.js'

const id = (n: number) => `0192a3b4-0000-7000-8000-00000000000${n}`
const rating = { average: null, count: 0, distribution: [0, 0, 0, 0, 0] }
const member = (permissions: string[] = []) => ({
  signupsOpen: true,
  viewer: { id: id(1), username: 'ada', displayName: 'Ada', verified: true, permissions },
})
const NO_NOTIFICATIONS = {
  items: [],
  meta: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
  unreadCount: 0,
}
const BOOK = {
  id: id(2),
  slug: 'dune-abc123',
  title: 'Dune',
  subtitle: null,
  description: null,
  firstPublishedYear: 1965,
  originalLanguage: 'en',
  primaryEditionId: null,
  cover: null,
  contributions: [
    {
      author: { id: id(3), slug: 'frank-herbert', name: 'Frank Herbert' },
      role: 'author',
      position: 0,
    },
  ],
  series: [],
  genres: [],
  primaryEdition: null,
  editionCount: 0,
  rating,
}

/** Every API path the loaders asked for, answered from `routes` (404 otherwise). */
function stubApi(routes: Record<string, unknown> = {}) {
  const calls: string[] = []
  vi.stubGlobal('fetch', async (url: URL) => {
    const { pathname } = new URL(String(url))
    calls.push(pathname)
    return pathname in routes
      ? Response.json(routes[pathname])
      : new Response(null, { status: 404 })
  })
  return calls
}

type Args = { request: Request; params: Record<string, string>; context: RouterContextProvider }

/** Runs `loaders` side by side under the session middleware, as React Router does for one request. */
async function oneRequest(
  url: string,
  params: Record<string, string>,
  loaders: ((args: Args) => unknown)[],
): Promise<PromiseSettledResult<unknown>[]> {
  const request = new Request(url, { headers: { cookie: 'rp_session=abc' } })
  const context = new RouterContextProvider()
  let results: PromiseSettledResult<unknown>[] = []
  await sessionMiddleware({ request, context }, async () => {
    results = await Promise.allSettled(
      loaders.map((run) => Promise.resolve().then(() => run({ request, params, context }))),
    )
  })
  return results
}

beforeEach(() => loadSession.mockReset())
afterEach(() => vi.unstubAllGlobals())

describe('one session lookup per request (M10-T02)', () => {
  it('runs the session middleware on every route, from the root', () => {
    expect(middleware).toContain(sessionMiddleware)
  })

  it('looks the session up once for the Book page', async () => {
    loadSession.mockResolvedValue(member())
    stubApi({
      '/v1/me/notifications': NO_NOTIFICATIONS,
      '/v1/books/dune-abc123': BOOK,
      '/v1/books/dune-abc123/editions': { items: [] },
    })
    const [root, book] = await oneRequest(
      'https://reprint.test/books/dune-abc123',
      { slug: 'dune-abc123' },
      [rootLoader as never, bookLoader as never],
    )
    expect(root?.status).toBe('fulfilled')
    expect(book?.status).toBe('fulfilled')
    expect(loadSession).toHaveBeenCalledTimes(1)
  })

  it('looks the session up once for an admin page', async () => {
    loadSession.mockResolvedValue(member(['users.view']))
    stubApi({
      '/v1/me/notifications': NO_NOTIFICATIONS,
      '/v1/admin/users': { items: [], meta: { nextCursor: null } },
    })
    const results = await oneRequest('https://reprint.test/admin/users', {}, [
      rootLoader as never,
      adminLoader as never,
      adminUsersLoader as never,
    ])
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled'])
    expect(loadSession).toHaveBeenCalledTimes(1)
  })

  it('looks the session up once for a settings page', async () => {
    loadSession.mockResolvedValue(member())
    stubApi({ '/v1/me/notifications': NO_NOTIFICATIONS })
    await oneRequest('https://reprint.test/settings/profile', {}, [
      rootLoader as never,
      settingsLoader as never,
      settingsProfileLoader as never,
    ])
    expect(loadSession).toHaveBeenCalledTimes(1)
  })
})

describe('root loader', () => {
  it('asks for the notifications beside the session when the request has a session cookie', async () => {
    let finish: (value: unknown) => void = () => {}
    loadSession.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const calls = stubApi({ '/v1/me/notifications': NO_NOTIFICATIONS })
    const request = new Request('https://reprint.test/', { headers: { cookie: 'rp_session=abc' } })
    const pending = rootLoader({ request, context: new RouterContextProvider() } as never)
    await vi.waitFor(() => expect(calls).toEqual(['/v1/me/notifications']))
    finish(member())
    const data = await pending
    expect(data.viewer?.username).toBe('ada')
    expect(data.notifications).toEqual(NO_NOTIFICATIONS)
  })

  it('asks for no notifications without a session cookie', async () => {
    loadSession.mockResolvedValue({ signupsOpen: true, viewer: null })
    const calls = stubApi()
    const data = await rootLoader({
      request: new Request('https://reprint.test/'),
      context: new RouterContextProvider(),
    } as never)
    expect(calls).toEqual([])
    expect(data.viewer).toBeNull()
    expect(data.notifications).toBeNull()
  })

  it('drops the notifications when the cookie no longer signs anyone in', async () => {
    loadSession.mockResolvedValue({ signupsOpen: true, viewer: null })
    stubApi({ '/v1/me/notifications': NO_NOTIFICATIONS })
    const data = await rootLoader({
      request: new Request('https://reprint.test/', { headers: { cookie: 'rp_session=stale' } }),
      context: new RouterContextProvider(),
    } as never)
    expect(data.viewer).toBeNull()
    expect(data.notifications).toBeNull()
  })

  it('renders a signed-in page without the bell list when notifications fail', async () => {
    loadSession.mockResolvedValue(member())
    stubApi()
    const data = await rootLoader({
      request: new Request('https://reprint.test/', { headers: { cookie: 'rp_session=abc' } }),
      context: new RouterContextProvider(),
    } as never)
    expect(data.viewer?.username).toBe('ada')
    expect(data.notifications).toBeNull()
  })
})
