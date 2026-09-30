import type { Contribution, ContributionRole } from '@reprint/shared'

/** The byline groups shown on a Book page, in display order. A co-author reads as an author. */
const GROUPS = ['author', 'translator', 'illustrator', 'editor', 'narrator', 'other'] as const
export type ByRole = (typeof GROUPS)[number]

export type ContributorGroup = {
  role: ByRole
  people: { slug: string; name: string }[]
}

function groupOf(role: ContributionRole): ByRole {
  return role === 'co_author' ? 'author' : role
}

/** Groups contributions by role, keeping the Book's own order within a group (`position`, then given order). */
export function groupContributors(contributions: Contribution[]): ContributorGroup[] {
  const ordered = contributions
    .map((contribution, index) => ({ contribution, index }))
    .sort(
      (a, b) =>
        (a.contribution.position ?? Number.MAX_SAFE_INTEGER) -
          (b.contribution.position ?? Number.MAX_SAFE_INTEGER) || a.index - b.index,
    )
  return GROUPS.flatMap((role) => {
    const people: ContributorGroup['people'] = []
    for (const { contribution } of ordered) {
      if (groupOf(contribution.role) !== role) continue
      if (people.some((p) => p.slug === contribution.author.slug)) continue
      people.push({ slug: contribution.author.slug, name: contribution.author.name })
    }
    return people.length > 0 ? [{ role, people }] : []
  })
}
