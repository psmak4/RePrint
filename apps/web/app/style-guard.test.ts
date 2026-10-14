import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The style guard (M11, D-214): pages take colours from the theme tokens in `@reprint/ui/theme.css`,
// so the same role has the same colour everywhere.
const REPO = fileURLToPath(new URL('../../../', import.meta.url))
const ROOTS = ['apps/web/app', 'packages/ui/src']

/** The decorative palettes, which are data rather than roles (DESIGN.md: generated covers, avatars). */
const PALETTES = new Set(['apps/web/app/lib/cover-color.ts', 'apps/web/app/lib/avatar.ts'])

function sourceFiles(): Array<{ file: string; text: string }> {
  const files: Array<{ file: string; text: string }> = []
  for (const root of ROOTS) {
    for (const entry of readdirSync(join(REPO, root), { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name))
        continue
      const path = join(entry.parentPath, entry.name)
      files.push({ file: relative(REPO, path), text: readFileSync(path, 'utf8') })
    }
  }
  return files
}

function findAll(pattern: RegExp, files: Array<{ file: string; text: string }>): string[] {
  return files.flatMap(({ file, text }) =>
    [...text.matchAll(pattern)].map((match) => {
      const line = text.slice(0, match.index).split('\n').length
      return `${file}:${line} ${match[0]}`
    }),
  )
}

/** Every string literal's classes, with where it starts, for the rules that look at class lists. */
function classLists(files: Array<{ file: string; text: string }>) {
  return files.flatMap(({ file, text }) =>
    // Quoted strings stay on one line, so an apostrophe in a comment cannot start one.
    [...text.matchAll(/"[^"\n]*"|'[^'\n]*'|`[^`]*`/g)].map((match) => ({
      where: `${file}:${text.slice(0, match.index).split('\n').length}`,
      classes: match[0].slice(1, -1).split(/\s+/),
    })),
  )
}

describe('style guard', () => {
  const files = sourceFiles()

  it('reads the web app and the UI package', () => {
    expect(files.length).toBeGreaterThan(100)
    expect(files.some(({ file }) => file === 'packages/ui/src/components/button.tsx')).toBe(true)
  })

  it('uses theme colours, not raw hex values, outside the decorative palettes', () => {
    const outsidePalettes = files.filter(({ file }) => !PALETTES.has(file))
    expect(findAll(/[a-z]+-\[#[0-9a-fA-F]{3,8}\]/g, outsidePalettes)).toEqual([])
  })

  it('draws pill actions only through Button or buttonVariants (D-214)', () => {
    // A hand-built pill: fully rounded, with a button's hover fill or outline edge. Fields that
    // happen to be pill-shaped (the header search box, Discover's hero field) style their own
    // container with `focus-within:` and are not buttons.
    const pill =
      /^(hover:bg-surface-raised|hover:bg-accent-hover|hover:bg-surface|border-input-border)$/
    const handBuilt = classLists(files.filter(({ file }) => !file.startsWith('packages/ui/')))
      .filter(
        ({ classes }) =>
          classes.includes('rounded-full') &&
          classes.some((name) => pill.test(name)) &&
          !classes.some((name) => name.startsWith('focus-within:')),
      )
      .map(({ where }) => where)
    expect(handBuilt).toEqual([])
  })
})
