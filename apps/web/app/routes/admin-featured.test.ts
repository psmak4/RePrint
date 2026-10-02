import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const loadSession = vi.fn()
vi.mock('../lib/auth.server.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/auth.server.js')>()),
  loadSession: (r: Request) => loadSession(r),
}))

import { action, loader } from './admin-featured.js'

const id = (n: number) => `0192a3b4-0000-7000-8000-00000000000${n}`
const viewerWith = (permissions: string[]) => ({
  signupsOpen: false,
  viewer: { id: 'x', username: 'm', displayName: 'M', verified: true, permissions },
})

beforeEach(() => {
  loadSession.mockReset()
  loadSession.mockResolvedValue(viewerWith(['featured.manage', 'featured.genres']))
})
afterEach(() => vi.unstubAllGlobals())

const thrown = (run: () => unknown) =>
  Promise.resolve()
    .then(run)
    .catch((e: unknown) => e)
const getArgs = () =>
  ({ request: new Request('https://reprint.test/admin/featured'), params: {} }) as never
const postArgs = (body: unknown) =>
  ({
    request: new Request('https://reprint.test/admin/featured', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
    params: {},
  }) as never

function stubApi(responses: Record<string, { status?: number; body?: unknown }>) {
  const calls: { path: string; method: string; body: unknown }[] = []
  vi.stubGlobal('fetch', async (url: URL, init?: RequestInit) => {
    const u = new URL(String(url))
    const method = init?.method ?? 'GET'
    calls.push({
      path: u.pathname,
      method,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
    })
    const hit = responses[`${method} ${u.pathname}`] ?? { status: 404, body: {} }
    return Response.json(hit.body ?? {}, { status: hit.status ?? 200 })
  })
  return calls
}

const empty = { genres: [], genreOptions: [], review: null, candidates: [] }

describe('admin featured content', () => {
  it('loads the picks and tells the page whether Genres can be edited', async () => {
    stubApi({ 'GET /v1/admin/featured': { body: empty } })
    expect(await loader(getArgs())).toEqual({ featured: empty, canEditGenres: true })
    loadSession.mockResolvedValue(viewerWith(['featured.manage']))
    expect(await loader(getArgs())).toMatchObject({ canEditGenres: false })
  })

  it('is denied without featured.manage, and Visitors go to log in', async () => {
    loadSession.mockResolvedValue(viewerWith(['reviews.moderate']))
    const denied = (await thrown(() => loader(getArgs()))) as { init?: { status: number } }
    expect(denied.init?.status).toBe(403)
    loadSession.mockResolvedValue({ signupsOpen: false, viewer: null })
    expect(((await thrown(() => loader(getArgs()))) as Response).status).toBe(302)
  })

  it('answers 502 when the API fails', async () => {
    stubApi({ 'GET /v1/admin/featured': { status: 500 } })
    const error = (await thrown(() => loader(getArgs()))) as { init?: { status: number } }
    expect(error.init?.status).toBe(502)
  })

  it('saves Genres and the review with one PUT each', async () => {
    const calls = stubApi({ 'PUT /v1/admin/featured': { body: empty } })
    expect(await action(postArgs({ genreIds: [id(1)] }))).toEqual({ done: 'genresSaved' })
    expect(await action(postArgs({ reviewId: id(2) }))).toEqual({ done: 'reviewSaved' })
    expect(await action(postArgs({ reviewId: null }))).toEqual({ done: 'reviewCleared' })
    expect(calls.map((call) => call.body)).toEqual([
      { genreIds: [id(1)] },
      { reviewId: id(2) },
      { reviewId: null },
    ])
  })

  it('rejects an empty change before calling the API and passes API refusals back', async () => {
    const calls = stubApi({
      'PUT /v1/admin/featured': {
        status: 400,
        body: {
          type: 'about:blank',
          title: 'Bad Request',
          status: 400,
          detail: 'Only an Approved review can be featured.',
        },
      },
    })
    const bad = (await action(postArgs({}))) as { init?: { status: number } }
    expect(bad.init?.status).toBe(400)
    expect(calls).toHaveLength(0)
    const refused = (await action(postArgs({ reviewId: id(2) }))) as {
      init?: { status: number }
      data?: { formError?: string }
    }
    expect(refused.init?.status).toBe(400)
    expect(refused.data?.formError).toBe('Only an Approved review can be featured.')
  })

  it('refuses an action without featured.manage', async () => {
    loadSession.mockResolvedValue(viewerWith(['reviews.moderate']))
    const error = (await thrown(() => action(postArgs({ reviewId: null })))) as {
      init?: { status: number }
    }
    expect(error.init?.status).toBe(403)
  })
})
