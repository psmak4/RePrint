import { describe, expect, it } from 'vitest'
import { AUDIT_ACTIONS, auditActionSchema, auditTargetTypeSchema } from './audit.js'

describe('audit names', () => {
  it('accepts every listed action and rejects others', () => {
    for (const action of AUDIT_ACTIONS) expect(auditActionSchema.parse(action)).toBe(action)
    expect(auditActionSchema.safeParse('review.claim').success).toBe(false)
  })

  it('knows the target types', () => {
    expect(auditTargetTypeSchema.parse('review')).toBe('review')
    expect(auditTargetTypeSchema.safeParse('source').success).toBe(false)
  })
})
