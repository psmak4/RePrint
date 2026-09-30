import { describe, expect, it } from 'vitest'
import { makeSlug, SLUG_BASE_MAX_LENGTH } from './slug.js'

const id = '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b'

describe('makeSlug', () => {
  it('lowercases the title, joins words with hyphens, and adds 6 hex characters of the ID', () => {
    expect(makeSlug('The Left Hand of Darkness', id)).toBe('the-left-hand-of-darkness-4f5a6b')
  })

  it('removes accents', () => {
    expect(makeSlug('Cien años de soledad', id)).toBe('cien-anos-de-soledad-4f5a6b')
    expect(makeSlug('Éloge de la Fuite', id)).toBe('eloge-de-la-fuite-4f5a6b')
  })

  it('drops apostrophes and collapses punctuation', () => {
    expect(makeSlug("Ender's Game: (Special) Edition!", id)).toBe(
      'enders-game-special-edition-4f5a6b',
    )
  })

  it('shortens a long title at a word boundary', () => {
    const slug = makeSlug('word '.repeat(40), id)
    expect(slug.length).toBeLessThanOrEqual(SLUG_BASE_MAX_LENGTH + 7)
    expect(slug).toMatch(/^(word-)+word-4f5a6b$/)
  })

  it('cuts a single very long word', () => {
    expect(makeSlug('a'.repeat(200), id)).toBe(`${'a'.repeat(SLUG_BASE_MAX_LENGTH)}-4f5a6b`)
  })

  it('falls back when nothing survives', () => {
    expect(makeSlug('吾輩は猫である', id)).toBe('untitled-4f5a6b')
    expect(makeSlug('', id)).toBe('untitled-4f5a6b')
  })

  it('gives different suffixes to IDs created in the same hours', () => {
    const other = '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6c'
    expect(makeSlug('Dune', id)).not.toBe(makeSlug('Dune', other))
  })
})
