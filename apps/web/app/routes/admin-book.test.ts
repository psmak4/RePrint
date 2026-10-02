import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const loadSession = vi.fn()
vi.mock('../lib/auth.server.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/auth.server.js')>()),
  loadSession: (r: Request) => loadSession(r),
}))

import { action, loader } from './admin-book.js'

const id = '0192a3b4-0000-7000-8000-000000000001'
const genreId = '0192a3b4-0000-7000-8000-000000000002'
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
const loaderArgs = () =>
  ({ request: new Request(`https://reprint.test/admin/books/${id}`), params: { id } }) as never
const actionArgs = (body: BodyInit, headers: HeadersInit = {}) =>
  ({
    request: new Request(`https://reprint.test/admin/books/${id}`, {
      method: 'POST',
      body,
      headers,
    }),
    params: { id },
  }) as never
const jsonArgs = (body: unknown) =>
  actionArgs(JSON.stringify(body), { 'content-type': 'application/json' })

const book = {
  id,
  slug: 'dune-0192',
  title: 'Dune',
  description: null,
  genres: [],
  series: [],
  contributions: [{ authorId: id, name: 'Frank Herbert', role: 'author', position: 0 }],
  cover: null,
  primaryEditionId: null,
  lockedFields: [],
  fieldOrigins: {},
  editions: [],
}
const genre = {
  id: genreId,
  slug: 'sf',
  name: 'Science fiction',
  description: null,
  parentId: null,
  featured: false,
  archived: false,
  bookCount: 0,
  ruleCount: 0,
}

function stubApi(responses: Record<string, { status?: number; body?: unknown }>) {
  const calls: { path: string; method: string; body: unknown }[] = []
  vi.stubGlobal('fetch', async (url: URL, init?: RequestInit) => {
    const u = new URL(String(url))
    const method = init?.method ?? 'GET'
    calls.push({
      path: u.pathname,
      method,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : (init?.body ?? null),
    })
    const hit = responses[`${method} ${u.pathname}`] ?? { status: 404, body: {} }
    return Response.json(hit.body ?? {}, { status: hit.status ?? 200 })
  })
  return calls
}

describe('admin book loader', () => {
  it('loads the Book and the live Genres for a holder of catalog.manage', async () => {
    stubApi({
      [`GET /v1/admin/books/${id}`]: { body: book },
      'GET /v1/admin/genres': {
        body: { items: [genre, { ...genre, id, slug: 'old', archived: true }] },
      },
    })
    const result = await loader(loaderArgs())
    expect(result.book.title).toBe('Dune')
    expect(result.genres.map((g) => g.slug)).toEqual(['sf'])
  })

  it('answers 403 without catalog.manage and sends visitors to log in', async () => {
    loadSession.mockResolvedValue(viewerWith(['reviews.moderate']))
    const denied = (await thrown(() => loader(loaderArgs()))) as { init?: { status: number } }
    expect(denied.init?.status).toBe(403)
    loadSession.mockResolvedValue({ signupsOpen: false, viewer: null })
    const visitor = (await thrown(() => loader(loaderArgs()))) as Response
    expect(visitor.status).toBe(302)
  })

  it('answers 404 for an unknown Book', async () => {
    stubApi({ 'GET /v1/admin/genres': { body: { items: [] } } })
    const missing = (await thrown(() => loader(loaderArgs()))) as { init?: { status: number } }
    expect(missing.init?.status).toBe(404)
  })
})

describe('admin book action', () => {
  it('patches only the changes it is given', async () => {
    const calls = stubApi({ [`PATCH /v1/admin/books/${id}`]: { body: book } })
    const result = await action(jsonArgs({ intent: 'edit', changes: { title: 'Dune 2' } }))
    expect(result).toMatchObject({ done: 'edit' })
    expect(calls[0]).toMatchObject({ method: 'PATCH', body: { title: 'Dune 2' } })
  })

  it('rejects an empty edit before calling the API', async () => {
    const calls = stubApi({})
    const result = (await action(jsonArgs({ intent: 'edit', changes: {} }))) as {
      init?: { status: number }
    }
    expect(result.init?.status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it('queues a refresh', async () => {
    const calls = stubApi({
      [`POST /v1/admin/books/${id}/refresh`]: { status: 202, body: { status: 'refresh_queued' } },
    })
    expect(await action(jsonArgs({ intent: 'refresh' }))).toEqual({ done: 'refresh' })
    expect(calls[0]?.method).toBe('POST')
  })

  it('forwards a Cover upload as multipart', async () => {
    const calls = stubApi({ [`POST /v1/admin/books/${id}/cover`]: { body: book } })
    const form = new FormData()
    form.set('file', new File(['x'], 'c.png', { type: 'image/png' }))
    const result = await action(actionArgs(form))
    expect(result).toMatchObject({ done: 'cover' })
    expect(calls[0]?.body).toBeInstanceOf(FormData)
  })

  it('asks for an image when none is sent, and denies without the permission', async () => {
    stubApi({})
    const form = new FormData()
    const result = (await action(actionArgs(form))) as { init?: { status: number } }
    expect(result.init?.status).toBe(400)
    loadSession.mockResolvedValue(viewerWith(['users.view']))
    const denied = (await thrown(() => action(jsonArgs({ intent: 'refresh' })))) as {
      init?: { status: number }
    }
    expect(denied.init?.status).toBe(403)
  })
})
