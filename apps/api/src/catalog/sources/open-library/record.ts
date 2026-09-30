import {
  type AuthorRecord,
  type BookCandidate,
  type BookCandidateEdition,
  bookCandidateEditionSchema,
  type Format,
  toIsbn13,
} from '@reprint/shared'
import { z } from 'zod'
import { toLanguage } from './languages.js'
import { SOURCE_NAME, toBookCandidate, toCover } from './search.js'

/** The most subjects kept for a Book; Open Library lists dozens, many in other languages. */
const MAX_SUBJECTS = 25
const MAX_ALTERNATE_NAMES = 20

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** A day, month, and year that form a real calendar date, as `YYYY-MM-DD`, or `null`. */
function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1) return null
  if (date.getUTCDate() !== day || year < 1) return null
  return date.toISOString().slice(0, 10)
}

const monthNumber = (name: string) => MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1

/**
 * Open Library dates are free text: `1969-03-01`, `Aug 27, 2003`, `20 Sep 2018`, `March 1, 2000`. Only a
 * full calendar date is kept; a bare year or month (`1969`, `1969-03`) or an ambiguous form (`21/06/2006`)
 * is `null`, because a Catalog date is never guessed.
 */
export function toIsoDate(text: string | undefined): string | null {
  const value = text?.trim()
  if (!value) return null
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match) return isoDate(Number(match[1]), Number(match[2]), Number(match[3]))
  match = /^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})$/.exec(value)
  const month = match?.[1] ? monthNumber(match[1]) : 0
  if (match && month) return isoDate(Number(match[3]), month, Number(match[2]))
  match = /^(\d{1,2}) ([A-Za-z]{3,9})\.?,? (\d{4})$/.exec(value)
  const dayFirstMonth = match?.[2] ? monthNumber(match[2]) : 0
  if (match && dayFirstMonth) return isoDate(Number(match[3]), dayFirstMonth, Number(match[1]))
  return null
}

/** Maps Open Library's free-text `physical_format` to the five Formats. */
export function toFormat(text: string | undefined): Format {
  const value = text?.toLowerCase() ?? ''
  if (/audio|cassette|\bcd\b|mp3|spoken/.test(value)) return 'audiobook'
  if (/e-?book|kindle|electronic|epub|\bpdf\b|digital/.test(value)) return 'ebook'
  if (/hard|library binding|board|cloth/.test(value)) return 'hardcover'
  if (/paper|soft|mass market|brossura|broch|pocket|trade|\bpb\b/.test(value)) return 'paperback'
  return 'unknown'
}

const textOrValue = z.union([z.string(), z.object({ value: z.string() }).transform((v) => v.value)])

/** The part of a work record the adapter reads. */
export const workSchema = z.object({
  key: z.string().regex(/^\/works\/OL\d+W$/),
  title: z.string(),
  subtitle: z.string().optional(),
  description: textOrValue.optional(),
  subjects: z.array(z.string()).optional(),
  covers: z.array(z.number().int()).optional(),
})
export type Work = z.infer<typeof workSchema>

const editionRecordSchema = z.object({
  key: z.string().regex(/^\/books\/OL\d+M$/),
  title: z.string().optional(),
  publishers: z.array(z.string()).optional(),
  publish_date: z.string().optional(),
  physical_format: z.string().optional(),
  number_of_pages: z.number().int().optional(),
  isbn_10: z.array(z.string()).optional(),
  isbn_13: z.array(z.string()).optional(),
  languages: z.array(z.object({ key: z.string() })).optional(),
  covers: z.array(z.number().int()).optional(),
  series: z.array(z.string()).optional(),
})
type EditionRecord = z.infer<typeof editionRecordSchema>

/** The part of an editions response the adapter reads. */
export const editionsResponseSchema = z.object({ entries: z.array(z.unknown()) })

const positive = (values: number[] | undefined) => values?.find((id) => id > 0)

function toEdition(record: EditionRecord): BookCandidateEdition | { error: string } {
  const isbn13 = [...(record.isbn_13 ?? []), ...(record.isbn_10 ?? [])]
    .map((isbn) => toIsbn13(isbn))
    .find((isbn) => isbn !== null)
  const languageKey = record.languages?.[0]?.key.replace('/languages/', '')
  const coverId = positive(record.covers)
  const parsed = bookCandidateEditionSchema.safeParse({
    isbn13: isbn13 ?? null,
    format: toFormat(record.physical_format),
    language: languageKey ? toLanguage(languageKey) : null,
    title: record.title?.trim() || null,
    publisherName: record.publishers?.[0]?.trim() || null,
    publishedDate: toIsoDate(record.publish_date),
    pageCount: record.number_of_pages && record.number_of_pages > 0 ? record.number_of_pages : null,
    cover: coverId ? toCover(coverId) : null,
    sourceLink: {
      source: SOURCE_NAME,
      entityType: 'edition',
      sourceId: record.key.replace('/books/', ''),
    },
  })
  return parsed.success ? parsed.data : { error: z.prettifyError(parsed.error) }
}

/** Translates an editions response; an Edition that does not parse or validate is reported and skipped. */
export function toEditions(
  entries: unknown[],
  onInvalid: (reason: string) => void,
): { editions: BookCandidateEdition[]; series: string[] } {
  const editions: BookCandidateEdition[] = []
  const series: string[] = []
  for (const entry of entries) {
    const record = editionRecordSchema.safeParse(entry)
    if (!record.success) {
      onInvalid(z.prettifyError(record.error))
      continue
    }
    const edition = toEdition(record.data)
    if ('error' in edition) onInvalid(edition.error)
    else editions.push(edition)
    series.push(...(record.data.series ?? []))
  }
  return { editions, series }
}

/**
 * Open Library holds Series only as free text on Editions, mixed with publishers' imprints
 * (`Oscar Moderni Cult`). A Series is recognized only when the text carries a position, as in
 * `Hainish Cycle, #4`, `Discworld ; 12`, or `Earthsea (book 2)`. The most common name wins.
 */
export function toSeries(texts: string[]): { name: string; position: number | null }[] {
  const counts = new Map<string, { name: string; position: number | null; count: number }>()
  for (const text of texts) {
    const match =
      /^(.+?)\s*(?:,\s*|;\s*|\(\s*)?(?:#|no\.?\s*|book\s+|vol\.?\s*|v\.\s*|;\s*)(\d+(?:\.\d+)?)\)?\s*$/i.exec(
        text.trim(),
      )
    const name = match?.[1]?.replace(/[\s,;(]+$/, '').trim()
    if (!name || !match?.[2]) continue
    const key = name.toLowerCase()
    const entry = counts.get(key) ?? { name, position: Number(match[2]), count: 0 }
    entry.count += 1
    counts.set(key, entry)
  }
  const best = [...counts.values()].sort((a, b) => b.count - a.count)[0]
  return best ? [{ name: best.name, position: best.position }] : []
}

/** Subject labels worth keeping: no machine tags (`award:hugo_award=1970`), no duplicates, capped. */
export function toSubjects(labels: string[] | undefined): { label: string }[] {
  const seen = new Set<string>()
  const subjects: { label: string }[] = []
  for (const raw of labels ?? []) {
    const label = raw.trim()
    if (!label || label.length > 80 || /^[a-z_]+:/.test(label)) continue
    if (seen.has(label.toLowerCase())) continue
    seen.add(label.toLowerCase())
    subjects.push({ label })
    if (subjects.length === MAX_SUBJECTS) break
  }
  return subjects
}

/**
 * Builds the full Book candidate from a work record, the search result that names its byline, and its
 * Editions. Returns `{ error }` when the result does not validate.
 */
export function toFullBook(
  work: Work,
  bylineDoc: unknown,
  editions: BookCandidateEdition[],
  seriesTexts: string[],
): BookCandidate | { error: string } {
  const base = toBookCandidate(bylineDoc, '', true)
  if ('error' in base) return base
  const coverId = positive(work.covers)
  const description = work.description?.trim()
  return {
    ...base,
    book: {
      ...base.book,
      title: work.title.trim() || base.book.title,
      subtitle: work.subtitle?.trim() || base.book.subtitle,
      description: description || null,
      cover: coverId ? toCover(coverId) : base.book.cover,
      series: toSeries(seriesTexts),
      subjects: toSubjects(work.subjects),
    },
    // With no usable Edition on record, the search result's placeholder Edition keeps the Book valid.
    editions: editions.length > 0 ? editions : base.editions,
  }
}

const authorDocSchema = z.object({
  key: z.string().regex(/^\/authors\/OL\d+A$/),
  name: z.string().optional(),
  personal_name: z.string().optional(),
  alternate_names: z.array(z.string()).optional(),
  bio: textOrValue.optional(),
  birth_date: z.string().optional(),
  death_date: z.string().optional(),
  photos: z.array(z.number().int()).optional(),
})

/** Translates an author record, or returns `{ error }` when it does not parse or has no name. */
export function toAuthorRecord(raw: unknown): AuthorRecord | { error: string } {
  const parsed = authorDocSchema.safeParse(raw)
  if (!parsed.success) return { error: z.prettifyError(parsed.error) }
  const doc = parsed.data
  const name = (doc.name ?? doc.personal_name ?? '').trim()
  if (!name) return { error: 'The author record has no name' }
  const alternateNames = [
    ...new Set((doc.alternate_names ?? []).map((n) => n.trim()).filter((n) => n && n !== name)),
  ].slice(0, MAX_ALTERNATE_NAMES)
  const photoId = positive(doc.photos)
  return {
    name,
    alternateNames,
    bio: doc.bio?.trim() || null,
    birthDate: toIsoDate(doc.birth_date),
    deathDate: toIsoDate(doc.death_date),
    photo: photoId ? toCover(photoId) : null,
    sourceLink: {
      source: SOURCE_NAME,
      entityType: 'author',
      sourceId: doc.key.replace('/authors/', ''),
    },
  }
}
