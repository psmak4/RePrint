import type { CookieSerializeOptions } from '@fastify/cookie'
import type { Env } from '../../config/env.js'

export const SESSION_COOKIE = 'rp_session'

/** Cookie attributes for `rp_session` (PRD §8): HttpOnly, SameSite=Lax, Secure outside local. */
export function sessionCookieOptions(
  env: Pick<Env, 'APP_ENV' | 'COOKIE_DOMAIN' | 'COOKIE_SECURE' | 'SESSION_TTL_DAYS'>,
): CookieSerializeOptions {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: env.COOKIE_SECURE ?? env.APP_ENV !== 'local',
    maxAge: env.SESSION_TTL_DAYS * 24 * 60 * 60,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  }
}
