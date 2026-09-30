import type { SourceImplementations } from '../index.js'
import { createOpenLibraryAdapter, type OpenLibraryOptions } from './adapter.js'
import { createFixtureFetch } from './fixture-fetch.js'

export interface OpenLibraryConfig {
  /** The gateway's `fetch`: it adds the User-Agent, the rate limit, the circuit breaker, and the timeout (PRD §6). */
  fetch: typeof fetch
  onInvalid?: OpenLibraryOptions['onInvalid']
}

/** The `fixtures` and `live` wiring for `createSourceAdapter`. Live calls must go through the Source gateway. */
export function openLibraryImplementations(config: OpenLibraryConfig): SourceImplementations {
  const onInvalid = config.onInvalid
  const base = onInvalid ? { onInvalid } : {}
  return {
    fixtures: () => createOpenLibraryAdapter({ ...base, fetch: createFixtureFetch() }),
    live: () => createOpenLibraryAdapter({ ...base, fetch: config.fetch }),
  }
}
