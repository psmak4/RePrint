import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { isBreachedPassword } from './breached-password.js'

const password = 'password1234'
const digest = createHash('sha1').update(password).digest('hex').toUpperCase()
const log = { warn: vi.fn() }

function fakeFetch(body: string, status = 200) {
  return vi.fn(async () => new Response(body, { status }))
}

describe('isBreachedPassword', () => {
  it('sends only the first 5 SHA-1 hex characters', async () => {
    const fetchImpl = fakeFetch('')
    await isBreachedPassword(password, { mode: 'live', log, fetchImpl })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url] = fetchImpl.mock.calls[0] as unknown as [string]
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${digest.slice(0, 5)}`)
    expect(url).not.toContain(digest.slice(5))
  })

  it('is breached when the suffix is listed with a count', async () => {
    const body = `0000000000000000000000000000000000A:2\r\n${digest.slice(5)}:9001\r\n`
    expect(
      await isBreachedPassword(password, { mode: 'live', log, fetchImpl: fakeFetch(body) }),
    ).toBe(true)
  })

  it('ignores padding entries with a count of 0', async () => {
    const body = `${digest.slice(5)}:0\r\n`
    expect(
      await isBreachedPassword(password, { mode: 'live', log, fetchImpl: fakeFetch(body) }),
    ).toBe(false)
  })

  it('is not breached when the suffix is absent', async () => {
    const body = '0000000000000000000000000000000000A:2\r\n'
    expect(
      await isBreachedPassword(password, { mode: 'live', log, fetchImpl: fakeFetch(body) }),
    ).toBe(false)
  })

  it('fails open and logs when the API errors or is unreachable', async () => {
    const warn = vi.fn()
    expect(
      await isBreachedPassword(password, {
        mode: 'live',
        log: { warn },
        fetchImpl: fakeFetch('', 503),
      }),
    ).toBe(false)
    const failing = vi.fn(async () => {
      throw new Error('network down')
    })
    expect(
      await isBreachedPassword(password, { mode: 'live', log: { warn }, fetchImpl: failing }),
    ).toBe(false)
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('makes no request when HIBP_MODE is off', async () => {
    const fetchImpl = fakeFetch('')
    expect(await isBreachedPassword(password, { mode: 'off', log, fetchImpl })).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
