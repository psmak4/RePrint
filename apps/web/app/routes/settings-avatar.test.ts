import { afterEach, describe, expect, it, vi } from 'vitest'
import { action } from './settings-avatar.js'

afterEach(() => vi.unstubAllGlobals())

function upload(fetchMock: typeof fetch, file: File | null = new File(['x'], 'me.png')) {
  vi.stubGlobal('fetch', fetchMock)
  const body = new FormData()
  if (file) body.set('file', file)
  const request = new Request('http://web.test/settings/avatar', { method: 'POST', body })
  return action({ request } as never)
}

const asData = (result: unknown) => result as { data: unknown; init: { status: number } }

describe('settings avatar action', () => {
  it('turns the API file error into a form message', async () => {
    const problem = {
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      detail: 'That file could not be read as an image.',
      errors: [{ path: 'body.file', message: 'That file could not be read as an image.' }],
    }
    const result = asData(await upload(async () => Response.json(problem, { status: 400 })))
    expect(result.data).toEqual({ formError: 'That file could not be read as an image.' })
    expect(result.init.status).toBe(400)
  })

  it('returns the new avatar URL on success', async () => {
    const result = await upload(async () => Response.json({ avatarUrl: 'http://img/a.webp' }))
    expect(result).toEqual({ avatarUrl: 'http://img/a.webp' })
  })

  it('asks for a file when none was sent', async () => {
    const fetchMock = vi.fn()
    const result = asData(await upload(fetchMock as never, null))
    expect(result.init.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
