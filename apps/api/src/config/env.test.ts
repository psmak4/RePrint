import { describe, expect, it } from 'vitest'
import { EnvError, loadEnv, loadWorkerEnv } from './env.js'

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
    expect(env.WORKER_IN_PROCESS).toBe(false)
  })

  it('defaults the Source settings and rejects an unknown SOURCE_MODE', () => {
    const source = { ...SERVICES, WEB_ORIGINS: 'http://a.test' }
    const env = loadEnv(source)
    expect(env.SOURCE_MODE).toBe('fixtures')
    expect(env.SOURCE_RATE_LIMIT_RPS).toBe(2)
    expect(env.SOURCE_TIMEOUT_MS).toBe(5000)
    expect(env.SOURCE_SEARCH_TIMEOUT_MS).toBe(1500)
    expect(loadEnv({ ...source, SOURCE_MODE: 'live' }).SOURCE_MODE).toBe('live')
    expect(() => loadEnv({ ...source, SOURCE_MODE: 'mock' })).toThrow(/SOURCE_MODE/)
  })

  it('reads WORKER_IN_PROCESS', () => {
    const source = { ...SERVICES, WEB_ORIGINS: 'http://a.test' }
    expect(loadEnv({ ...source, WORKER_IN_PROCESS: 'true' }).WORKER_IN_PROCESS).toBe(true)
    expect(() => loadEnv({ ...source, WORKER_IN_PROCESS: 'yes' })).toThrow(/WORKER_IN_PROCESS/)
  })

  it('closes signups by default and splits SIGNUP_INVITE_CODES', () => {
    const source = { ...SERVICES, WEB_ORIGINS: 'http://a.test' }
    const env = loadEnv(source)
    expect(env.PUBLIC_SIGNUPS).toBe(false)
    expect(env.SIGNUP_INVITE_CODES).toEqual([])
    const beta = loadEnv({ ...source, PUBLIC_SIGNUPS: 'true', SIGNUP_INVITE_CODES: ' a, b ,,c' })
    expect(beta.PUBLIC_SIGNUPS).toBe(true)
    expect(beta.SIGNUP_INVITE_CODES).toEqual(['a', 'b', 'c'])
  })

  it('defaults the session settings and reads overrides', () => {
    const source = { ...SERVICES, WEB_ORIGINS: 'http://a.test' }
    const env = loadEnv(source)
    expect(env.SESSION_TTL_DAYS).toBe(30)
    expect(env.COOKIE_DOMAIN).toBeUndefined()
    expect(env.COOKIE_SECURE).toBeUndefined()
    const custom = loadEnv({
      ...source,
      SESSION_TTL_DAYS: '7',
      COOKIE_DOMAIN: 'reprint.com',
      COOKIE_SECURE: 'true',
    })
    expect(custom).toMatchObject({
      SESSION_TTL_DAYS: 7,
      COOKIE_DOMAIN: 'reprint.com',
      COOKIE_SECURE: true,
    })
    expect(() => loadEnv({ ...source, SESSION_TTL_DAYS: '0' })).toThrow(/SESSION_TTL_DAYS/)
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

describe('email settings', () => {
  const source = { ...SERVICES, WEB_ORIGINS: 'http://a.test' }

  it('defaults to SMTP on the Mailpit port', () => {
    const env = loadEnv(source)
    expect(env).toMatchObject({ EMAIL_TRANSPORT: 'smtp', SMTP_HOST: 'localhost', SMTP_PORT: 1025 })
    expect(env.EMAIL_FROM).toContain('no-reply@')
  })

  it('accepts resend only with an API key', () => {
    expect(() => loadEnv({ ...source, EMAIL_TRANSPORT: 'resend' })).toThrow(/RESEND_API_KEY/)
    const env = loadEnv({ ...source, EMAIL_TRANSPORT: 'resend', RESEND_API_KEY: 're_test' })
    expect(env.EMAIL_TRANSPORT).toBe('resend')
  })

  it('rejects an unknown transport', () => {
    expect(() => loadEnv({ ...source, EMAIL_TRANSPORT: 'carrier-pigeon' })).toThrow(
      /EMAIL_TRANSPORT/,
    )
  })

  it('applies the same rules to the worker', () => {
    expect(loadWorkerEnv(SERVICES).EMAIL_TRANSPORT).toBe('smtp')
    expect(() => loadWorkerEnv({ ...SERVICES, EMAIL_TRANSPORT: 'resend' })).toThrow(
      /RESEND_API_KEY/,
    )
  })
})

describe('storage settings', () => {
  const source = { ...SERVICES, WEB_ORIGINS: 'http://a.test' }

  it('defaults to local disk with a 5 MB cap', () => {
    const env = loadEnv(source)
    expect(env.STORAGE_DRIVER).toBe('local')
    expect(env.STORAGE_LOCAL_DIR).toBe('.data/uploads')
    expect(env.UPLOAD_MAX_BYTES).toBe(5_242_880)
  })

  it('requires every R2 setting when the driver is r2', () => {
    expect(() => loadEnv({ ...source, STORAGE_DRIVER: 'r2' })).toThrow(
      /R2_ACCOUNT_ID[\s\S]*R2_ACCESS_KEY_ID[\s\S]*R2_SECRET_ACCESS_KEY[\s\S]*R2_BUCKET_UPLOADS/,
    )
    const env = loadEnv({
      ...source,
      STORAGE_DRIVER: 'r2',
      R2_ACCOUNT_ID: 'acct',
      R2_ACCESS_KEY_ID: 'key',
      R2_SECRET_ACCESS_KEY: 'secret',
      R2_BUCKET_UPLOADS: 'uploads',
    })
    expect(env.STORAGE_DRIVER).toBe('r2')
  })

  it('rejects an unknown driver', () => {
    expect(() => loadEnv({ ...source, STORAGE_DRIVER: 's3' })).toThrow(/STORAGE_DRIVER/)
  })
})
