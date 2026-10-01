import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const loadSession = vi.fn()
vi.mock('../lib/auth.server.js', () => ({ loadSession: (r: Request) => loadSession(r) }))

import { loader, meta } from './admin-reviews.js'

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
