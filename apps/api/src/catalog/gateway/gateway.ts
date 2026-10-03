import { AsyncLocalStorage } from 'node:async_hooks'
import type { Redis } from 'ioredis'
import { SourceError } from '../sources/types.js'
import { createCircuitBreaker } from './circuit-breaker.js'
import { createSourceMetrics } from './metrics.js'
import { createSourceRateLimiter, type RequestPriority } from './rate-limiter.js'

export interface SourceGatewayOptions {
  redis: Redis
  /** `SOURCE_RATE_LIMIT_RPS`. */
  rps: number
  /** `SOURCE_TIMEOUT_MS`: the default limit for waiting for a slot and for the response together. */
  timeoutMs: number
  version: string
  contactEmail: string
  /** Consecutive failures that open the circuit breaker. */
  failureThreshold?: number
  cooldownMs?: number
  /** The transport; tests replace it. */
  fetch?: typeof fetch
}

export interface CallContext {
  priority: RequestPriority
  timeoutMs?: number
}

/**
 * The single door for outgoing Source calls (PRD §6): a Redis-shared rate limit with interactive requests
 * ahead of background ones, a circuit breaker, the `User-Agent`, a timeout, and request counters.
 * Calls are interactive unless wrapped in `run({ priority: 'background' }, ...)`.
 */
export function createSourceGateway(options: SourceGatewayOptions) {
  const limiter = createSourceRateLimiter({ redis: options.redis, rps: options.rps })
  const metrics = createSourceMetrics(options.redis)
  const cooldownMs = options.cooldownMs ?? 30_000
  const breaker = createCircuitBreaker({
    failureThreshold: options.failureThreshold ?? 5,
    cooldownMs,
  })
  let publishedOpen = false
  /** Shares the breaker's state through Redis, because the monitor runs in another process. */
  const publishBreaker = () => {
    if (breaker.state === 'open') {
      publishedOpen = true
      void metrics.recordBreakerOpen(cooldownMs * 2).catch(() => {})
    } else if (publishedOpen && breaker.state === 'closed') {
      publishedOpen = false
      void metrics.recordBreakerClosed().catch(() => {})
    }
  }
  const context = new AsyncLocalStorage<CallContext>()
  const transport = options.fetch ?? fetch
  const userAgent = `RePrint/${options.version} (${options.contactEmail})`

  const gatewayFetch: typeof fetch = async (input, init) => {
    const { priority, timeoutMs } = context.getStore() ?? { priority: 'interactive' as const }
    const limit = timeoutMs ?? options.timeoutMs
    if (!breaker.tryAcquire()) throw new SourceError('The Source circuit breaker is open')
    const started = Date.now()
    try {
      await limiter.acquire(priority, limit)
    } catch (error) {
      breaker.release() // never reached the Source, so it says nothing about its health
      throw new SourceError('No Source request slot became available in time', error)
    }
    await metrics.recordRequest().catch(() => {}) // counters must not break a request
    const headers = new Headers(init?.headers)
    headers.set('User-Agent', userAgent)
    try {
      const response = await transport(input, {
        ...init,
        headers,
        signal: AbortSignal.timeout(Math.max(1, limit - (Date.now() - started))),
      })
      // A 5xx or 429 means the Source is struggling; a 404 or other 4xx is a normal answer.
      if (response.status >= 500 || response.status === 429) breaker.recordFailure()
      else breaker.recordSuccess()
      publishBreaker()
      return response
    } catch (error) {
      breaker.recordFailure()
      publishBreaker()
      throw error
    }
  }

  return {
    /** The `fetch` to hand to a Source adapter. */
    fetch: gatewayFetch,
    /** Runs `fn`; every Source call inside it uses this priority and timeout. */
    run<T>(callContext: CallContext, fn: () => Promise<T>): Promise<T> {
      return context.run(callContext, fn)
    },
    breaker,
    metrics,
  }
}

export type SourceGateway = ReturnType<typeof createSourceGateway>
