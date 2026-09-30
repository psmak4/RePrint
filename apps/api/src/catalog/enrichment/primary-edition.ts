export interface RankableEdition {
  id: string
  language: string | null
  coverId: string | null
  isbn13: string | null
  /** `YYYY-MM-DD`, or null when unknown. */
  publishedDate: string | null
}

function compare(a: RankableEdition, b: RankableEdition): number {
  const score = (edition: RankableEdition) =>
    [edition.language === 'en', edition.coverId !== null, edition.isbn13 !== null].map(Number)
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
 * Editions best first (PRD §5.1): English, then has a cover, then has an ISBN, then most recent. The
 * criteria apply in that order; the Edition ID breaks a full tie so the choice is stable.
 */
export function rankEditions<T extends RankableEdition>(list: readonly T[]): T[] {
  return [...list].sort(compare)
}

/** The Edition that represents the Book by default, or null when it has none. */
export function choosePrimaryEdition(list: readonly RankableEdition[]): string | null {
  return rankEditions(list)[0]?.id ?? null
}
