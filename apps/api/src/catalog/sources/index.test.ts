import { describe, expect, it } from 'vitest'
import { createSourceAdapter } from './index.js'
import { createStubSource } from './stub/stub-adapter.js'

describe('createSourceAdapter', () => {
  it('returns the stub Source for SOURCE_MODE=stub', () => {
    expect(createSourceAdapter('stub').name).toBe('stub')
  })

  it('builds the adapter registered for fixtures and for live', () => {
    const fixtures = { ...createStubSource(), name: 'replay' }
    const live = { ...createStubSource(), name: 'network' }
    const wiring = { fixtures: () => fixtures, live: () => live }
    expect(createSourceAdapter('fixtures', wiring).name).toBe('replay')
    expect(createSourceAdapter('live', wiring).name).toBe('network')
  })

  it('fails loudly when a mode has no adapter', () => {
    expect(() => createSourceAdapter('live')).toThrow(/SOURCE_MODE=live/)
  })
})
