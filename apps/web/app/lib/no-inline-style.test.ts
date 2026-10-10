import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// `style-src 'self'` (PRD §11) blocks inline style attributes, and CI's e2e database is empty, so
// a `style={…}` prop would only fail against real data. Catch it here instead.
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return path.endsWith('.tsx') && !path.endsWith('.test.tsx') ? [path] : []
  })
}

describe('CSP-safe styling', () => {
  it('no component sets a style attribute', () => {
    const root = join(import.meta.dirname, '..')
    const offenders = sourceFiles(root).filter((file) =>
      /\bstyle=\{/.test(readFileSync(file, 'utf8')),
    )
    expect(offenders).toEqual([])
  })
})
