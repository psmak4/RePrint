export type BreakerState = 'closed' | 'open' | 'half_open'

export interface CircuitBreakerOptions {
  /** Consecutive failures that open the breaker. */
  failureThreshold: number
  /** How long the breaker stays open before letting one trial call through. */
  cooldownMs: number
  now?: () => number
}

/**
 * Stops calls to a failing Source (PRD §6). After `failureThreshold` failures in a row it opens and
 * rejects calls; after `cooldownMs` it half-opens and lets one trial call through. A success closes it,
 * a failure opens it again. State is per process: each process finds out for itself that the Source is down.
 */
export function createCircuitBreaker(options: CircuitBreakerOptions) {
  const now = options.now ?? Date.now
  let state: BreakerState = 'closed'
  let failures = 0
  let openedAt = 0
  let trialInFlight = false

  return {
    get state(): BreakerState {
      return state === 'open' && now() - openedAt >= options.cooldownMs ? 'half_open' : state
    },

    /** True when a call may go ahead. In `half_open` only one caller at a time gets true. */
    tryAcquire(): boolean {
      if (this.state === 'closed') return true
      if (this.state === 'open') return false
      state = 'half_open'
      if (trialInFlight) return false
      trialInFlight = true
      return true
    },

    /** Gives back a trial call that never reached the Source, without counting it either way. */
    release(): void {
      trialInFlight = false
    },

    recordSuccess(): void {
      state = 'closed'
      failures = 0
      trialInFlight = false
    },

    recordFailure(): void {
      trialInFlight = false
      failures += 1
      if (state === 'half_open' || failures >= options.failureThreshold) {
        state = 'open'
        openedAt = now()
      }
    },
  }
}

export type CircuitBreaker = ReturnType<typeof createCircuitBreaker>
