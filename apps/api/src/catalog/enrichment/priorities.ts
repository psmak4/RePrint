import type { SourceField, TrustedFieldPriorities } from '../sources/types.js'

/** A Source's priority for a stored field: 1 is the first choice, `undefined` means not trusted. */
export type PriorityLookup = (source: string, field: string) => number | undefined

/** Which trusted-field entry a stored field name falls under. Fields not listed have no priority. */
const SOURCE_FIELD_OF: Readonly<Record<string, SourceField>> = {
  title: 'title',
  subtitle: 'subtitle',
  description: 'description',
  firstPublishedYear: 'firstPublishedYear',
  originalLanguage: 'originalLanguage',
  cover: 'cover',
  isbn13: 'editions',
  format: 'editions',
  language: 'editions',
  publisherName: 'editions',
  publishedDate: 'editions',
  pageCount: 'editions',
  name: 'authorBio',
  alternateNames: 'authorBio',
  bio: 'authorBio',
  birthDate: 'authorBio',
  deathDate: 'authorBio',
  authorPhoto: 'authorPhoto',
}

/** Builds the lookup from each known Source's declared trusted fields (PRD §6). */
export function createPriorityLookup(
  sources: Iterable<{ name: string; trustedFields?: TrustedFieldPriorities }>,
): PriorityLookup {
  const byName = new Map<string, TrustedFieldPriorities>()
  for (const source of sources) byName.set(source.name, source.trustedFields ?? {})
  return (source, field) => {
    const sourceField = SOURCE_FIELD_OF[field]
    return sourceField ? byName.get(source)?.[sourceField] : undefined
  }
}
