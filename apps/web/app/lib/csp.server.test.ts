import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BASELINE_SECURITY_HEADERS, buildCsp, generateNonce } from './csp.server.js'

describe('buildCsp', () => {
  it('allows scripts only with the nonce and never unsafe-inline for scripts', () => {
    const csp = buildCsp('abc123')
    expect(csp).toContain("script-src 'nonce-abc123' 'strict-dynamic'")
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/)
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("style-src 'self'")
  })

  it('permits the API origin for connect-src', () => {
    expect(buildCsp('n', { apiOrigin: 'https://api.reprint.test' })).toContain(
      "connect-src 'self' https://api.reprint.test",
    )
  })

  it('permits the Sentry ingest origin only when given', () => {
    expect(buildCsp('n')).not.toContain('sentry')
    expect(buildCsp('n', { sentryOrigin: 'https://o1.ingest.sentry.io' })).toContain(
      "connect-src 'self' https://o1.ingest.sentry.io",
    )
  })

  it('permits the analytics origin for scripts and events only when given', () => {
    expect(buildCsp('n')).not.toContain('plausible')
    const csp = buildCsp('n', { analyticsOrigin: 'https://plausible.io' })
    expect(csp).toContain("script-src 'nonce-n' 'strict-dynamic' https://plausible.io")
    expect(csp).toContain("connect-src 'self' https://plausible.io")
  })

  it('generates a fresh nonce each time', () => {
    expect(generateNonce()).not.toBe(generateNonce())
  })
})

describe('netlify.toml', () => {
  it('sets the same baseline headers as SSR responses', () => {
    const toml = readFileSync(new URL('../../netlify.toml', import.meta.url), 'utf8')
    for (const [name, value] of Object.entries(BASELINE_SECURITY_HEADERS)) {
      expect(toml).toContain(`${name} = "${value}"`)
    }
  })
})

describe('netlify.toml build', () => {
  const toml = readFileSync(new URL('../../netlify.toml', import.meta.url), 'utf8')

  it('builds with Node 24 and publishes the client assets', () => {
    expect(toml).toContain('NODE_VERSION = "24"')
    expect(toml).toContain('publish = "build/client"')
  })

  it('caches hashed assets immutably', () => {
    expect(toml).toMatch(/for = "\/assets\/\*"[\s\S]*immutable/)
  })
})

describe('vite.config.ts', () => {
  it('enables the Netlify adapter for Netlify builds', () => {
    const config = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8')
    expect(config).toContain("from '@netlify/vite-plugin-react-router'")
    expect(config).toContain('process.env.NETLIFY')
  })
})
