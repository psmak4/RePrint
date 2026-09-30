import {
  type BookCandidate,
  type BookCandidateEdition,
  bookCandidateSchema,
  type Cover,
} from '@reprint/shared'
import { z } from 'zod'
import { toLanguage } from './languages.js'

export const SOURCE_NAME = 'open_library'
/** A byline longer than this is a compilation's contributor list, not a byline. */
const MAX_CONTRIBUTIONS = 10

/** The part of a `search.json` response the adapter reads. */
export const searchResponseSchema = z.object({
  numFound: z.number().int().min(0),
  docs: z.array(z.unknown()),
})

const searchDocSchema = z.object({
  key: z.string().regex(/^\/works\/OL\d+W$/),
  title: z.string(),
  subtitle: z.string().optional(),
  author_key: z.array(z.string()).optional(),
  author_name: z.array(z.string()).optional(),
  cover_i: z.number().int().positive().optional(),
  cover_width: z.number().int().positive().optional(),
  cover_height: z.number().int().positive().optional(),
  cover_edition_key: z.string().optional(),
  first_publish_year: z.number().int().optional(),
  language: z.array(z.string()).optional(),
})
export type SearchDoc = z.infer<typeof searchDocSchema>

export function toCover(coverId: number, width?: number, height?: number): Cover {
  return {
    origin: 'open_library',
    originRef: String(coverId),
    width: width ?? null,
    height: height ?? null,
    url: null,
  }
}

const tokens = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []

/**
 * How sure we are a result matches the query. An ISBN search is exact; otherwise it is the share of query
 * words found in the title and Authors, plus a bonus for an exact title, so 1 means the title is the query.
 */
export function confidenceFor(query: string, isbnSearch: boolean, doc: SearchDoc): number {
  if (isbnSearch) return 1
  const queryTokens = tokens(query)
  if (queryTokens.length === 0) return 0
  const titleTokens = tokens(doc.title)
  if (titleTokens.join(' ') === queryTokens.join(' ')) return 1
  const haystack = new Set([...titleTokens, ...tokens((doc.author_name ?? []).join(' '))])
  const found = queryTokens.filter((token) => haystack.has(token)).length
  return Math.round((found / queryTokens.length) * 90) / 100
}

/** Translates one search result into a Book candidate, or `null` when it does not parse or validate. */
export function toBookCandidate(
  raw: unknown,
  query: string,
  isbnSearch: boolean,
): BookCandidate | { error: string } {
  const parsed = searchDocSchema.safeParse(raw)
  if (!parsed.success) return { error: z.prettifyError(parsed.error) }
  const doc = parsed.data

  const cover = doc.cover_i ? toCover(doc.cover_i, doc.cover_width, doc.cover_height) : null
  const authorNames = (doc.author_name ?? []).map((name) => name.trim())
  const contributions = authorNames.flatMap((authorName, index) => {
    const authorId = doc.author_key?.[index]
    if (!authorName || index >= MAX_CONTRIBUTIONS) return []
    return [
      {
        authorName,
        role: index === 0 ? ('author' as const) : ('co_author' as const),
        position: index,
        ...(authorId
          ? {
              sourceLink: {
                source: SOURCE_NAME,
                entityType: 'author' as const,
                sourceId: authorId,
              },
            }
          : {}),
      },
    ]
  })

  // A search result names no Edition details, so the candidate carries one placeholder Edition for the
  // Book's cover Edition. `getEditions` (M3-T06) supplies the real ones.
  const languages = (doc.language ?? []).map(toLanguage).filter((code) => code !== null)
  const edition: BookCandidateEdition = {
    isbn13: null,
    format: 'unknown',
    language: languages.length === 1 ? (languages[0] ?? null) : null,
    title: null,
    publisherName: null,
    publishedDate: null,
    pageCount: null,
    cover,
    ...(doc.cover_edition_key
      ? {
          sourceLink: {
            source: SOURCE_NAME,
            entityType: 'edition' as const,
            sourceId: doc.cover_edition_key,
          },
        }
      : {}),
  }

  const candidate = bookCandidateSchema.safeParse({
    book: {
      title: doc.title,
      subtitle: doc.subtitle?.trim() || null,
      description: null,
      firstPublishedYear:
        doc.first_publish_year && doc.first_publish_year > 0 ? doc.first_publish_year : null,
      originalLanguage: null,
      cover,
      contributions,
      series: [],
      subjects: [],
    },
    editions: [edition],
    sourceLink: {
      source: SOURCE_NAME,
      entityType: 'book',
      sourceId: doc.key.replace('/works/', ''),
    },
    confidence: confidenceFor(query, isbnSearch, doc),
  })
  return candidate.success ? candidate.data : { error: z.prettifyError(candidate.error) }
}
