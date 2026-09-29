import { describe, expect, it } from 'vitest'
import { sentryOrigin } from './sentry.js'

describe('sentryOrigin', () => {
  it('returns the ingest origin of a DSN', () => {
    expect(sentryOrigin('https://key@o1.ingest.sentry.io/42')).toBe('https://o1.ingest.sentry.io')
  })
  it('is undefined without a usable DSN', () => {
    expect(sentryOrigin(undefined)).toBeUndefined()
    expect(sentryOrigin('')).toBeUndefined()
    expect(sentryOrigin('not a url')).toBeUndefined()
  })
})
