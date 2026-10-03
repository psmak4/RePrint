import { randomBytes } from 'node:crypto'

export function generateNonce(): string {
  return randomBytes(16).toString('base64')
}

/**
 * Strict Content-Security-Policy for server-rendered pages (PRD §11). Scripts run only with the
 * per-request nonce. `apiOrigin` is allowed for client-side fetches after load, `sentryOrigin` for error reports, and
 * `analyticsOrigin` for the analytics script and its events.
 */
export function buildCsp(
  nonce: string,
  options: {
    apiOrigin?: string
    sentryOrigin?: string
    analyticsOrigin?: string
    dev?: boolean
  } = {},
): string {
  const connect = ["'self'", ...(options.apiOrigin ? [options.apiOrigin] : [])]
  if (options.sentryOrigin) connect.push(options.sentryOrigin)
  if (options.analyticsOrigin) connect.push(options.analyticsOrigin)
  // The Vite dev server needs a websocket for HMR and inline styles for injected CSS.
  if (options.dev) connect.push('ws:', 'http:')
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // `strict-dynamic` lets the nonced entry script add the analytics script; the host is for old browsers.
    'script-src': [
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(options.analyticsOrigin ? [options.analyticsOrigin] : []),
    ],
    'style-src': options.dev ? ["'self'", "'unsafe-inline'"] : ["'self'"],
    // blob: is the avatar preview; the local uploads driver serves over http in dev.
    'img-src': ["'self'", 'data:', 'blob:', 'https:', ...(options.dev ? ['http:'] : [])],
    'font-src': ["'self'"],
    'connect-src': connect,
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  }
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ')
}

/** Headers Netlify also sets on static assets (see netlify.toml); kept in sync by a test. */
export const BASELINE_SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
} as const
