import { describe, expect, it } from 'vitest'
import { createCircuitBreaker } from './circuit-breaker.js'

function setup() {
  let time = 0
  const breaker = createCircuitBreaker({ failureThreshold: 3, cooldownMs: 1000, now: () => time })
  return { breaker, advance: (ms: number) => (time += ms) }
}

describe('circuit breaker', () => {
  it('opens after repeated failures and short-circuits calls while open', () => {
    const { breaker } = setup()
    breaker.recordFailure()
    breaker.recordFailure()
    expect(breaker.state).toBe('closed')
    expect(breaker.tryAcquire()).toBe(true)
    breaker.recordFailure()
    expect(breaker.state).toBe('open')
    expect(breaker.tryAcquire()).toBe(false)
  })

  it('a success resets the failure count', () => {
    const { breaker } = setup()
    breaker.recordFailure()
    breaker.recordFailure()
    breaker.recordSuccess()
    breaker.recordFailure()
    breaker.recordFailure()
    expect(breaker.state).toBe('closed')
  })

  it('half-opens after the cooldown and lets one trial call through', () => {
    const { breaker, advance } = setup()
    for (let i = 0; i < 3; i += 1) breaker.recordFailure()
    advance(999)
    expect(breaker.tryAcquire()).toBe(false)
    advance(1)
    expect(breaker.state).toBe('half_open')
    expect(breaker.tryAcquire()).toBe(true)
    expect(breaker.tryAcquire()).toBe(false)
  })

  it('closes when the trial succeeds and reopens when it fails', () => {
    const { breaker, advance } = setup()
    for (let i = 0; i < 3; i += 1) breaker.recordFailure()
    advance(1000)
    breaker.tryAcquire()
    breaker.recordFailure()
    expect(breaker.state).toBe('open')
    advance(1000)
    expect(breaker.tryAcquire()).toBe(true)
    breaker.recordSuccess()
    expect(breaker.state).toBe('closed')
    expect(breaker.tryAcquire()).toBe(true)
  })

  it('a released trial lets the next caller try without changing state', () => {
    const { breaker, advance } = setup()
    for (let i = 0; i < 3; i += 1) breaker.recordFailure()
    advance(1000)
    breaker.tryAcquire()
    breaker.release()
    expect(breaker.state).toBe('half_open')
    expect(breaker.tryAcquire()).toBe(true)
  })
})
