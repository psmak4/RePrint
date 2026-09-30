import type { SourceAdapter } from '../types.js'
import { SEED_SOURCE } from './generate.js'

/**
 * The Source behind generated sample Books. It only carries a name, a `store` policy, and trusted fields
 * for `ingestBook`; nothing searches it, so its lookups answer "not found".
 */
export function createSeedSource(): SourceAdapter {
  return {
    name: SEED_SOURCE,
    storagePolicy: 'store',
    trustedFields: {
      title: 3,
      contributions: 3,
      editions: 3,
      description: 3,
      series: 3,
      subjects: 3,
    },
    searchBooks: async (_query, page) => ({ candidates: [], page, hasMore: false }),
    getBook: async () => null,
    getEditions: async () => [],
    getAuthor: async () => null,
  }
}
