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
const EXPORT = 'modules/me/export.integration.test.ts'
const AVATAR = 'modules/me/avatar.integration.test.ts'
const DELETION = 'modules/accounts/deletion.integration.test.ts'
const CATALOG = 'modules/catalog/catalog.integration.test.ts'
const FEDERATED = 'modules/catalog/federated-search.integration.test.ts'
const SEARCH = 'modules/catalog/search.integration.test.ts'
const GENRES = 'modules/catalog/genres.integration.test.ts'
const SERIES = 'modules/catalog/series.integration.test.ts'
const DISCOVER = 'modules/discover/discover.integration.test.ts'
const RESOLVE = 'modules/catalog/resolve.integration.test.ts'
const MY_REVIEW = 'modules/reviews/my-review.integration.test.ts'
const HELPFUL = 'modules/reviews/helpful.integration.test.ts'
const REPORTS = 'modules/reviews/reports.integration.test.ts'
const BOOK_REVIEWS = 'modules/reviews/book-reviews.integration.test.ts'
const MOD_QUEUE = 'modules/moderation/queue.integration.test.ts'
const MOD_DECISIONS = 'modules/moderation/decisions.integration.test.ts'
const MOD_REPORTS = 'modules/moderation/reports.integration.test.ts'
const ADMIN_AUDIT = 'modules/admin/audit.integration.test.ts'
const ADMIN_BOOKS = 'modules/admin/books.integration.test.ts'
const ADMIN_FEATURED = 'modules/admin/featured.integration.test.ts'
const ADMIN_GENRES = 'modules/admin/genres.integration.test.ts'
const ADMIN_MERGE = 'modules/admin/merge.integration.test.ts'
const ADMIN_USERS = 'modules/admin/users.integration.test.ts'
const ADMIN_SUSPENSIONS = 'modules/admin/suspensions.integration.test.ts'
const SHELF = 'modules/library/shelf.integration.test.ts'
const LIBRARY = 'modules/library/library.integration.test.ts'
const PROFILES = 'modules/profiles/profiles.integration.test.ts'
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
  'GET /v1/books/{slug}/my-review': {
    allowed: [MY_REVIEW, 'returns the viewer’s review, with the rejection reason'],
    denied: [MY_REVIEW, 'denies Visitors, answers 404 without a review'],
  },
  'PUT /v1/books/{slug}/my-review': {
    allowed: [MY_REVIEW, 'creates a Pending review with its first version'],
    denied: [MY_REVIEW, 'denies Visitors with 401 and unverified Members with 403'],
  },
  'DELETE /v1/books/{slug}/my-review': {
    allowed: [MY_REVIEW, 'deletes an Approved review permanently'],
    denied: [MY_REVIEW, 'denies Visitors, answers 404 without a review, and leaves'],
  },
  'POST /v1/reviews/{id}/helpful': {
    allowed: [HELPFUL, 'lets a verified Member vote once on an Approved review'],
    denied: [HELPFUL, 'denies Visitors, unverified Members, the author, and non-Approved reviews'],
  },
  'DELETE /v1/reviews/{id}/helpful': {
    allowed: [HELPFUL, 'removes the vote and lowers the count'],
    denied: [HELPFUL, 'denies Visitors and answers 404 for an unknown review'],
  },
  'PUT /v1/books/{slug}/shelf': {
    allowed: [SHELF, 'puts a Book on a Shelf and replaces it'],
    denied: [SHELF, 'returns 401 to Visitors'],
  },
  'DELETE /v1/books/{slug}/shelf': {
    allowed: [SHELF, 'removes a Book from the Shelf'],
    denied: [SHELF, 'returns 401 to Visitors on delete'],
  },
  'GET /v1/users/{username}/library': {
    allowed: [LIBRARY, 'lists entries newest first with counts per Shelf'],
    denied: [LIBRARY, 'hides a private library from Visitors and other Members, but not its owner'],
  },
  'GET /v1/users/{username}': {
    allowed: [PROFILES, 'returns the public profile with review and helpful totals'],
    denied: [PROFILES, 'answers 404 for unknown, suspended, and deleted users'],
  },
  'GET /v1/users/{username}/reviews': {
    allowed: [PROFILES, 'lists Approved reviews newest first, paginated'],
    denied: [PROFILES, 'answers 404 for unknown, suspended, and deleted users on reviews'],
  },
  'POST /v1/reviews/{id}/reports': {
    allowed: [REPORTS, 'records a report from a verified Member on someone else’s Approved review'],
    denied: [REPORTS, 'denies Visitors, unverified Members, the author, and a second report'],
  },
  'GET /v1/books/{slug}/helpful-votes': {
    allowed: [HELPFUL, 'lists the review IDs the Member marked helpful on a Book'],
    denied: [HELPFUL, 'denies Visitors and answers 404 for an unknown Book'],
  },
  'GET /v1/books/{slug}/reviews': {
    allowed: [BOOK_REVIEWS, 'lists Approved reviews only, with the author'],
    denied: [BOOK_REVIEWS, 'returns 404 Problem Details for an unknown Book'],
  },
  'GET /v1/me/export': {
    allowed: [EXPORT, 'downloads the Member'],
    denied: [EXPORT, 'returns 401 Problem Details for a Visitor'],
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
  'GET /v1/genres': {
    allowed: [GENRES, 'returns the Genre tree with children under their parent'],
    denied: [GENRES, 'rejects an unknown sort with 400'],
  },
  'GET /v1/genres/{slug}': {
    allowed: [GENRES, 'lists Books in the Genre and its child Genres'],
    denied: [GENRES, 'returns 404 Problem Details for an unknown slug'],
  },
  'GET /v1/discover': {
    allowed: [DISCOVER, 'builds every Book row from approved reviews'],
    denied: [DISCOVER, 'hides every row with fewer than 6 Books'],
  },
  'GET /v1/series/{slug}': {
    allowed: [SERIES, 'lists Books in reading order with decimal positions'],
    denied: [SERIES, 'returns 404 Problem Details for an unknown slug'],
  },
  'GET /v1/search/suggest': {
    allowed: [SEARCH, 'returns Books and Authors from the Catalog'],
    denied: [SEARCH, 'rejects a query over 100 characters'],
  },
  'GET /v1/search': {
    allowed: [
      FEDERATED,
      'shows Books the Source found that are not on RePrint yet, with opaque references',
    ],
    denied: [FEDERATED, 'rejects a page below 1 with Problem Details'],
  },
  'POST /v1/books/resolve': {
    allowed: [RESOLVE, 'stores the Book with its Editions and Authors'],
    denied: [RESOLVE, 'returns 404 Problem Details for an unknown or expired ref'],
  },
  'GET /v1/mod/reviews': {
    allowed: [MOD_QUEUE, 'lists Pending reviews oldest first'],
    denied: [MOD_QUEUE, 'denies Members with 403 and Visitors with 401 on every route'],
  },
  'POST /v1/mod/reviews/{id}/claim': {
    allowed: [MOD_QUEUE, 'claims a Pending review for 10 minutes'],
    denied: [MOD_QUEUE, 'denies Members with 403 and Visitors with 401 on every route'],
  },
  'POST /v1/mod/reviews/{id}/approve': {
    allowed: [MOD_DECISIONS, 'approves a Pending review'],
    denied: [MOD_DECISIONS, 'denies Members with 403 and Visitors with 401 on both routes'],
  },
  'POST /v1/mod/reviews/{id}/reject': {
    allowed: [MOD_DECISIONS, 'rejects with a reason'],
    denied: [MOD_DECISIONS, 'denies Members with 403 and Visitors with 401 on both routes'],
  },
  'POST /v1/mod/reviews/{id}/unpublish': {
    allowed: [
      MOD_REPORTS,
      'unpublishes, updates aggregates, closes reports, notifies the author, and audits it',
    ],
    denied: [MOD_REPORTS, 'denies Members with 403 and Visitors with 401'],
  },
  'GET /v1/mod/reports': {
    allowed: [MOD_REPORTS, 'groups open reports by review, oldest first, with reasons'],
    denied: [MOD_REPORTS, 'denies Members with 403 and Visitors with 401'],
  },
  'GET /v1/admin/audit': {
    allowed: [ADMIN_AUDIT, 'lists entries newest first with actor and before/after for Admins'],
    denied: [ADMIN_AUDIT, 'denies Moderators and Members with 403 and Visitors with 401'],
  },
  'GET /v1/admin/audit.csv': {
    allowed: [
      ADMIN_AUDIT,
      'streams the filtered rows with a header row, escaped, and guards against formula injection',
    ],
    denied: [ADMIN_AUDIT, 'denies Moderators and Members with 403 and Visitors with 401'],
  },
  'GET /v1/admin/books/{id}': {
    allowed: [ADMIN_BOOKS, 'returns the editable view with locks and the Book’s Editions'],
    denied: [ADMIN_BOOKS, 'denies Moderators and Members with 403 and Visitors with 401'],
  },
  'PATCH /v1/admin/books/{id}': {
    allowed: [ADMIN_BOOKS, 'edits fields, locks them, and audits before and after values'],
    denied: [ADMIN_BOOKS, 'denies Moderators and Members with 403 and Visitors with 401'],
  },
  'GET /v1/admin/featured': {
    allowed: [
      ADMIN_FEATURED,
      'shows the picks, every live Genre, and Approved reviews to pick from',
    ],
    denied: [ADMIN_FEATURED, 'denies Members with 403 and Visitors with 401'],
  },
  'PUT /v1/admin/featured': {
    allowed: [
      ADMIN_FEATURED,
      'sets the Genres in order and the review, rebuilds Discover, and audits it',
    ],
    denied: [ADMIN_FEATURED, 'lets a Moderator set the review but not the Genres'],
  },
  'GET /v1/admin/genres': {
    allowed: [ADMIN_GENRES, 'lists every Genre with its Book and rule counts, archived ones too'],
    denied: [ADMIN_GENRES, 'denies Moderators and Members with 403 and Visitors with 401'],
  },
  'POST /v1/admin/genres': {
    allowed: [ADMIN_GENRES, 'creates a Genre and audits it'],
    denied: [ADMIN_GENRES, 'denies Moderators and Members with 403 and Visitors with 401'],
  },
  'PATCH /v1/admin/genres/{id}': {
    allowed: [ADMIN_GENRES, 'edits fields, archives, restores, and audits before and after'],
    denied: [ADMIN_GENRES, 'denies Moderators and Members with 403 and Visitors with 401'],
  },
  'GET /v1/admin/subject-rules': {
    allowed: [ADMIN_GENRES, 'lists, creates, and removes rules, auditing each change'],
    denied: [ADMIN_GENRES, 'denies Moderators and Members with 403 and Visitors with 401'],
  },
  'POST /v1/admin/subject-rules': {
    allowed: [ADMIN_GENRES, 'lists, creates, and removes rules, auditing each change'],
    denied: [ADMIN_GENRES, 'denies Moderators and Members with 403 and Visitors with 401'],
  },
  'DELETE /v1/admin/subject-rules/{id}': {
    allowed: [ADMIN_GENRES, 'lists, creates, and removes rules, auditing each change'],
    denied: [ADMIN_GENRES, 'denies Moderators and Members with 403 and Visitors with 401'],
  },
  'GET /v1/admin/catalog/stats': {
    allowed: [ADMIN_GENRES, 'returns Catalog size and twelve months of growth'],
    denied: [ADMIN_GENRES, 'denies Moderators and Members with 403 and Visitors with 401'],
  },
  'GET /v1/admin/books/merge-candidates': {
    allowed: [ADMIN_MERGE, 'lists open merge candidates oldest first with both Books'],
    denied: [ADMIN_MERGE, 'denies Moderators and Members with 403 and Visitors with 401'],
  },
  'POST /v1/admin/books/merge-candidates/{id}/dismiss': {
    allowed: [ADMIN_MERGE, 'dismisses a candidate and audits it'],
    denied: [ADMIN_MERGE, 'denies Moderators and Members with 403 and Visitors with 401'],
  },
  'POST /v1/admin/books/merge': {
    allowed: [ADMIN_MERGE, 'merges Books, moves their data, and audits the merge'],
    denied: [ADMIN_MERGE, 'denies Moderators and Members with 403 and Visitors with 401'],
  },
  'POST /v1/admin/books/{id}/cover': {
    allowed: [ADMIN_BOOKS, 'stores a WebP of at most 600 px as an upload cover'],
    denied: [ADMIN_BOOKS, 'denies Moderators and Members with 403 and Visitors with 401'],
  },
  'POST /v1/admin/books/{id}/refresh': {
    allowed: [ADMIN_BOOKS, 'queues an interactive-priority refresh and audits it'],
    denied: [ADMIN_BOOKS, 'denies Moderators and Members with 403 and Visitors with 401'],
  },
  'GET /v1/admin/users': {
    allowed: [ADMIN_USERS, 'lists users newest first with roles and counts for Admins'],
    denied: [ADMIN_USERS, 'denies Members with 403 and Visitors with 401'],
  },
  'GET /v1/admin/users/{id}': {
    allowed: [ADMIN_USERS, 'returns the full detail to Admins'],
    denied: [ADMIN_USERS, 'denies Members with 403 and Visitors with 401'],
  },
  'PUT /v1/admin/users/{id}/roles/{role}': {
    allowed: [ADMIN_USERS, 'grants a role and records before and after values'],
    denied: [ADMIN_USERS, 'denies Moderators and Members with 403 and Visitors with 401'],
  },
  'DELETE /v1/admin/users/{id}/roles/{role}': {
    allowed: [ADMIN_USERS, 'removes a role and records it'],
    denied: [ADMIN_USERS, 'denies Moderators and Members with 403 and Visitors with 401'],
  },
  'POST /v1/admin/users/{id}/suspend': {
    allowed: [ADMIN_SUSPENSIONS, 'suspends, ends every session, emails the user, and audits it'],
    denied: [ADMIN_SUSPENSIONS, 'denies Moderators and Members with 403 and Visitors with 401'],
  },
  'POST /v1/admin/users/{id}/unsuspend': {
    allowed: [ADMIN_SUSPENSIONS, 'lifts a suspension and audits it'],
    denied: [ADMIN_SUSPENSIONS, 'denies Moderators and Members with 403 and Visitors with 401'],
  },
  'POST /v1/admin/users/{id}/revoke-sessions': {
    allowed: [ADMIN_SUSPENSIONS, 'ends every session of the user and audits it'],
    denied: [ADMIN_SUSPENSIONS, 'returns 404 for unknown users and denies non-Admins'],
  },
  'POST /v1/admin/users/{id}/resend-verification': {
    allowed: [ADMIN_SUSPENSIONS, 'sends a fresh link to an unverified account and audits it'],
    denied: [ADMIN_SUSPENSIONS, 'denies Members with 403 and Visitors with 401'],
  },
  'POST /v1/mod/reports/{reviewId}/dismiss': {
    allowed: [MOD_REPORTS, 'closes the reports, un-hides the review, and audits it'],
    denied: [MOD_REPORTS, 'denies Members with 403 and Visitors with 401'],
  },
  'GET /v1/mod/stats': {
    allowed: [MOD_QUEUE, 'reports the pending count and the age of the oldest'],
    denied: [MOD_QUEUE, 'denies Members with 403 and Visitors with 401 on every route'],
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
