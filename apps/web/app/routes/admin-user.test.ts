import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const loadSession = vi.fn()
vi.mock('../lib/auth.server.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/auth.server.js')>()),
  loadSession: (r: Request) => loadSession(r),
}))

import { action, loader } from './admin-user.js'

const uid = '0192a3b4-0000-7000-8000-000000000001'
const viewerWith = (permissions: string[]) => ({
  signupsOpen: false,
  viewer: { id: 'x', username: 'm', displayName: 'M', verified: true, permissions },
})
const ADMIN = ['users.view', 'audit.view', 'roles.assign', 'users.suspend']

beforeEach(() => {
  loadSession.mockReset()
  loadSession.mockResolvedValue(viewerWith(ADMIN))
})
afterEach(() => vi.unstubAllGlobals())

const thrown = (run: () => unknown) =>
  Promise.resolve()
    .then(run)
    .catch((e: unknown) => e)
const loaderArgs = () =>
  ({
    request: new Request(`https://reprint.test/admin/users/${uid}`),
    params: { id: uid },
  }) as never
const actionArgs = (body: unknown) =>
  ({
    request: new Request(`https://reprint.test/admin/users/${uid}`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    params: { id: uid },
  }) as never

function stubApi(status = 200, body: unknown = {}) {
  const calls: { path: string; method: string; body: unknown }[] = []
  vi.stubGlobal('fetch', async (url: URL, init?: RequestInit) => {
    const u = new URL(String(url))
    calls.push({
      path: u.pathname,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
    })
    return Response.json(body, { status })
  })
  return calls
}

const detail = {
  user: {
    id: uid,
    username: 'ada',
    displayName: 'Ada',
    email: null,
    status: 'active',
    roles: ['member'],
    joinedAt: '2026-01-01T00:00:00.000Z',
    reviewCount: 0,
    reportsReceived: 0,
    bio: null,
    emailVerifiedAt: null,
    suspendedUntil: null,
    suspendedReason: null,
    deletedAt: null,
  },
  reviews: { pending: 0, approved: 0, rejected: 0, unpublished: 0 },
  reports: { filed: 0, received: 0 },
  admin: null,
}

describe('admin user loader', () => {
  it('loads the detail and what the viewer may do', async () => {
    const calls = stubApi(200, detail)
    const result = (await loader(loaderArgs())) as Record<string, unknown>
    expect(calls[0]?.path).toBe(`/v1/admin/users/${uid}`)
    expect(result.canAssign).toBe(true)
    expect(result.canSuspend).toBe(true)
  })

  it('hides role and suspend actions from a Moderator', async () => {
    loadSession.mockResolvedValue(viewerWith(['users.view']))
    stubApi(200, detail)
    const result = (await loader(loaderArgs())) as Record<string, unknown>
    expect(result.canAssign).toBe(false)
    expect(result.canSuspend).toBe(false)
  })

  it('turns an unknown user into a 404', async () => {
    stubApi(404, { type: 'about:blank', title: 'Not found', status: 404, detail: 'No' })
    const error = (await thrown(() => loader(loaderArgs()))) as { init?: { status?: number } }
    expect(error.init?.status).toBe(404)
  })

  it('refuses a Member without calling the API', async () => {
    loadSession.mockResolvedValue(viewerWith(['reviews.write']))
    const calls = stubApi()
    const error = (await thrown(() => loader(loaderArgs()))) as { init?: { status?: number } }
    expect(error.init?.status).toBe(403)
    expect(calls).toEqual([])
  })
})

describe('admin user action', () => {
  it('grants and removes a role', async () => {
    const calls = stubApi(200, { userId: uid, roles: ['member', 'moderator'], changed: true })
    const granted = await action(actionArgs({ intent: 'grant', role: 'moderator' }))
    expect(calls[0]).toMatchObject({
      path: `/v1/admin/users/${uid}/roles/moderator`,
      method: 'PUT',
    })
    expect(granted).toEqual({ done: 'grant', changed: true })
    await action(actionArgs({ intent: 'revoke', role: 'moderator' }))
    expect(calls[1]).toMatchObject({ method: 'DELETE' })
  })

  it('refuses a role change without roles.assign, without calling the API', async () => {
    loadSession.mockResolvedValue(viewerWith(['users.view', 'users.suspend']))
    const calls = stubApi()
    const error = (await thrown(() => action(actionArgs({ intent: 'grant', role: 'admin' })))) as {
      init?: { status?: number }
    }
    expect(error.init?.status).toBe(403)
    expect(calls).toEqual([])
  })

  it('suspends with a reason and the end of the chosen day', async () => {
    const calls = stubApi(200, { userId: uid, status: 'suspended', suspendedUntil: null })
    const result = await action(
      actionArgs({ intent: 'suspend', reason: 'Spam', until: '2026-11-01' }),
    )
    expect(calls[0]).toMatchObject({
      path: `/v1/admin/users/${uid}/suspend`,
      body: { reason: 'Spam', until: '2026-11-01T23:59:59.000Z' },
    })
    expect(result).toEqual({ done: 'suspended' })
  })

  it('requires a suspension reason', async () => {
    const calls = stubApi()
    const result = (await action(actionArgs({ intent: 'suspend', reason: ' ' }))) as {
      init?: { status?: number }
    }
    expect(result.init?.status).toBe(400)
    expect(calls).toEqual([])
  })

  it('refuses a Moderator who tries to suspend, unsuspend, or end sessions', async () => {
    loadSession.mockResolvedValue(viewerWith(['users.view']))
    const calls = stubApi()
    for (const intent of ['suspend', 'unsuspend', 'revoke-sessions']) {
      const error = (await thrown(() => action(actionArgs({ intent, reason: 'x' })))) as {
        init?: { status?: number }
      }
      expect(error.init?.status).toBe(403)
    }
    expect(calls).toEqual([])
  })

  it('lets a Moderator resend verification', async () => {
    loadSession.mockResolvedValue(viewerWith(['users.view']))
    const calls = stubApi(200, { userId: uid, sent: true })
    const result = await action(actionArgs({ intent: 'resend-verification' }))
    expect(calls[0]).toMatchObject({ path: `/v1/admin/users/${uid}/resend-verification` })
    expect(result).toEqual({ done: 'resent', sent: true })
  })

  it('unsuspends and ends all sessions', async () => {
    const calls = stubApi(200, { userId: uid, status: 'active', suspendedUntil: null, revoked: 3 })
    expect(await action(actionArgs({ intent: 'unsuspend' }))).toEqual({ done: 'unsuspended' })
    expect(await action(actionArgs({ intent: 'revoke-sessions' }))).toEqual({
      done: 'sessions',
      revoked: 3,
    })
    expect(calls.map((c) => c.path)).toEqual([
      `/v1/admin/users/${uid}/unsuspend`,
      `/v1/admin/users/${uid}/revoke-sessions`,
    ])
  })

  it('passes an API refusal back to the form', async () => {
    stubApi(409, { type: 'about:blank', title: 'Conflict', status: 409, detail: 'Last Admin.' })
    const result = (await action(actionArgs({ intent: 'revoke', role: 'admin' }))) as {
      data?: { formError?: string }
      init?: { status?: number }
    }
    expect(result.init?.status).toBe(409)
    expect(result.data?.formError).toBe('Last Admin.')
  })
})
