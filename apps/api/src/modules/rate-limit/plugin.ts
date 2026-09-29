import type { FastifyInstance, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify'
import type { Redis } from 'ioredis'
import { HttpProblem } from '../../errors.js'
import { createRateLimiter, hashSubject } from './limiter.js'
import { RATE_LIMIT_POLICIES, type RateLimitPolicyName } from './policies.js'

export interface RateLimitService {
  /** Counts one hit against `policy` for `subject` and throws a 429 Problem Details when over the limit. */
  consume: (policy: RateLimitPolicyName, subject: string) => Promise<void>
}

declare module 'fastify' {
  interface FastifyInstance {
    rateLimits: RateLimitService
  }
  interface FastifyContextConfig {
    /** Set `false` on a route (health checks) to skip the global read and write limits. */
    rateLimit?: false
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Redis-backed rate limits (PRD §11). Registers `app.rateLimits`, plus two global limits:
 * anonymous reads per IP and authenticated writes per user. Named policies for login,
 * register, reset, review, and report are applied per route with `rateLimit()`.
 * The limiter fails open: if Redis is down, requests go through (`/v1/ready` reports it).
 */
export function registerRateLimits(app: FastifyInstance, redis: Redis | undefined): void {
  if (!redis) return
  const limiter = createRateLimiter(redis)

  const consume: RateLimitService['consume'] = async (name, subject) => {
    const policy = RATE_LIMIT_POLICIES[name]
    let result: Awaited<ReturnType<typeof limiter.consume>>
    try {
      result = await limiter.consume(name, policy, subject)
    } catch (error) {
      app.log.warn({ err: error, policy: name }, 'rate limiter unavailable; allowing request')
      return
    }
    if (!result.allowed) {
      throw new HttpProblem(429, 'Too many requests. Try again later.', {
        headers: { 'retry-after': String(result.retryAfterSeconds) },
      })
    }
  }
  app.decorate('rateLimits', { consume } satisfies RateLimitService)

  // Runs after the session hook, so `request.auth` is known.
  app.addHook('onRequest', async (request) => {
    if (request.routeOptions.config.rateLimit === false) return
    if (request.auth) {
      if (!SAFE_METHODS.has(request.method)) {
        await consume('authenticatedWrite', request.auth.user.id)
      }
    } else if (request.method === 'GET' || request.method === 'HEAD') {
      await consume('anonymousRead', request.ip)
    }
  })
}

/** How a route names who to count. Return `undefined` to skip the check (for example, a missing email). */
export type SubjectOf = (request: FastifyRequest) => string | undefined

/**
 * preHandler that applies a named policy. The subject defaults to what the policy counts:
 * the client IP or the signed-in user. Email and account policies need an explicit `subjectOf`
 * (they run after body validation, so `request.body` is available); values are hashed.
 */
export function rateLimit(
  policy: RateLimitPolicyName,
  subjectOf?: SubjectOf,
): preHandlerAsyncHookHandler {
  const kind = RATE_LIMIT_POLICIES[policy].subject
  return async function rateLimitHandler(request) {
    let subject: string | undefined
    if (subjectOf) subject = subjectOf(request)
    else if (kind === 'ip') subject = request.ip
    else if (kind === 'user') subject = request.auth?.user.id
    if (subject === undefined) return
    await this.rateLimits.consume(
      policy,
      kind === 'email' || kind === 'account' ? hashSubject(subject) : subject,
    )
  }
}
