import { describe, expect, it } from 'vitest'
import { sessionCookieOptions } from './session-cookie.js'

const base = {
  APP_ENV: 'local',
  COOKIE_DOMAIN: undefined,
  COOKIE_SECURE: undefined,
  SESSION_TTL_DAYS: 30,
} as const

describe('sessionCookieOptions', () => {
  it('is HttpOnly, SameSite=Lax, and lasts the session TTL', () => {
    expect(sessionCookieOptions(base)).toMatchObject({
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
    })
  })

  it('is not Secure locally, and Secure everywhere else', () => {
    expect(sessionCookieOptions(base).secure).toBe(false)
    for (const APP_ENV of ['preview', 'staging', 'production'] as const) {
      expect(sessionCookieOptions({ ...base, APP_ENV }).secure).toBe(true)
    }
  })

  it('lets COOKIE_SECURE override the default', () => {
    expect(sessionCookieOptions({ ...base, COOKIE_SECURE: true }).secure).toBe(true)
    expect(
      sessionCookieOptions({ ...base, APP_ENV: 'production', COOKIE_SECURE: false }).secure,
    ).toBe(false)
  })

  it('sets Domain only when COOKIE_DOMAIN is configured', () => {
    expect(sessionCookieOptions(base)).not.toHaveProperty('domain')
    expect(sessionCookieOptions({ ...base, COOKIE_DOMAIN: 'reprint.com' }).domain).toBe(
      'reprint.com',
    )
  })
})
