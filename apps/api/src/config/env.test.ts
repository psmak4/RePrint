import { describe, expect, it } from 'vitest'
import { EnvError, loadEnv } from './env.js'

describe('loadEnv', () => {
  it('applies defaults and splits WEB_ORIGINS', () => {
    const env = loadEnv({ WEB_ORIGINS: 'http://a.test:5173, http://b.test' })
    expect(env.WEB_ORIGINS).toEqual(['http://a.test:5173', 'http://b.test'])
    expect(env.PORT).toBe(3000)
    expect(env.TRUST_PROXY).toBe(false)
  })

  it('names a missing required variable', () => {
    expect(() => loadEnv({})).toThrow(EnvError)
    expect(() => loadEnv({})).toThrow(/WEB_ORIGINS: is required but not set/)
  })

  it('treats empty values as unset and reports invalid ones', () => {
    expect(() => loadEnv({ WEB_ORIGINS: '' })).toThrow(/WEB_ORIGINS/)
    expect(() => loadEnv({ WEB_ORIGINS: 'http://a.test', PORT: 'abc' })).toThrow(/PORT/)
    expect(() => loadEnv({ WEB_ORIGINS: 'not a url' })).toThrow(/WEB_ORIGINS/)
  })
})
