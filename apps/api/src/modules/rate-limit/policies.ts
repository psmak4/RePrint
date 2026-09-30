/** Who a policy counts: the client IP, the signed-in user, or a hashed email or account identifier. */
export type RateLimitSubject = 'ip' | 'user' | 'email' | 'account'

export interface RateLimitPolicy {
  subject: RateLimitSubject
  /** Requests allowed per window; the request after that is refused. */
  limit: number
  windowSeconds: number
}

const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** The PRD §11 rate limits. Policy names are part of the Redis key, so renaming one resets its counters. */
export const RATE_LIMIT_POLICIES = {
  loginIp: { subject: 'ip', limit: 10, windowSeconds: 15 * MINUTE },
  loginAccount: { subject: 'account', limit: 5, windowSeconds: 15 * MINUTE },
  register: { subject: 'ip', limit: 5, windowSeconds: HOUR },
  passwordReset: { subject: 'email', limit: 3, windowSeconds: HOUR },
  resendVerification: { subject: 'email', limit: 3, windowSeconds: HOUR },
  passwordChange: { subject: 'user', limit: 5, windowSeconds: 15 * MINUTE },
  emailChange: { subject: 'user', limit: 5, windowSeconds: HOUR },
  reviewWrite: { subject: 'user', limit: 20, windowSeconds: DAY },
  report: { subject: 'user', limit: 20, windowSeconds: DAY },
  bookResolve: { subject: 'ip', limit: 30, windowSeconds: MINUTE },
  authenticatedWrite: { subject: 'user', limit: 120, windowSeconds: MINUTE },
  anonymousRead: { subject: 'ip', limit: 300, windowSeconds: MINUTE },
} as const satisfies Record<string, RateLimitPolicy>

export type RateLimitPolicyName = keyof typeof RATE_LIMIT_POLICIES
