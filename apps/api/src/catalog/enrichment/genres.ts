export interface GenreRule {
  /** A case-insensitive word or phrase in a Subject label; a plural (`s`, `es`) also matches. */
  pattern: string
  genreId: string
  priority: number
}

/** A rule at or above this priority is specific enough that one Subject is evidence on its own. */
export const STRONG_PRIORITY = 50
/** How many Subjects must support a Genre when none of its matches is strong. */
const WEAK_SUPPORT = 2

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The pattern with its plural: `travel(s)`, `mystery`/`mysteries`, `class(es)`. */
function withPlural(pattern: string): string {
  return /[^aeiou]y$/i.test(pattern)
    ? `${escapeRegExp(pattern.slice(0, -1))}(?:y|ies)`
    : `${escapeRegExp(pattern)}(?:e?s)?`
}

/** The pattern as whole words: `art` matches "Art" and "Arts" but not "Arthur" or "earth". */
function wordMatcher(pattern: string): RegExp {
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${withPlural(pattern)}(?=$|[^\\p{L}\\p{N}])`, 'iu')
}

function bestRule(
  label: string,
  rules: readonly { rule: GenreRule; matcher: RegExp }[],
): GenreRule | undefined {
  let best: GenreRule | undefined
  for (const { rule, matcher } of rules) {
    if (!matcher.test(label)) continue
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

/** A Subject that is the pattern and nothing else ("Travel" for `travel`) is strong evidence. */
function isWholeLabel(label: string, pattern: string): boolean {
  return new RegExp(`^${withPlural(pattern)}$`, 'iu').test(label.trim())
}

/**
 * Maps Subject labels to Genre IDs (PRD §5.4, D-190). Each Subject goes to the Genre of its best
 * matching rule, matched as whole words. A Genre is kept when one of its matches is strong (a
 * high-priority rule, or a Subject that is exactly the pattern) or when at least two Subjects
 * support it, so one stray Subject ("Radio plays" on a novel) cannot add a Genre by itself. The
 * result has no repeats, in Subject order.
 */
export function mapSubjectsToGenres(
  labels: readonly string[],
  rules: readonly GenreRule[],
): string[] {
  const compiled = rules
    .filter((rule) => rule.pattern.trim() !== '')
    .map((rule) => ({ rule, matcher: wordMatcher(rule.pattern.trim()) }))
  const support = new Map<string, { strong: boolean; subjects: number }>()
  for (const label of labels) {
    const rule = bestRule(label, compiled)
    if (!rule) continue
    const strong = rule.priority >= STRONG_PRIORITY || isWholeLabel(label, rule.pattern.trim())
    const entry = support.get(rule.genreId) ?? { strong: false, subjects: 0 }
    entry.strong ||= strong
    entry.subjects += 1
    support.set(rule.genreId, entry)
  }
  return [...support.entries()]
    .filter(([, entry]) => entry.strong || entry.subjects >= WEAK_SUPPORT)
    .map(([genreId]) => genreId)
}
