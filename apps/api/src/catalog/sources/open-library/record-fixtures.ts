import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE_URL = 'https://openlibrary.org'
const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__')
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
  { name: 'search-title', path: '/search.json?q=the+left+hand+of+darkness&limit=10' },
  { name: 'search-author', path: '/search.json?author=ursula+le+guin&limit=10' },
  { name: 'search-isbn', path: '/search.json?q=isbn%3A9780441478125&limit=10' },
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
