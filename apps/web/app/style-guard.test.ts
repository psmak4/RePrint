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

  it('takes serif page and section headings from textStyles (D-214)', () => {
    // The display headings with their own scale: Discover's hero, the Book header, the auth card.
    const ownScale = new Set([
      'apps/web/app/components/books/discover-page.tsx:h1',
      'apps/web/app/components/books/book-page.tsx:h1',
      'apps/web/app/components/auth/auth-card.tsx:h1',
    ])
    const sized = files.flatMap(({ file, text }) =>
      [...text.matchAll(/<(h1|h2)\b[^>]*className="([^"]*)"/g)]
        .filter((match) => (match[2] ?? '').split(/\s+/).includes('font-serif'))
        .filter((match) => !ownScale.has(`${file}:${match[1]}`))
        .map((match) => `${file}:${text.slice(0, match.index).split('\n').length} ${match[1]}`),
    )
    expect(sized).toEqual([])
  })

  it('sorts only through SortControl and pages only through Pager (D-214)', () => {
    const elsewhere = (own: string) =>
      files.filter(({ file }) => file !== `apps/web/app/components/common/${own}`)
    expect(findAll(/<Select\b[^>]*name="sort"/g, elsewhere('sort-control.tsx'))).toEqual([])
    expect(findAll(/rel="(prev|next)"/g, elsewhere('pager.tsx'))).toEqual([])
  })

  it('draws dashed boxes only through EmptyState (D-214)', () => {
    // The dashed cover ("not on RePrint yet") and the spoiler box are their own elements.
    const own = new Set([
      'apps/web/app/components/common/empty-state.tsx',
      'apps/web/app/components/books/cover.tsx',
      'apps/web/app/components/reviews/spoiler-toggle.tsx',
    ])
    const dashed = classLists(files.filter(({ file }) => !own.has(file)))
      .filter(({ classes }) => classes.includes('border-dashed'))
      .map(({ where }) => where)
    expect(dashed).toEqual([])
  })

  it('draws status and count badges only through Badge and CountBadge (D-214)', () => {
    // A hand-built badge: fully rounded, 12 px text, and a fill.
    const handBuilt = classLists(files.filter(({ file }) => !file.startsWith('packages/ui/')))
      .filter(
        ({ classes }) =>
          classes.includes('rounded-full') &&
          classes.includes('text-xs') &&
          classes.some((name) => name.startsWith('bg-') && name !== 'bg-current'),
      )
      .map(({ where }) => where)
    expect(handBuilt).toEqual([])
  })

  it('draws every file picker with fileInputClass (D-214)', () => {
    const pickers = files.flatMap(({ file, text }) =>
      [...text.matchAll(/<(input|Input)\b[^>]*type="file"[^>]*>/gs)]
        .filter((match) => !match[0].includes('fileInputClass'))
        .map((match) => `${file}:${text.slice(0, match.index).split('\n').length}`),
    )
    expect(pickers).toEqual([])
  })

  it('gives surface cards 16 px corners (the auth card keeps 24 px)', () => {
    const corner = /^(md:|lg:)?rounded-(xl|3xl|lg|md|\[\d+px\])$/
    const odd = classLists(
      files.filter(({ file }) => file !== 'apps/web/app/components/auth/auth-card.tsx'),
    )
      .filter(
        ({ classes }) =>
          classes.includes('bg-surface') &&
          classes.includes('border-border') &&
          classes.some((name) => corner.test(name)),
      )
      .map(({ where }) => where)
    expect(odd).toEqual([])
  })

  it('draws chips only through Chip or chipVariants (D-214)', () => {
    // A hand-built chip: fully rounded with the chip edge, or a chip-sized rounded box with a border.
    const chipHeight = /^h-(\[(2[8-9]|3[0-6])px\]|7|8|9)$/
    const handBuilt = classLists(files.filter(({ file }) => !file.startsWith('packages/ui/')))
      .filter(
        ({ classes }) =>
          classes.includes('rounded-full') &&
          (classes.includes('border-chip-border') ||
            (classes.includes('border') && classes.some((name) => chipHeight.test(name)))),
      )
      .map(({ where }) => where)
    expect(handBuilt).toEqual([])
  })
})
