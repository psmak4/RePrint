import { describe, expect, it } from 'vitest'
import { seriesMembersPath, seriesOfDoc, toPosition } from './series.js'

describe('toPosition', () => {
  it('keeps whole and decimal numbers and drops everything else', () => {
    expect(toPosition('1')).toBe(1)
    expect(toPosition(' 2.5 ')).toBe(2.5)
    expect(toPosition('1-3')).toBeNull()
    expect(toPosition('Book 2')).toBeNull()
    expect(toPosition('')).toBeNull()
    expect(toPosition('-1')).toBeNull()
    expect(toPosition(undefined)).toBeNull()
  })
})

describe('seriesOfDoc', () => {
  it('pairs each Series key with its name and position', () => {
    expect(
      seriesOfDoc({
        series_key: ['OL326782L', 'OL1L'],
        series_name: ["The Hitchhiker's Guide to the Galaxy", 'Other'],
        series_position: ['1', 'x'],
      }),
    ).toEqual([
      {
        name: "The Hitchhiker's Guide to the Galaxy",
        position: 1,
        sourceLink: { source: 'open_library', entityType: 'series', sourceId: 'OL326782L' },
      },
      {
        name: 'Other',
        position: null,
        sourceLink: { source: 'open_library', entityType: 'series', sourceId: 'OL1L' },
      },
    ])
  })

  it('skips keys without a name or with a malformed key, and handles missing arrays', () => {
    expect(seriesOfDoc({ series_key: ['OL1L', 'bad'], series_name: ['', 'Name'] })).toEqual([])
    expect(seriesOfDoc({})).toEqual([])
  })
})

describe('seriesMembersPath', () => {
  it('searches by Series key, 100 a page', () => {
    expect(seriesMembersPath('OL326782L', 1)).toBe(
      '/search.json?q=series_key%3AOL326782L&limit=100',
    )
    expect(seriesMembersPath('OL326782L', 2)).toBe(
      '/search.json?q=series_key%3AOL326782L&limit=100&page=2',
    )
  })
})
