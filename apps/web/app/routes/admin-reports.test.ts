import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const loadSession = vi.fn()
vi.mock('../lib/auth.server.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/auth.server.js')>()),
  loadSession: (r: Request) => loadSession(r),
}))

import { action, loader, meta } from './admin-reports.js'

const id = (n: number) => `0192a3b4-0000-7000-8000-00000000000${n}`
const viewerWith = (permissions: string[]) => ({
  signupsOpen: false,
  viewer: { id: 'x', username: 'm', displayName: 'M', verified: true, permissions },
})

beforeEach(() => {
  loadSession.mockReset()
  loadSession.mockResolvedValue(viewerWith(['reports.resolve', 'reviews.moderate']))
})
afterEach(() => vi.unstubAllGlobals())

async function thrown(run: () => unknown) {
  return Promise.resolve()
    .then(run)
    .catch((e: unknown) => e)
}

const loaderArgs = (search = '') =>
  ({ request: new Request(`https://reprint.test/admin/reports${search}`) }) as never
const actionArgs = (body: unknown) =>
  ({
    request: new Request('https://reprint.test/admin/reports', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  }) as never

function stubApi(status = 200, body: unknown = {}) {
  const calls: { path: string; method: string; body: unknown }[] = []
  vi.stubGlobal('fetch', async (url: URL, init?: RequestInit) => {
    const u = new URL(String(url))
    calls.push({
      path: u.pathname + u.search,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
    })
    return Response.json(body, { status })
  })
  return calls
}

describe('admin reports loader', () => {
  it('loads the queue and reports what the viewer may do', async () => {
    const calls = stubApi(200, { items: [], meta: { nextCursor: null } })
    const result = (await loader(loaderArgs('?cursor=abc'))) as Record<string, unknown>
    expect(calls[0]?.path).toBe('/v1/mod/reports?limit=20&cursor=abc')
    expect(result.canUnpublish).toBe(true)
    expect(result.canSuspend).toBe(false)
  })

  it('lets an Admin suspend', async () => {
    loadSession.mockResolvedValue(viewerWith(['reports.resolve', 'users.suspend']))
    stubApi(200, { items: [], meta: { nextCursor: null } })
    const result = (await loader(loaderArgs())) as Record<string, unknown>
    expect(result.canSuspend).toBe(true)
    expect(result.canUnpublish).toBe(false)
  })

  it('refuses a Member without calling the API', async () => {
    loadSession.mockResolvedValue(viewerWith(['reviews.write']))
    const calls = stubApi()
    const error = (await thrown(() => loader(loaderArgs()))) as { init?: { status?: number } }
    expect(error.init?.status).toBe(403)
    expect(calls).toEqual([])
  })

  it('redirects Visitors to /login', async () => {
    loadSession.mockResolvedValue({ signupsOpen: false, viewer: null })
    const error = (await thrown(() => loader(loaderArgs()))) as Response
    expect(error.headers.get('location')).toBe('/login')
  })

  it('is noindex', () => {
    expect(meta()).toContainEqual({ name: 'robots', content: 'noindex' })
  })
})

describe('admin reports action', () => {
  it('dismisses the reports on a review', async () => {
    const calls = stubApi(200, { reviewId: id(1), closedReports: 2 })
    const result = await action(actionArgs({ intent: 'dismiss', reviewId: id(1) }))
    expect(calls[0]).toMatchObject({ path: `/v1/mod/reports/${id(1)}/dismiss`, method: 'POST' })
    expect(result).toEqual({ done: 'dismissed', reviewId: id(1) })
  })

  it('unpublishes with a reason', async () => {
    const calls = stubApi(200, { reviewId: id(1), status: 'unpublished', closedReports: 2 })
    await action(actionArgs({ intent: 'unpublish', reviewId: id(1), reason: 'Spam' }))
    expect(calls[0]).toMatchObject({
      path: `/v1/mod/reviews/${id(1)}/unpublish`,
      body: { reason: 'Spam' },
    })
  })

  it('refuses to unpublish without a reason', async () => {
    const calls = stubApi()
    const result = (await action(
      actionArgs({ intent: 'unpublish', reviewId: id(1), reason: '  ' }),
    )) as { init?: { status?: number } }
    expect(result.init?.status).toBe(400)
    expect(calls).toEqual([])
  })

  it('suspends the author for an Admin, with the end of the chosen day', async () => {
    loadSession.mockResolvedValue(viewerWith(['reports.resolve', 'users.suspend']))
    const calls = stubApi(200, {})
    const result = await action(
      actionArgs({
        intent: 'suspend',
        reviewId: id(1),
        userId: id(6),
        reason: 'Spam',
        until: '2026-11-01',
      }),
    )
    expect(calls[0]).toMatchObject({
      path: `/v1/admin/users/${id(6)}/suspend`,
      body: { reason: 'Spam', until: '2026-11-01T23:59:59.000Z' },
    })
    expect(result).toEqual({ done: 'suspended', reviewId: id(1) })
  })

  it('refuses a Moderator who tries to suspend, without calling the API', async () => {
    const calls = stubApi()
    const error = (await thrown(() =>
      action(actionArgs({ intent: 'suspend', reviewId: id(1), userId: id(6), reason: 'Spam' })),
    )) as { init?: { status?: number } }
    expect(error.init?.status).toBe(403)
    expect(calls).toEqual([])
  })

  it('passes an API refusal back to the form', async () => {
    stubApi(409, {
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      detail: 'Already decided.',
    })
    const result = (await action(actionArgs({ intent: 'dismiss', reviewId: id(1) }))) as {
      data?: { formError?: string }
      init?: { status?: number }
    }
    expect(result.init?.status).toBe(409)
    expect(result.data?.formError).toBe('Already decided.')
  })
})
