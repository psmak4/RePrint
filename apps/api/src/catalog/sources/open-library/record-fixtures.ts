import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bylinePath, searchPath } from './adapter.js'
import { seriesMembersPath } from './series.js'

const BASE_URL = 'https://openlibrary.org'
export const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__')
/** Open Library allows 3 requests per second for identified apps; recording stays well under that. */
const DELAY_MS = 500

export interface FixtureRequest {
  /** File name without extension, written to `__fixtures__/<name>.json`. */
  name: string
  /** Path and query on the Source's API host. */
  path: string
}

/** The raw responses the adapter's unit and contract tests replay. Add a request here, then re-run the recorder. */
export const FIXTURE_REQUESTS: readonly FixtureRequest[] = [
  { name: 'search-title', path: searchPath('the left hand of darkness', 1) },
  { name: 'search-author', path: searchPath('ursula le guin', 1) },
  { name: 'search-isbn', path: searchPath('9780441478125', 1) },
  // Old, obscure results: several have no cover, and a few have no Author.
  { name: 'search-no-cover', path: `${searchPath('dune frank herbert', 1)}&sort=old` },
  { name: 'search-empty', path: searchPath('zzz little known pamphlet 1890', 1) },
  // One Book end to end: its record, its byline (a `key:` search), its Editions, and its Author.
  { name: 'work-left-hand', path: '/works/OL59800W.json' },
  { name: 'work-left-hand-byline', path: bylinePath('OL59800W') },
  { name: 'work-left-hand-editions', path: '/works/OL59800W/editions.json?limit=50' },
  // The Edition behind the work's Cover, which is not in the first page of Editions.
  { name: 'edition-left-hand-cover', path: '/books/OL31935740M.json' },
  { name: 'author-le-guin', path: '/authors/OL31353A.json' },
  // A Book with an Open Library Series record, and that Series' members (D-199).
  { name: 'work-hitchhiker', path: '/works/OL2163649W.json' },
  { name: 'work-hitchhiker-byline', path: bylinePath('OL2163649W') },
  { name: 'work-hitchhiker-editions', path: '/works/OL2163649W/editions.json?limit=50' },
  { name: 'edition-hitchhiker-cover', path: '/books/OL17837787M.json' },
  { name: 'series-hitchhiker', path: seriesMembersPath('OL326782L', 1) },
  {
    name: 'author-works-le-guin-1',
    path: '/search.json?q=author_key%3AOL31353A&fields=key%2Ctitle%2Cauthor_key%2Cedition_count&sort=editions&limit=100',
  },
  {
    name: 'author-works-le-guin-2',
    path: '/search.json?q=author_key%3AOL31353A&fields=key%2Ctitle%2Cauthor_key%2Cedition_count&sort=editions&limit=100&page=2',
  },
  {
    name: 'author-works-le-guin-3',
    path: '/search.json?q=author_key%3AOL31353A&fields=key%2Ctitle%2Cauthor_key%2Cedition_count&sort=editions&limit=100&page=3',
  },
]

export interface RecordOptions {
  fetch?: typeof fetch
  dir?: string
  userAgent: string
  delayMs?: number
  requests?: readonly FixtureRequest[]
}

/** Fetches each request and saves the raw JSON, pretty-printed. Run `pnpm format` afterward so Biome accepts the files. */
export async function recordFixtures(options: RecordOptions): Promise<string[]> {
  const doFetch = options.fetch ?? fetch
  const dir = options.dir ?? FIXTURES_DIR
  const delayMs = options.delayMs ?? DELAY_MS
  const requests = options.requests ?? FIXTURE_REQUESTS
  await mkdir(dir, { recursive: true })
  const written: string[] = []
  for (const [index, request] of requests.entries()) {
    if (index > 0 && delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
    const response = await doFetch(`${BASE_URL}${request.path}`, {
      headers: { 'User-Agent': options.userAgent, Accept: 'application/json' },
    })
    if (!response.ok) {
      throw new Error(`Recording ${request.name} failed: HTTP ${response.status}`)
    }
    const file = join(dir, `${request.name}.json`)
    await writeFile(file, `${JSON.stringify(await response.json(), null, 2)}\n`)
    written.push(file)
  }
  return written
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const version = process.env.npm_package_version ?? '0.0.0'
  const email = process.env.SOURCE_CONTACT_EMAIL ?? 'ops@reprint.com'
  const files = await recordFixtures({ userAgent: `RePrint/${version} (${email})` })
  console.log(`Recorded ${files.length} fixtures in ${FIXTURES_DIR}`)
}
