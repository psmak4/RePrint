import { describe, expect, it } from 'vitest'
import type { Contribution } from './catalog.js'
import { groupContributors } from './contributors.js'

const person = (slug: string) => ({
  id: `0192a3b4-0000-7000-8000-0000000000${slug.length}0`,
  slug,
  name: slug,
})
const credit = (
  slug: string,
  role: Contribution['role'],
  position: number | null,
): Contribution => ({
  author: person(slug),
  role,
  position,
})

describe('groupContributors', () => {
  it('lists authors first, a co-author as an author, by position with unknown positions last', () => {
    const groups = groupContributors([
      credit('translator-a', 'translator', 0),
      credit('late', 'author', null),
      credit('second', 'co_author', 2),
      credit('first', 'author', 1),
    ])
    expect(groups).toEqual([
      {
        role: 'author',
        people: [
          { slug: 'first', name: 'first' },
          { slug: 'second', name: 'second' },
          { slug: 'late', name: 'late' },
        ],
      },
      { role: 'translator', people: [{ slug: 'translator-a', name: 'translator-a' }] },
    ])
  })

  it('names a person once per group', () => {
    const groups = groupContributors([credit('ada', 'author', 0), credit('ada', 'co_author', 1)])
    expect(groups).toEqual([{ role: 'author', people: [{ slug: 'ada', name: 'ada' }] }])
  })
})
