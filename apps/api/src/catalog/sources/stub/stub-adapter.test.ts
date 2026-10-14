import { describe, expect, it } from 'vitest'
import { runSourceContract } from '../../../testing/source-contract.js'
import { createStubSource } from './stub-adapter.js'

runSourceContract(createStubSource(), {
  searches: ['dune', 'herbert', '9780547928227'],
  emptySearch: 'no such book anywhere',
  bookIds: ['stub-book-dune', 'stub-book-hobbit'],
  authorIds: ['stub-author-herbert', 'stub-author-tolkien'],
  unknownId: 'stub-missing',
})

describe('stub Source', () => {
  it('pages results', async () => {
    const stub = createStubSource()
    const first = await stub.searchBooks('e', 1)
    expect(first.candidates.length).toBeGreaterThan(0)
    const beyond = await stub.searchBooks('e', 9)
    expect(beyond.candidates).toEqual([])
  })

  it("lists Tolkien's works, The Silmarillion among them, and nothing for others", async () => {
    const stub = createStubSource()
    expect((await stub.getAuthorBooks?.('stub-author-tolkien'))?.map((w) => w.sourceId)).toEqual([
      'stub-book-hobbit',
      'stub-book-fellowship',
      'stub-book-silmarillion',
    ])
    expect((await stub.getBook('stub-book-silmarillion'))?.book.title).toBe('The Silmarillion')
    expect(await stub.getAuthorBooks?.('stub-author-herbert')).toEqual([])
  })

  it('rates The Hobbit and answers ratings for its Books (D-204)', async () => {
    const stub = createStubSource()
    expect((await stub.getBook('stub-book-hobbit'))?.book.sourceRating?.count).toBe(500)
    const ratings = await stub.getBookRatings?.(['stub-book-hobbit', 'stub-book-dune', 'nope'])
    expect(ratings?.get('stub-book-hobbit')?.average).toBe(4.29)
    expect(ratings?.get('stub-book-dune')).toBeNull()
    expect(ratings?.has('nope')).toBe(false)
  })

  it('does not match a blank query', async () => {
    expect((await createStubSource().searchBooks('  ', 1)).candidates).toEqual([])
  })

  it('lists its one Series, and the Hobbit names it', async () => {
    const stub = createStubSource()
    const hobbit = await stub.getBook('stub-book-hobbit')
    expect(hobbit?.book.series).toEqual([
      {
        name: 'Middle-earth',
        position: 1,
        sourceLink: { source: 'stub', entityType: 'series', sourceId: 'stub-series-middle-earth' },
      },
    ])
    expect(await stub.getSeriesMembers?.('stub-series-middle-earth')).toEqual({
      name: 'Middle-earth',
      members: [
        { sourceId: 'stub-book-hobbit', position: 1, title: 'The Hobbit' },
        { sourceId: 'stub-book-fellowship', position: 2, title: 'The Fellowship of the Ring' },
      ],
    })
    expect(await stub.getBook('stub-book-fellowship')).not.toBeNull()
    expect(await stub.getSeriesMembers?.('nope')).toBeNull()
  })
})
