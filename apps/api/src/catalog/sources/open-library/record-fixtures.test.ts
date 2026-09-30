import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FIXTURE_REQUESTS, recordFixtures } from './record-fixtures.js'

let dir: string | undefined
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
  dir = undefined
})

describe('recordFixtures', () => {
  it('saves each raw response as pretty JSON and identifies the app', async () => {
    dir = await mkdtemp(join(tmpdir(), 'fixtures-'))
    const fetchMock = vi.fn(async () => Response.json({ numFound: 1, docs: [] }))
    const written = await recordFixtures({
      fetch: fetchMock,
      dir,
      delayMs: 0,
      userAgent: 'RePrint/1.0.0 (ops@reprint.com)',
    })
    expect(written).toHaveLength(FIXTURE_REQUESTS.length)
    expect((await readdir(dir)).sort()).toEqual(
      FIXTURE_REQUESTS.map((request) => `${request.name}.json`).sort(),
    )
    expect(JSON.parse(await readFile(written[0] as string, 'utf8'))).toEqual({
      numFound: 1,
      docs: [],
    })
    const init = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(init[1].headers).toMatchObject({ 'User-Agent': 'RePrint/1.0.0 (ops@reprint.com)' })
  })

  it('stops with the request name when the Source answers with an error', async () => {
    dir = await mkdtemp(join(tmpdir(), 'fixtures-'))
    await expect(
      recordFixtures({
        fetch: async () => new Response('nope', { status: 503 }),
        dir,
        delayMs: 0,
        userAgent: 'RePrint/1.0.0 (ops@reprint.com)',
      }),
    ).rejects.toThrow(/search-title.*503/)
  })
})
