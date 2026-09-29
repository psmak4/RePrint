import { randomBytes } from 'node:crypto'

export function generateNonce(): string {
  return randomBytes(16).toString('base64')
}

/**
 * Strict Content-Security-Policy for server-rendered pages (PRD §11). Scripts run only with the
 * per-request nonce. `apiOrigin` is allowed for client-side fetches after load, and `sentryOrigin` for error reports.
 */
export function buildCsp(
  nonce: string,
  options: { apiOrigin?: string; sentryOrigin?: string; dev?: boolean } = {},
): string {
  const connect = ["'self'", ...(options.apiOrigin ? [options.apiOrigin] : [])]
  if (options.sentryOrigin) connect.push(options.sentryOrigin)
  // The Vite dev server needs a websocket for HMR and inline styles for injected CSS.
  if (options.dev) connect.push('ws:', 'http:')
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [`'nonce-${nonce}'`, "'strict-dynamic'"],
    'style-src': options.dev ? ["'self'", "'unsafe-inline'"] : ["'self'"],
    'img-src': ["'self'", 'data:', 'https:'],
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
