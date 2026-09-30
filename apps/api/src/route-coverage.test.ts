import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderOpenApiSpec } from './scripts/openapi.js'

/** A test file (relative to `src/`) and a fragment of the `it(...)` title that proves the case. */
type Proof = readonly [file: string, title: string]

const AUTH_SESSION = 'modules/auth/session.integration.test.ts'
const LOGIN = 'modules/auth/login.integration.test.ts'
const REGISTER = 'modules/auth/register.integration.test.ts'
const VERIFICATION = 'modules/auth/verification.integration.test.ts'
const RESET = 'modules/auth/password-reset.integration.test.ts'
const ME = 'modules/me/routes.integration.test.ts'
const EMAIL = 'modules/me/email-change.integration.test.ts'
const SESSIONS = 'modules/me/sessions.integration.test.ts'
const AVATAR = 'modules/me/avatar.integration.test.ts'
const DELETION = 'modules/accounts/deletion.integration.test.ts'
const CATALOG = 'modules/catalog/catalog.integration.test.ts'
const RESOLVE = 'modules/catalog/resolve.integration.test.ts'
const NOTIFICATIONS = 'modules/notifications/notifications.integration.test.ts'

/**
 * Every route the API serves must appear here with at least one allowed and one denied
 * integration test (PRD §12; CLAUDE.md definition of done). The test below fails when a route is
 * added without an entry, when an entry names a route that no longer exists, and when a named
 * test title is missing from its file. Extend this table with each new endpoint.
 */
const COVERAGE: Record<string, { allowed: Proof; denied: Proof }> = {
  'GET /v1/health': {
    allowed: ['modules/ops/ready.integration.test.ts', 'returns 200 when Postgres'],
    denied: ['modules/ops/ready.integration.test.ts', 'returns 503 Problem Details'],
  },
  'GET /v1/ready': {
    allowed: ['modules/ops/ready.integration.test.ts', 'returns 200 when Postgres'],
    denied: ['modules/ops/ready.integration.test.ts', 'returns 503 Problem Details'],
  },
  'GET /v1/auth/session': {
    allowed: [VERIFICATION, 'returns the viewer with verification state'],
    denied: [VERIFICATION, 'returns viewer null for Visitors'],
  },
  'POST /v1/auth/register': {
    allowed: [REGISTER, 'creates a Member, signs them in unverified'],
    denied: [REGISTER, 'refuses a breached password'],
  },
  'POST /v1/auth/verify-email': {
    allowed: [VERIFICATION, 'verifies the account once'],
    denied: [VERIFICATION, 'rejects an unknown token'],
  },
  'POST /v1/auth/resend-verification': {
    allowed: [VERIFICATION, 'sends a fresh link to an unverified account'],
    denied: [VERIFICATION, 'asks a Visitor who sends no email for one'],
  },
  'POST /v1/auth/login': {
    allowed: [LOGIN, 'signs in with the right email and password'],
    denied: [LOGIN, 'gives the same 401 body'],
  },
  'POST /v1/auth/logout': {
    allowed: [LOGIN, 'logout ends only the current session'],
    denied: [LOGIN, 'denies Visitors on both routes'],
  },
  'POST /v1/auth/logout-all': {
    allowed: [LOGIN, 'logout-all ends every session'],
    denied: [LOGIN, 'denies Visitors on both routes'],
  },
  'POST /v1/auth/forgot-password': {
    allowed: [RESET, 'answers identically for known and unknown emails'],
    denied: [RESET, 'rejects an invalid email'],
  },
  'POST /v1/auth/reset-password': {
    allowed: [RESET, 'sets a new Argon2id hash, ends all sessions'],
    denied: [RESET, 'rejects a reused token'],
  },
  'GET /v1/me': {
    allowed: [ME, 'returns the signed-in Member'],
    denied: [ME, 'returns 401 Problem Details for a Visitor'],
  },
  'PATCH /v1/me': {
    allowed: [ME, 'updates display name, bio, library privacy'],
    denied: [ME, 'returns 400 with field errors for invalid input'],
  },
  'DELETE /v1/me': {
    allowed: [DELETION, 'disables the account, ends every session'],
    denied: [DELETION, 'refuses a wrong password'],
  },
  'POST /v1/me/password': {
    allowed: [ME, 'sets a new Argon2id hash, keeps this session'],
    denied: [ME, 'refuses a wrong current password'],
  },
  'POST /v1/me/email': {
    allowed: [EMAIL, 'leaves the address alone'],
    denied: [EMAIL, 'rejects unauthenticated callers with 401'],
  },
  'POST /v1/me/email/confirm': {
    allowed: [EMAIL, 'leaves the address alone'],
    denied: [EMAIL, 'rejects reused, expired, and unknown tokens'],
  },
  'GET /v1/me/sessions': {
    allowed: [SESSIONS, 'lists active sessions'],
    denied: [SESSIONS, 'returns 401 Problem Details for a Visitor'],
  },
  'GET /v1/me/sessions/{id}': {
    allowed: [SESSIONS, 'returns one of the Member'],
    denied: [SESSIONS, 'returns 404 for another Member'],
  },
  'DELETE /v1/me/sessions/{id}': {
    allowed: [SESSIONS, 'ends another device'],
    denied: [SESSIONS, 'returns 404 for another Member’s session and does not end it'],
  },
  'GET /v1/me/notifications': {
    allowed: [NOTIFICATIONS, 'lists the viewer'],
    denied: [NOTIFICATIONS, 'refuses Visitors'],
  },
  'POST /v1/me/notifications/read': {
    allowed: [NOTIFICATIONS, 'marks the given notifications read'],
    denied: [NOTIFICATIONS, 'rejects an empty body and refuses Visitors'],
  },
  'GET /v1/books/{slug}': {
    allowed: [CATALOG, 'returns the Book with its Primary Edition'],
    denied: [CATALOG, 'returns 404 Problem Details for an unknown slug'],
  },
  'GET /v1/books/{slug}/editions': {
    allowed: [CATALOG, 'lists every Edition of the Book'],
    denied: [CATALOG, 'returns 404 for an unknown Book'],
  },
  'GET /v1/authors/{slug}': {
    allowed: [CATALOG, 'lists the Author’s Books grouped by Role'],
    denied: [CATALOG, 'returns 404 Problem Details for an unknown slug'],
  },
  'POST /v1/books/resolve': {
    allowed: [RESOLVE, 'stores the Book with its Editions and Authors'],
    denied: [RESOLVE, 'returns 404 Problem Details for an unknown or expired ref'],
  },
  'POST /v1/me/avatar': {
    allowed: [AVATAR, 'stores a 256 px WebP'],
    denied: [AVATAR, 'denies Visitors with 401'],
  },
  'GET /v1/uploads/{*}': {
    allowed: [AVATAR, 'serves a stored avatar'],
    denied: [AVATAR, 'returns 404 for a missing image'],
  },
}

// `AUTH_SESSION` covers the permission preHandlers themselves (requireAuth, requireVerified, requirePermission).
const GUARD_PROOFS: Proof[] = [
  [AUTH_SESSION, 'allows a Moderator on a moderator-only route'],
  [AUTH_SESSION, 'denies a Member with 403 and a Visitor with 401'],
]

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete']

async function titleExists(file: string, title: string): Promise<boolean> {
  const source = await readFile(fileURLToPath(new URL(`./${file}`, import.meta.url)), 'utf8')
  return source.split('\n').some((line) => /^\s*(it|test)\(/.test(line) && line.includes(title))
}

describe('integration test coverage of every endpoint', () => {
  it('lists an allowed and a denied case for exactly the routes the API serves', async () => {
    const spec = JSON.parse(await renderOpenApiSpec()) as {
      paths: Record<string, Record<string, unknown>>
    }
    const routes = Object.entries(spec.paths).flatMap(([path, operations]) =>
      Object.keys(operations)
        .filter((method) => HTTP_METHODS.includes(method))
        .map((method) => `${method.toUpperCase()} ${path}`),
    )
    expect(Object.keys(COVERAGE).sort()).toEqual(routes.sort())
  })

  it('names tests that exist', async () => {
    const proofs = [
      ...Object.values(COVERAGE).flatMap(({ allowed, denied }) => [allowed, denied]),
      ...GUARD_PROOFS,
    ]
    const missing: string[] = []
    for (const [file, title] of proofs) {
      if (!(await titleExists(file, title))) missing.push(`${file}: ${title}`)
    }
    expect(missing).toEqual([])
  })
})
