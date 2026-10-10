import { describe, expect, it } from 'vitest'
import { toAuthorRecord, toEditions, toFormat, toIsoDate, toSeries, toSubjects } from './record.js'

describe('toIsoDate', () => {
  it.each([
    ['1974-01-01', '1974-01-01'],
    ['Aug 27, 2003', '2003-08-27'],
    ['March 1, 2000', '2000-03-01'],
    ['20 Sep 2018', '2018-09-20'],
    ['21 October 1929', '1929-10-21'],
    ['1969', null],
    ['1969-03', null],
    ['21/06/2006', null],
    ['Feb 30, 2001', null],
    ['circa 1900', null],
    ['', null],
    [undefined, null],
  ])('reads %s as %s', (input, expected) => {
    expect(toIsoDate(input)).toBe(expected)
  })
})

describe('toFormat', () => {
  it.each([
    ['Paperback', 'paperback'],
    ['mass market paperback', 'paperback'],
    ['Brossura', 'paperback'],
    ['hardcover', 'hardcover'],
    ['Library Binding', 'hardcover'],
    ['Ebook', 'ebook'],
    ['E-book', 'ebook'],
    ['Audio Cassette', 'audiobook'],
    ['Audio CD', 'audiobook'],
    ['Loose leaf', 'unknown'],
    [undefined, 'unknown'],
  ])('maps %s to %s', (input, expected) => {
    expect(toFormat(input)).toBe(expected)
  })
})

describe('toEditions', () => {
  const skipped: string[] = []
  const run = (entries: unknown[]) => {
    skipped.length = 0
    return toEditions(entries, (reason) => skipped.push(reason))
  }

  it('converts an ISBN-10-only Edition to ISBN-13', () => {
    const { editions } = run([
      { key: '/books/OL1M', isbn_10: ['0441478123'], physical_format: 'Paperback' },
    ])
    expect(editions[0]?.isbn13).toBe('9780441478125')
    expect(editions[0]?.format).toBe('paperback')
  })

  it('reads an ISBN-10 that was filed under isbn_13', () => {
    const { editions } = run([{ key: '/books/OL1M', isbn_13: ['0441478123'] }])
    expect(editions[0]?.isbn13).toBe('9780441478125')
  })

  it('keeps an Edition with a missing format, language, and ISBN', () => {
    const { editions } = run([{ key: '/books/OL2M', title: 'Untitled' }])
    expect(editions[0]).toMatchObject({
      isbn13: null,
      format: 'unknown',
      language: null,
      cover: null,
      sourceLink: { entityType: 'edition', sourceId: 'OL2M' },
    })
  })

  it('maps a non-English Edition to ISO 639, and its cover ID to a Cover', () => {
    const { editions } = run([
      { key: '/books/OL3M', languages: [{ key: '/languages/ger' }], covers: [-1, 11408788] },
    ])
    expect(editions[0]?.language).toBe('de')
    expect(editions[0]?.cover).toMatchObject({ origin: 'open_library', originRef: '11408788' })
  })

  it('logs and skips Editions that do not parse, and returns the rest', () => {
    const { editions } = run([{ key: 'bad' }, { key: '/books/OL4M' }, 'nope'])
    expect(editions).toHaveLength(1)
    expect(skipped).toHaveLength(2)
  })
})

describe('toSeries', () => {
  const one = (...texts: string[]) => texts.map((text) => ({ text, publisher: 'Ace' }))

  it('finds a Series only where the text carries a position', () => {
    expect(toSeries(one('Hainish Cycle, #4'))).toEqual([{ name: 'Hainish Cycle', position: 4 }])
    expect(toSeries(one('Discworld ; 12.5'))).toEqual([{ name: 'Discworld', position: 12.5 }])
    expect(toSeries(one('Earthsea (book 2)'))).toEqual([{ name: 'Earthsea', position: 2 }])
    expect(toSeries(one("Hitchhiker's trilogy -- bk. 1."))).toEqual([
      { name: "Hitchhiker's trilogy", position: 1 },
    ])
    expect(toSeries(one('Oscar Moderni Cult', 'Serie Ursula K. Le Guin'))).toEqual([])
  })

  it('takes the most common name', () => {
    expect(toSeries(one('A, #1', 'B, #2', 'B, #2'))).toEqual([{ name: 'B', position: 2 }])
  })

  it("ignores a publisher's numbered line when Editions come from several publishers", () => {
    const texts = [
      { text: 'Compactos No. 454', publisher: 'Anagrama' },
      { text: 'Compactos No. 454', publisher: 'Anagrama' },
      { text: "Hitchhiker's Trilogy, #1", publisher: 'Pan Books' },
      { text: "The Hitchhiker's trilogy -- bk. 1.", publisher: 'Del Rey' },
    ]
    expect(toSeries(texts)).toEqual([{ name: "Hitchhiker's Trilogy", position: 1 }])
    // From one publisher only: a long-running number or the publisher's own name gives it away.
    expect(toSeries(texts.slice(0, 2))).toEqual([])
    expect(toSeries([{ text: 'Compactos Anagrama No. 4', publisher: 'Anagrama' }])).toEqual([])
    // A small position from one publisher is still a Series (Hainish Cycle on a Heyne Edition).
    expect(toSeries([{ text: 'Hainish Cycle, #4', publisher: 'Heyne' }])).toEqual([
      { name: 'Hainish Cycle', position: 4 },
    ])
  })
})

describe('toSubjects', () => {
  it('drops machine tags and duplicates', () => {
    expect(toSubjects(['Fiction', 'award:hugo_award=1970', 'fiction', ' Ethnologists '])).toEqual([
      { label: 'Fiction' },
      { label: 'Ethnologists' },
    ])
  })
})

describe('toAuthorRecord', () => {
  it('rejects a record with no name', () => {
    expect(toAuthorRecord({ key: '/authors/OL1A' })).toHaveProperty('error')
  })

  it('takes a bio given as an object, and drops a bare-year birth date', () => {
    const author = toAuthorRecord({
      key: '/authors/OL1A',
      name: 'A',
      bio: { type: '/type/text', value: ' Hello ' },
      birth_date: '1929',
      photos: [-1],
    })
    expect(author).toMatchObject({ bio: 'Hello', birthDate: null, photo: null })
  })
})
