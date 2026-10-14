import { describe, expect, it } from 'vitest'
import { links } from './root.js'

describe('root links', () => {
  it('preloads the two fonts and opens the cover host connection early (M10-T12)', () => {
    const all = links() as { rel?: string; href?: string }[]
    expect(all.filter((link) => link.rel === 'preload')).toHaveLength(2)
    expect(all).toContainEqual({ rel: 'preconnect', href: 'https://covers.openlibrary.org' })
  })
})
