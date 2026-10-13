import { describe, expect, it } from 'vitest'
import { markdownToText } from './markdown.js'

describe('markdownToText', () => {
  it('keeps the text of inline and reference links and drops their definitions', () => {
    expect(
      markdownToText(
        'An Irish author ([source][1]). See [his site](https://example.org "Home") and [more][].\n\n[1]: https://en.wikipedia.org/wiki/Eoin_Colfer\n[more]: https://example.org/more',
      ),
    ).toBe('An Irish author (source). See his site and more.')
  })

  it('drops emphasis, headings, list and quote markers, code ticks, and images', () => {
    expect(
      markdownToText(
        '# Title\n\nA *very* **bold** _claim_ and __another__ with `code`.\n\n- one\n* two\n1. three\n\n> quoted\n\n![a cover](https://example.org/c.jpg)',
      ),
    ).toBe(
      'Title\n\nA very bold claim and another with code.\n\none\ntwo\nthree\n\nquoted\n\na cover',
    )
  })

  it('keeps underscores and asterisks inside words, and unescapes escaped characters', () => {
    expect(markdownToText('snake_case_name and 2*3*4 cost \\*5\\*')).toBe(
      'snake_case_name and 2*3*4 cost *5*',
    )
  })

  it('drops raw HTML tags but keeps their text', () => {
    expect(markdownToText('Hello <b>there</b><br/>friend')).toBe('Hello therefriend')
  })

  it('drops thematic breaks and extra blank lines', () => {
    expect(markdownToText('One.\n\n---\n\n\n\nTwo.')).toBe('One.\n\nTwo.')
  })
})
