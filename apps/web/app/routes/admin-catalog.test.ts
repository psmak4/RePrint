import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const loadSession = vi.fn()
vi.mock('../lib/auth.server.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/auth.server.js')>()),
  loadSession: (r: Request) => loadSession(r),
}))

import { loader as statsLoader } from './admin-catalog.js'
import { action as genresAction, loader as genresLoader } from './admin-catalog-genres.js'
import { action as mergeAction, loader as mergeLoader } from './admin-catalog-merge.js'

const id = (n: number) => `0192a3b4-0000-7000-8000-00000000000${n}`
const viewerWith = (permissions: string[]) => ({
  signupsOpen: false,
  viewer: { id: 'x', username: 'm', displayName: 'M', verified: true, permissions },
})

beforeEach(() => {
  loadSession.mockReset()
  loadSession.mockResolvedValue(viewerWith(['catalog.manage']))
})
afterEach(() => vi.unstubAllGlobals())

const thrown = (run: () => unknown) =>
  Promise.resolve()
    .then(run)
    .catch((e: unknown) => e)
const getArgs = (path = '/admin/catalog') =>
  ({ request: new Request(`https://reprint.test${path}`), params: {} }) as never
const postArgs = (body: unknown) =>
  ({
    request: new Request('https://reprint.test/admin/catalog', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
    params: {},
  }) as never

function stubApi(responses: Record<string, { status?: number; body?: unknown }>) {
  const calls: { path: string; search: string; method: string; body: unknown }[] = []
  vi.stubGlobal('fetch', async (url: URL, init?: RequestInit) => {
    const u = new URL(String(url))
    const method = init?.method ?? 'GET'
    calls.push({
      path: u.pathname,
      search: u.search,
      method,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
    })
    const hit = responses[`${method} ${u.pathname}`] ?? { status: 404, body: {} }
    return Response.json(hit.body ?? {}, { status: hit.status ?? 200 })
  })
  return calls
}

const denied = async (run: () => unknown) => {
  loadSession.mockResolvedValue(viewerWith(['reviews.moderate']))
  const error = (await thrown(run)) as { init?: { status: number } }
  expect(error.init?.status).toBe(403)
  loadSession.mockResolvedValue({ signupsOpen: false, viewer: null })
  const visitor = (await thrown(run)) as Response
  expect(visitor.status).toBe(302)
}

const stats = {
  totals: { books: 1, editions: 2, authors: 3 },
  monthly: [{ month: '2026-10', books: 1, editions: 2, authors: 3 }],
}
const book = (n: number) => ({
  id: id(n),
  slug: `b-${n}`,
  title: `B${n}`,
  authors: [],
  editionCount: 1,
  reviewCount: 0,
  shelfEntryCount: 0,
  cover: null,
})

describe('admin catalog dashboard loader', () => {
  it('loads the stats', async () => {
    stubApi({ 'GET /v1/admin/catalog/stats': { body: stats } })
    expect((await statsLoader(getArgs())).stats.totals.books).toBe(1)
  })
  it('is denied without catalog.manage', async () => {
    stubApi({})
    await denied(() => statsLoader(getArgs()))
  })
  it('answers 502 when the API fails', async () => {
    stubApi({ 'GET /v1/admin/catalog/stats': { status: 500 } })
    const error = (await thrown(() => statsLoader(getArgs()))) as { init?: { status: number } }
    expect(error.init?.status).toBe(502)
  })
})

describe('admin merge queue', () => {
  it('loads candidates and forwards the cursor', async () => {
    const calls = stubApi({
      'GET /v1/admin/books/merge-candidates': {
        body: {
          items: [
            {
              id: id(9),
              reason: 'r',
              createdAt: '2026-10-01T00:00:00.000Z',
              bookA: book(1),
              bookB: book(2),
            },
          ],
          meta: { nextCursor: null },
        },
      },
    })
    const result = await mergeLoader(getArgs('/admin/catalog/merge?cursor=abc'))
    expect(result.queue.items).toHaveLength(1)
    expect(calls[0]?.search).toContain('cursor=abc')
  })

  it('is denied without catalog.manage', async () => {
    stubApi({})
    await denied(() => mergeLoader(getArgs()))
    await denied(() => mergeAction(postArgs({ intent: 'dismiss', candidateId: id(9) })))
  })

  it('merges and reports what moved', async () => {
    const calls = stubApi({
      'POST /v1/admin/books/merge': {
        body: {
          book: {
            id: id(1),
            slug: 'b-1',
            title: 'B1',
            description: null,
            genres: [],
            series: [],
            contributions: [],
            cover: null,
            primaryEditionId: null,
            lockedFields: [],
            fieldOrigins: {},
          },
          moved: { reviews: 2, shelfEntries: 1, editions: 3 },
        },
      },
    })
    const result = await mergeAction(
      postArgs({
        intent: 'merge',
        candidateId: id(9),
        merge: { fromBookId: id(2), intoBookId: id(1) },
      }),
    )
    expect(result).toMatchObject({ done: 'merged', moved: { reviews: 2 } })
    expect(calls[0]?.body).toEqual({ fromBookId: id(2), intoBookId: id(1) })
  })

  it('passes a 409 refusal back as a form error', async () => {
    stubApi({
      'POST /v1/admin/books/merge': {
        status: 409,
        body: {
          type: 'about:blank',
          title: 'Conflict',
          status: 409,
          detail: 'A Member reviewed both.',
        },
      },
    })
    const result = (await mergeAction(
      postArgs({
        intent: 'merge',
        candidateId: id(9),
        merge: { fromBookId: id(2), intoBookId: id(1) },
      }),
    )) as { init?: { status: number }; data?: { formError?: string } }
    expect(result.init?.status).toBe(409)
    expect(result.data?.formError).toBe('A Member reviewed both.')
  })

  it('refuses merging a Book into itself before calling the API', async () => {
    const calls = stubApi({})
    const result = (await mergeAction(
      postArgs({
        intent: 'merge',
        candidateId: id(9),
        merge: { fromBookId: id(1), intoBookId: id(1) },
      }),
    )) as { init?: { status: number } }
    expect(result.init?.status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it('dismisses a candidate', async () => {
    const calls = stubApi({
      [`POST /v1/admin/books/merge-candidates/${id(9)}/dismiss`]: { body: { status: 'dismissed' } },
    })
    expect(await mergeAction(postArgs({ intent: 'dismiss', candidateId: id(9) }))).toEqual({
      done: 'dismissed',
      candidateId: id(9),
    })
    expect(calls).toHaveLength(1)
  })
})

const genre = {
  id: id(1),
  slug: 'sf',
  name: 'SF',
  description: null,
  parentId: null,
  featured: false,
  archived: false,
  bookCount: 0,
  ruleCount: 0,
}

describe('admin genres and rules', () => {
  it('loads Genres (archived too) and rules', async () => {
    stubApi({
      'GET /v1/admin/genres': { body: { items: [genre, { ...genre, id: id(2), archived: true }] } },
      'GET /v1/admin/subject-rules': { body: { items: [] } },
    })
    const result = await genresLoader(getArgs('/admin/catalog/genres'))
    expect(result.genres).toHaveLength(2)
  })

  it('is denied without catalog.manage', async () => {
    stubApi({})
    await denied(() => genresLoader(getArgs()))
    await denied(() => genresAction(postArgs({ intent: 'removeRule', ruleId: id(8) })))
  })

  it('creates a Genre', async () => {
    const calls = stubApi({ 'POST /v1/admin/genres': { status: 201, body: genre } })
    const result = await genresAction(
      postArgs({ intent: 'createGenre', genre: { slug: 'sf', name: 'SF' } }),
    )
    expect(result).toEqual({ done: 'created' })
    expect(calls[0]?.body).toMatchObject({
      slug: 'sf',
      name: 'SF',
      description: null,
      parentId: null,
    })
  })

  it('reports archive and restore distinctly', async () => {
    stubApi({ [`PATCH /v1/admin/genres/${id(1)}`]: { body: genre } })
    expect(
      await genresAction(
        postArgs({ intent: 'editGenre', genreId: id(1), changes: { archived: true } }),
      ),
    ).toMatchObject({ done: 'archived' })
    expect(
      await genresAction(
        postArgs({ intent: 'editGenre', genreId: id(1), changes: { archived: false } }),
      ),
    ).toMatchObject({ done: 'restored' })
    expect(
      await genresAction(postArgs({ intent: 'editGenre', genreId: id(1), changes: { name: 'X' } })),
    ).toMatchObject({ done: 'saved' })
  })

  it('rejects an empty edit before calling the API', async () => {
    const calls = stubApi({})
    const result = (await genresAction(
      postArgs({ intent: 'editGenre', genreId: id(1), changes: {} }),
    )) as { init?: { status: number } }
    expect(result.init?.status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it('adds and removes a rule', async () => {
    const calls = stubApi({
      'POST /v1/admin/subject-rules': {
        status: 201,
        body: {
          id: id(8),
          pattern: 'p',
          priority: 50,
          genre: { id: id(1), slug: 'sf', name: 'SF' },
        },
      },
      [`DELETE /v1/admin/subject-rules/${id(8)}`]: { body: { removed: true } },
    })
    expect(
      await genresAction(postArgs({ intent: 'addRule', rule: { pattern: 'p', genreId: id(1) } })),
    ).toEqual({ done: 'ruleAdded' })
    expect(calls[0]?.body).toMatchObject({ priority: 50 })
    expect(await genresAction(postArgs({ intent: 'removeRule', ruleId: id(8) }))).toEqual({
      done: 'ruleRemoved',
    })
  })
})
