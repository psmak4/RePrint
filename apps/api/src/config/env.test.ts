import { describe, expect, it } from 'vitest'
import { EnvError, loadEnv } from './env.js'

const SERVICES = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
}

describe('loadEnv', () => {
  it('applies defaults and splits WEB_ORIGINS', () => {
    const env = loadEnv({ ...SERVICES, WEB_ORIGINS: 'http://a.test:5173, http://b.test' })
    expect(env.WEB_ORIGINS).toEqual(['http://a.test:5173', 'http://b.test'])
    expect(env.PORT).toBe(3000)
    expect(env.TRUST_PROXY).toBe(false)
  })

  it('names a missing required variable', () => {
    expect(() => loadEnv({})).toThrow(EnvError)
    expect(() => loadEnv({})).toThrow(/WEB_ORIGINS: is required but not set/)
  })

  it('requires DATABASE_URL and REDIS_URL', () => {
    expect(() => loadEnv({ WEB_ORIGINS: 'http://a.test' })).toThrow(/DATABASE_URL: is required/)
    expect(() => loadEnv({ WEB_ORIGINS: 'http://a.test' })).toThrow(/REDIS_URL: is required/)
  })

  it('treats empty values as unset and reports invalid ones', () => {
    expect(() => loadEnv({ ...SERVICES, WEB_ORIGINS: '' })).toThrow(/WEB_ORIGINS/)
    expect(() => loadEnv({ ...SERVICES, WEB_ORIGINS: 'http://a.test', PORT: 'abc' })).toThrow(
      /PORT/,
    )
    expect(() => loadEnv({ ...SERVICES, WEB_ORIGINS: 'not a url' })).toThrow(/WEB_ORIGINS/)
  })
})
