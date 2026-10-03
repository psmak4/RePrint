// Mixed read-heavy load for the RePrint API (PRD §11 "Load test (before launch)", §12).
//
// Default shape: 200 requests per second for 10 minutes, about 70% reads, 25% search, 5% writes.
// Thresholds are the PRD §11 targets: under 1% errors; p95 of 200 ms (reads), 400 ms (writes),
// 300 ms (search). See docs/performance.md for how to run it and what each variable does.
//
//   k6 run -e BASE_URL=https://api.staging.example load/k6/mixed-read-heavy.js
import { check, fail } from 'k6'
import http from 'k6/http'
import { Rate } from 'k6/metrics'

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const ORIGIN = __ENV.WEB_ORIGIN || 'http://www.reprint.localhost:5173'
const RATE = Number(__ENV.RATE || 200)
const DURATION = __ENV.DURATION || '10m'
const MAX_VUS = Number(__ENV.MAX_VUS || 400)
// "email:password,email:password" of existing Members whose Shelves the write traffic changes.
// Empty means no write traffic: its share goes to reads, and the write threshold has no samples.
const MEMBERS = (__ENV.LOAD_MEMBERS || '').split(',').filter(Boolean)
// One client IP is held to the anonymous read limit (PRD §11). When the API sits behind a proxy
// that trusts X-Forwarded-For (TRUST_PROXY), a random address per request spreads the load.
const SPREAD_IPS = __ENV.SPREAD_IPS === 'true'

const SEARCH_TERMS = ['dune', 'almanac', 'kyoto', 'history', 'garden', 'night', 'river', 'king']

const errors = new Rate('errors')

export const options = {
  scenarios: {
    mixed: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: Math.min(MAX_VUS, Math.max(10, Math.ceil(RATE / 4))),
      maxVUs: MAX_VUS,
    },
  },
  thresholds: {
    errors: ['rate<0.01'],
    http_req_failed: ['rate<0.01'],
    'http_req_duration{kind:read}': ['p(95)<200'],
    'http_req_duration{kind:write}': ['p(95)<400'],
    'http_req_duration{kind:search}': ['p(95)<300'],
  },
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)]
}

function randomIp() {
  const octet = () => 1 + Math.floor(Math.random() * 253)
  return `10.${octet()}.${octet()}.${octet()}`
}

function headers(extra) {
  const base = { Accept: 'application/json', Origin: ORIGIN }
  if (SPREAD_IPS) base['X-Forwarded-For'] = randomIp()
  return Object.assign(base, extra)
}

function get(path, kind, extra) {
  const response = http.get(`${BASE_URL}${path}`, {
    headers: headers(extra),
    tags: { kind, name: path.replace(/[a-z0-9]+(?:-[a-z0-9]+)*$/, ':slug').split('?')[0] },
  })
  const ok = check(response, { 'status is 200': (r) => r.status === 200 })
  errors.add(!ok)
  return response
}

function write(method, path, body, session) {
  const response = http.request(method, `${BASE_URL}${path}`, body, {
    // The API rejects a JSON Content-Type on a request with no body.
    headers: headers(
      body === null
        ? { Cookie: `rp_session=${session}` }
        : { 'Content-Type': 'application/json', Cookie: `rp_session=${session}` },
    ),
    tags: { kind: 'write', name: `${method} /v1/books/:slug/shelf` },
  })
  const ok = check(response, { 'write succeeded': (r) => r.status === 200 })
  errors.add(!ok)
}

function login(credentials) {
  const [email, ...rest] = credentials.split(':')
  const response = http.post(
    `${BASE_URL}/v1/auth/login`,
    JSON.stringify({ email, password: rest.join(':') }),
    { headers: headers({ 'Content-Type': 'application/json' }), tags: { kind: 'setup' } },
  )
  const cookie = response.cookies.rp_session
  if (response.status !== 200 || !cookie || cookie.length === 0) {
    fail(`Login failed for ${email}: HTTP ${response.status}`)
  }
  return cookie[0].value
}

export function setup() {
  const discover = http.get(`${BASE_URL}/v1/discover`, { headers: headers() })
  if (discover.status !== 200) fail(`GET /v1/discover returned ${discover.status}; is the API up?`)
  const lists = discover.json()
  const slugs = []
  for (const key of ['topRated', 'recentlyReviewed', 'mostReviewedThisMonth']) {
    for (const book of lists[key] || []) slugs.push(book.slug)
  }
  const genres = http.get(`${BASE_URL}/v1/genres`, { headers: headers() }).json('items') || []
  const genreSlugs = genres.map((genre) => genre.slug)
  if (slugs.length === 0) fail('No Books on Discover; seed the Catalog first (pnpm db:seed).')
  return { slugs, genreSlugs, sessions: MEMBERS.map(login) }
}

function readTraffic(data) {
  const roll = Math.random()
  const slug = randomItem(data.slugs)
  if (roll < 0.5) get(`/v1/books/${slug}`, 'read')
  else if (roll < 0.7) get('/v1/discover', 'read')
  else if (roll < 0.8) get(`/v1/books/${slug}/reviews`, 'read')
  else if (roll < 0.9) get('/v1/genres', 'read')
  else if (data.genreSlugs.length > 0) get(`/v1/genres/${randomItem(data.genreSlugs)}`, 'read')
  else get('/v1/genres', 'read')
}

function searchTraffic() {
  const term = randomItem(SEARCH_TERMS)
  if (Math.random() < 0.8) get(`/v1/search?q=${term}`, 'search')
  else get(`/v1/search/suggest?q=${term.slice(0, 3)}`, 'search')
}

function writeTraffic(data) {
  const session = randomItem(data.sessions)
  const path = `/v1/books/${randomItem(data.slugs)}/shelf`
  write('PUT', path, JSON.stringify({ shelf: 'want_to_read' }), session)
  write('DELETE', path, null, session)
}

export default function (data) {
  const roll = Math.random()
  if (roll < 0.25) searchTraffic()
  else if (roll < 0.3 && data.sessions.length > 0) writeTraffic(data)
  else readTraffic(data)
}
