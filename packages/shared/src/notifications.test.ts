import { describe, expect, it } from 'vitest'
import {
  MAX_NOTIFICATION_READ_IDS,
  markNotificationsReadRequestSchema,
  notificationSchema,
} from './notifications.js'

const id = '0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a6b'

describe('markNotificationsReadRequestSchema', () => {
  it('accepts all, or a list of IDs', () => {
    expect(markNotificationsReadRequestSchema.safeParse({ all: true }).success).toBe(true)
    expect(markNotificationsReadRequestSchema.safeParse({ ids: [id] }).success).toBe(true)
  })

  it('refuses an empty body, empty or oversized lists, and mixed bodies', () => {
    expect(markNotificationsReadRequestSchema.safeParse({}).success).toBe(false)
    expect(markNotificationsReadRequestSchema.safeParse({ ids: [] }).success).toBe(false)
    const tooMany = Array.from({ length: MAX_NOTIFICATION_READ_IDS + 1 }, () => id)
    expect(markNotificationsReadRequestSchema.safeParse({ ids: tooMany }).success).toBe(false)
    expect(markNotificationsReadRequestSchema.safeParse({ all: true, ids: [id] }).success).toBe(
      false,
    )
  })
})

describe('notificationSchema', () => {
  it('knows the review decision and security types only', () => {
    const base = { id, data: {}, read: false, createdAt: '2026-05-01T12:00:00.000Z' }
    expect(notificationSchema.safeParse({ ...base, type: 'password_changed' }).success).toBe(true)
    expect(notificationSchema.safeParse({ ...base, type: 'something_else' }).success).toBe(false)
  })
})
