export interface RankableEdition {
  id: string
  language: string | null
  coverId: string | null
  isbn13: string | null
  /** `YYYY-MM-DD`, or null when unknown. */
  publishedDate: string | null
  /** Which image the cover is (`origin:ref`), to compare with the Book's own cover. */
  coverRef?: string | null
}

function comparer(bookCoverRef: string | null) {
  return (a: RankableEdition, b: RankableEdition) => compare(a, b, bookCoverRef)
}

function compare(a: RankableEdition, b: RankableEdition, bookCoverRef: string | null): number {
  const score = (edition: RankableEdition) =>
    [
      bookCoverRef !== null && edition.coverRef === bookCoverRef,
      edition.language === 'en',
      edition.coverId !== null,
      edition.isbn13 !== null,
    ].map(Number)
  const scoreA = score(a)
  const scoreB = score(b)
  for (let i = 0; i < scoreA.length; i += 1) {
    const diff = (scoreB[i] ?? 0) - (scoreA[i] ?? 0)
    if (diff !== 0) return diff
  }
  if (a.publishedDate !== b.publishedDate) {
    if (a.publishedDate === null) return 1
    if (b.publishedDate === null) return -1
    return a.publishedDate < b.publishedDate ? 1 : -1
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Editions best first: the one whose cover is the Book's own cover (the Source's representative
 * Edition, D-191), then PRD §5.1's order: English, has a cover, has an ISBN, most recent. The
 * criteria apply in that order; the Edition ID breaks a full tie so the choice is stable.
 */
export function rankEditions<T extends RankableEdition>(
  list: readonly T[],
  bookCoverRef: string | null = null,
): T[] {
  return [...list].sort(comparer(bookCoverRef))
}

/**
 * The Edition that represents the Book by default, or null when it has none. Matching the Book's
 * cover first keeps the header's cover and its Edition details from describing different printings.
 */
export function choosePrimaryEdition(
  list: readonly RankableEdition[],
  bookCoverRef: string | null = null,
): string | null {
  return rankEditions(list, bookCoverRef)[0]?.id ?? null
}
