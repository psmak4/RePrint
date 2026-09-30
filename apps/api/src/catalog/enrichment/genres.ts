export interface GenreRule {
  /** A case-insensitive substring of a Subject label. */
  pattern: string
  genreId: string
  priority: number
}

function bestRule(label: string, rules: readonly GenreRule[]): GenreRule | undefined {
  const text = label.toLowerCase()
  let best: GenreRule | undefined
  for (const rule of rules) {
    const pattern = rule.pattern.trim().toLowerCase()
    if (pattern === '' || !text.includes(pattern)) continue
    if (!best || outranks(rule, best)) best = rule
  }
  return best
}

/** Higher priority wins, then the longer (more specific) pattern, then a stable order. */
function outranks(a: GenreRule, b: GenreRule): boolean {
  if (a.priority !== b.priority) return a.priority > b.priority
  if (a.pattern.length !== b.pattern.length) return a.pattern.length > b.pattern.length
  return `${a.pattern}:${a.genreId}` < `${b.pattern}:${b.genreId}`
}

/**
 * Maps Subject labels to Genre IDs (PRD §5.4). Each Subject goes to the Genre of its best matching
 * rule; a Subject that matches nothing maps to nothing. The result has no repeats, in Subject order.
 */
export function mapSubjectsToGenres(
  labels: readonly string[],
  rules: readonly GenreRule[],
): string[] {
  const genreIds: string[] = []
  for (const label of labels) {
    const rule = bestRule(label, rules)
    if (rule && !genreIds.includes(rule.genreId)) genreIds.push(rule.genreId)
  }
  return genreIds
}
