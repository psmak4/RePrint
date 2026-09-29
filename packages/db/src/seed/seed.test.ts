import { describe, expect, it } from 'vitest'
import { assertSeedAllowed, isLocalHost } from './guard.js'
import { createPrng, createSeedRandom } from './prng.js'
import { runSeed } from './run.js'

describe('seeded random', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = createPrng(7)
    const b = createPrng(7)
    expect(Array.from({ length: 5 }, a)).toEqual(Array.from({ length: 5 }, b))
    expect(createPrng(8)()).not.toEqual(createPrng(7)())
  })

  it('makes identical, unique UUIDv7 IDs for the same seed', () => {
    const ids = (seed: number) => {
      const random = createSeedRandom(seed)
      return Array.from({ length: 50 }, random.id)
    }
    const first = ids(1)
    expect(first).toEqual(ids(1))
    expect(new Set(first).size).toBe(50)
    expect(first[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  it('keeps int and pick in range', () => {
    const random = createSeedRandom(3)
    for (let i = 0; i < 200; i++) {
      const n = random.int(2, 4)
      expect(n).toBeGreaterThanOrEqual(2)
      expect(n).toBeLessThanOrEqual(4)
      expect(['a', 'b']).toContain(random.pick(['a', 'b']))
    }
  })
})

describe('seed guard', () => {
  it('allows local hosts', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]', 'api.reprint.localhost']) {
      expect(isLocalHost(host)).toBe(true)
    }
    expect(() =>
      assertSeedAllowed('postgres://u:p@localhost:5432/reprint', 'development'),
    ).not.toThrow()
    expect(() =>
      assertSeedAllowed('postgres://u:p@localhost:5432/reprint', undefined),
    ).not.toThrow()
  })

  it('refuses production', () => {
    expect(() => assertSeedAllowed('postgres://u:p@localhost:5432/reprint', 'production')).toThrow(
      /production/,
    )
  })

  it('refuses non-local and malformed database URLs', () => {
    expect(() => assertSeedAllowed('postgres://u:p@db.neon.tech/reprint', 'development')).toThrow(
      /not local/,
    )
    expect(() =>
      assertSeedAllowed('postgres://u:p@localhost.evil.com/reprint', 'development'),
    ).toThrow(/not local/)
    expect(() => assertSeedAllowed('not a url', 'development')).toThrow(/valid URL/)
  })

  it('runSeed checks the guard before connecting', async () => {
    await expect(runSeed('postgres://u:p@db.neon.tech/reprint')).rejects.toThrow(/not local/)
    await expect(
      runSeed('postgres://u:p@localhost/reprint', { nodeEnv: 'production' }),
    ).rejects.toThrow(/production/)
  })
})
