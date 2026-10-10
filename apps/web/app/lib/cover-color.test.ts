import { describe, expect, it } from 'vitest'
import { GENERATED_COVER_COLORS, generatedCoverColor } from './cover-color.js'

describe('generatedCoverColor', () => {
  it('gives the same slug the same colour every time', () => {
    expect(generatedCoverColor('dune')).toBe(generatedCoverColor('dune'))
  })

  it('always picks a colour from the list', () => {
    for (const slug of ['dune', 'emma', 'the-left-hand-of-darkness', '', 'x'.repeat(200)]) {
      expect(GENERATED_COVER_COLORS).toContain(generatedCoverColor(slug))
    }
  })

  it('spreads different slugs over several colours', () => {
    const colors = new Set(Array.from({ length: 60 }, (_, i) => generatedCoverColor(`book-${i}`)))
    expect(colors.size).toBeGreaterThan(6)
  })
})
