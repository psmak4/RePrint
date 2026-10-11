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
