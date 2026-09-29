import { describe, expect, it } from 'vitest'
import { runReadinessChecks } from './readiness.js'

describe('runReadinessChecks', () => {
  it('reports ok for resolving checks', async () => {
    const results = await runReadinessChecks([{ name: 'a', check: async () => 'PONG' }])
    expect(results).toEqual([{ name: 'a', ok: true }])
  })

  it('reports not ok for rejecting and synchronously throwing checks', async () => {
    const results = await runReadinessChecks([
      { name: 'rejects', check: () => Promise.reject(new Error('down')) },
      {
        name: 'throws',
        check: () => {
          throw new Error('down')
        },
      },
    ])
    expect(results).toEqual([
      { name: 'rejects', ok: false },
      { name: 'throws', ok: false },
    ])
  })

  it('reports not ok when a check does not answer in time', async () => {
    const results = await runReadinessChecks(
      [{ name: 'slow', check: () => new Promise(() => {}) }],
      20,
    )
    expect(results).toEqual([{ name: 'slow', ok: false }])
  })
})
