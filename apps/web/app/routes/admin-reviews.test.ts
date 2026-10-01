import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const loadSession = vi.fn()
vi.mock('../lib/auth.server.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/auth.server.js')>()),
  loadSession: (r: Request) => loadSession(r),
}))

import { action, loader, meta } from './admin-reviews.js'

const id = (n: number) => `0192a3b4-0000-7000-8000-00000000000${n}`
const item = (n: number, claim: unknown = null) => ({
  id: id(n),
  book: { slug: `book-${n}`, title: `Book ${n}` },
  reviewer: {
    username: 'ada',
    displayName: 'Ada',
    approvedCount: 2,
    rejectedCount: 1,
    reportedCount: 0,
  },
  rating: 4,
  headline: null,
  body: 'x'.repeat(60),
  hasSpoilers: false,
  editionId: null,
  version: 1,
  submittedAt: '2026-10-01T00:00:00.000Z',
  lastApproved: null,
  claim,
})

beforeEach(() => {
  loadSession.mockReset()
  loadSession.mockResolvedValue({
    signupsOpen: false,
    viewer: {
      id: 'x',
      username: 'm',
      displayName: 'M',
      verified: true,
      permissions: ['reviews.moderate'],
    },
  })
})
afterEach(() => vi.unstubAllGlobals())

function run(search: string, items = [item(1), item(2)], claimStatus = 200) {
  const calls: string[] = []
  vi.stubGlobal('fetch', async (url: URL, init?: RequestInit) => {
    const u = new URL(String(url))
    calls.push(`${init?.method} ${u.pathname}${u.search}`)
    if (u.pathname === '/v1/mod/reviews') {
      return Response.json({ items, meta: { nextCursor: null } })
    }
    if (u.pathname.endsWith('/claim')) {
      return claimStatus === 200
        ? Response.json({ reviewId: id(1), expiresAt: '2026-10-01T01:10:00.000Z' })
        : new Response(null, { status: claimStatus })
    }
    return new Response(null, { status: 404 })
  })
  return {
    calls,
    result: loader({
      request: new Request(`https://reprint.test/admin/reviews${search}`),
    } as never),
  }
}

describe('admin reviews loader', () => {
  it('lists the queue without claiming anything', async () => {
    const { calls, result } = run('')
    const data = await result
    expect(data.queue.items).toHaveLength(2)
    expect(data.selected).toBeNull()
    expect(calls).toEqual(['GET /v1/mod/reviews?limit=20'])
  })

  it('passes the cursor to the API', async () => {
    const { calls, result } = run('?cursor=abc')
    await result
    expect(calls).toEqual(['GET /v1/mod/reviews?limit=20&cursor=abc'])
  })

  it('claims the opened review for the viewer', async () => {
    const { calls, result } = run(`?review=${id(1)}`)
    const data = await result
    expect(data.selected?.id).toBe(id(1))
    expect(data.claim).toEqual({ state: 'mine', expiresAt: '2026-10-01T01:10:00.000Z' })
    expect(calls).toContain(`POST /v1/mod/reviews/${id(1)}/claim`)
  })

  it('does not claim a review another Moderator holds', async () => {
    const held = item(1, {
      expiresAt: '2026-10-01T01:10:00.000Z',
      mine: false,
      moderator: { username: 'bo', displayName: 'Bo' },
    })
    const { calls, result } = run(`?review=${id(1)}`, [held])
    expect((await result).claim).toEqual({ state: 'other', name: 'Bo' })
    expect(calls.some((c) => c.startsWith('POST'))).toBe(false)
  })

  it('reports a lost claim race (409) without failing the page', async () => {
    const { result } = run(`?review=${id(1)}`, [item(1)], 409)
    expect((await result).claim).toEqual({ state: 'other', name: null })
  })

  it('treats a review outside the queue as not found without claiming', async () => {
    const { calls, result } = run(`?review=${id(9)}`)
    const data = await result
    expect(data.selected).toBeNull()
    expect(data.requested).toBe(true)
    expect(calls).toHaveLength(1)
  })

  it('refuses a viewer without the moderate permission', async () => {
    loadSession.mockResolvedValue({
      signupsOpen: false,
      viewer: { id: 'x', username: 'm', displayName: 'M', verified: true, permissions: [] },
    })
    const { result } = run('')
    await expect(result).rejects.toMatchObject({ init: { status: 403 } })
  })

  it('is noindex', () => {
    expect(meta()).toContainEqual({ name: 'robots', content: 'noindex' })
  })
})

describe('admin reviews action', () => {
  const post = (body: unknown) =>
    action({
      request: new Request('https://reprint.test/admin/reviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    } as never)

  function stubApi(status = 200) {
    const calls: { path: string; body: unknown }[] = []
    vi.stubGlobal('fetch', async (url: URL, init?: RequestInit) => {
      calls.push({ path: new URL(String(url)).pathname, body: JSON.parse(String(init?.body)) })
      return status === 200
        ? Response.json({ reviewId: id(1), status: 'rejected' })
        : Response.json({ type: 'about:blank', title: 'Conflict', status }, { status })
    })
    return calls
  }

  it('posts a rejection with its reason as JSON', async () => {
    const calls = stubApi()
    const result = await post({ intent: 'reject', reviewId: id(1), reason: ' Too short. ' })
    expect(result).toEqual({ decided: 'rejected', reviewId: id(1) })
    expect(calls).toEqual([
      { path: `/v1/mod/reviews/${id(1)}/reject`, body: { reason: 'Too short.' } },
    ])
  })

  it('sends an empty JSON body for an approval without a reason', async () => {
    const calls = stubApi()
    await post({ intent: 'approve', reviewId: id(1) })
    expect(calls).toEqual([{ path: `/v1/mod/reviews/${id(1)}/approve`, body: {} }])
  })

  it('returns the API failure as a form error', async () => {
    stubApi(409)
    const result = (await post({ intent: 'approve', reviewId: id(1) })) as {
      init: { status: number }
    }
    expect(result.init.status).toBe(409)
  })

  it('rejects a malformed body with 400 and never calls the API', async () => {
    const calls = stubApi()
    const result = (await post({ intent: 'delete', reviewId: 'nope' })) as {
      init: { status: number }
    }
    expect(result.init.status).toBe(400)
    expect(calls).toEqual([])
  })

  it('refuses a viewer without the moderate permission', async () => {
    loadSession.mockResolvedValue({
      signupsOpen: false,
      viewer: { id: 'x', username: 'm', displayName: 'M', verified: true, permissions: [] },
    })
    const calls = stubApi()
    await expect(post({ intent: 'approve', reviewId: id(1) })).rejects.toMatchObject({
      init: { status: 403 },
    })
    expect(calls).toEqual([])
  })
})
