import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { OPEN_LIBRARY_URL } from './adapter.js'
import { FIXTURE_REQUESTS, FIXTURES_DIR } from './record-fixtures.js'

/**
 * A `fetch` that answers from the recorded fixtures (`SOURCE_MODE=fixtures`, PRD §13): a request whose path
 * was recorded gets that file, and anything else is a 404, the same as a record the Source does not have.
 */
export function createFixtureFetch(dir: string = FIXTURES_DIR): typeof fetch {
  const byPath = new Map(FIXTURE_REQUESTS.map((request) => [request.path, request.name]))
  return async (input) => {
    const url = new URL(String(input))
    const name = byPath.get(`${url.pathname}${url.search}`)
    if (url.origin !== OPEN_LIBRARY_URL || !name) return new Response('Not found', { status: 404 })
    const body = await readFile(join(dir, `${name}.json`), 'utf8')
    return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
}
