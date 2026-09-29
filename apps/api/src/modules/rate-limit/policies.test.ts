import { describe, expect, it } from 'vitest'
import { hashSubject } from './limiter.js'
import { RATE_LIMIT_POLICIES } from './policies.js'

const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe('RATE_LIMIT_POLICIES', () => {
  it('matches the PRD §11 table (plus passwordChange, D-084)', () => {
    expect(RATE_LIMIT_POLICIES).toEqual({
      loginIp: { subject: 'ip', limit: 10, windowSeconds: 15 * MINUTE },
      loginAccount: { subject: 'account', limit: 5, windowSeconds: 15 * MINUTE },
      register: { subject: 'ip', limit: 5, windowSeconds: HOUR },
      passwordReset: { subject: 'email', limit: 3, windowSeconds: HOUR },
      resendVerification: { subject: 'email', limit: 3, windowSeconds: HOUR },
      passwordChange: { subject: 'user', limit: 5, windowSeconds: 15 * MINUTE },
      reviewWrite: { subject: 'user', limit: 20, windowSeconds: DAY },
      report: { subject: 'user', limit: 20, windowSeconds: DAY },
      authenticatedWrite: { subject: 'user', limit: 120, windowSeconds: MINUTE },
      anonymousRead: { subject: 'ip', limit: 300, windowSeconds: MINUTE },
    })
  })
})

describe('hashSubject', () => {
  it('ignores case and surrounding spaces, and hides the value', () => {
    expect(hashSubject(' Ada@Example.com ')).toBe(hashSubject('ada@example.com'))
    expect(hashSubject('ada@example.com')).not.toContain('ada')
    expect(hashSubject('ada@example.com')).not.toBe(hashSubject('bob@example.com'))
  })
})
