import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// User-facing strings live in app/copy (PRD §3). Shell components must not inline them.
const dir = import.meta.dirname
const files = readdirSync(dir).filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx'))

describe('shell copy guard', () => {
  it('finds the shell components', () => {
    expect(files.length).toBeGreaterThanOrEqual(3)
  })

  it.each(files)('%s has no inline user-facing strings', (file) => {
    const src = readFileSync(join(dir, file), 'utf8')
    const jsxText = [...src.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)].map((m) => m[1]?.trim())
    const attrs = [...src.matchAll(/\b(?:aria-label|alt|title|placeholder)="([^"]+)"/g)].map(
      (m) => m[1],
    )
    expect(jsxText.filter((t) => t && !/^=?>?$/.test(t))).toEqual([])
    expect(attrs).toEqual([])
  })
})
