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
})
