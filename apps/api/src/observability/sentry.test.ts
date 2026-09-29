import { describe, expect, it } from 'vitest'
import { initSentry } from './sentry.js'

const base = { APP_ENV: 'local', SENTRY_TRACES_SAMPLE_RATE: 0.1 }

describe('initSentry', () => {
  it('does nothing without a DSN', () => {
    expect(
      initSentry({ ...base, SENTRY_DSN: undefined, SENTRY_ENVIRONMENT: undefined }, 'api'),
    ).toBe(false)
  })
})
