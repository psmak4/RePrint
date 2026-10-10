import { describe, expect, it } from 'vitest'
import { matchAuthor } from './author-match.js'

const ID = '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b'
const authors = [
  { id: ID, slug: 'frank-herbert', name: 'Frank Herbert' },
  { id: ID, slug: 'brian-herbert', name: 'Brian Herbert' },
]

describe('matchAuthor', () => {
  it('matches when every query word is in the name, ignoring case and accents', () => {
    expect(matchAuthor('FRANK herbert', authors)?.slug).toBe('frank-herbert')
    expect(matchAuthor('herbert', authors)?.slug).toBe('frank-herbert')
    expect(matchAuthor('Fränk Herbert', authors)?.slug).toBe('frank-herbert')
  })

  it('does not match a title that only shares a word, or a very short query', () => {
    expect(matchAuthor('herbert dune', authors)).toBeNull()
    expect(matchAuthor('fra', authors)).toBeNull()
    expect(matchAuthor('', authors)).toBeNull()
  })
})
