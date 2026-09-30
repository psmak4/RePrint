import type { SourceImplementations } from '../index.js'
import { createOpenLibraryAdapter, type OpenLibraryOptions } from './adapter.js'
import { createFixtureFetch } from './fixture-fetch.js'

export interface OpenLibraryConfig {
  contactEmail: string
  version: string
  timeoutMs: number
  onInvalid?: OpenLibraryOptions['onInvalid']
}

/** The `fixtures` and `live` wiring for `createSourceAdapter`. Live calls identify RePrint (PRD §6). */
export function openLibraryImplementations(config: OpenLibraryConfig): SourceImplementations {
  const onInvalid = config.onInvalid
  const base = onInvalid ? { onInvalid } : {}
  const liveFetch: typeof fetch = (input, init) =>
    fetch(input, {
      ...init,
      headers: {
        ...init?.headers,
        'User-Agent': `RePrint/${config.version} (${config.contactEmail})`,
      },
      signal: AbortSignal.timeout(config.timeoutMs),
    })
  return {
    fixtures: () => createOpenLibraryAdapter({ ...base, fetch: createFixtureFetch() }),
    live: () => createOpenLibraryAdapter({ ...base, fetch: liveFetch }),
  }
}
