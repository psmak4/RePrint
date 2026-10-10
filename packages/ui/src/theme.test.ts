import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./theme.css', import.meta.url), 'utf8')

function token(name: string): string {
  const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!match?.[1]) throw new Error(`missing token ${name}`)
  return match[1]
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

const GROUNDS = ['background', 'surface', 'surface-raised', 'ground-deep']

describe('theme tokens', () => {
  it('uses the light palette (D-176)', () => {
    expect(token('background')).toBe('#fbfaf7')
    expect(token('ground-deep')).toBe('#f3efe8')
    expect(token('surface')).toBe('#ffffff')
    expect(token('foreground')).toBe('#0f172a')
    expect(token('accent')).toBe('#2563eb')
    expect(token('accent-foreground')).toBe('#ffffff')
    expect(token('link')).toBe('#1d4ed8')
    expect(token('star')).toBe('#a8500a')
    expect(token('warning')).toBe(token('star'))
  })

  it('is light only', () => {
    expect(css).toContain('color-scheme: light')
    expect(css).not.toContain('color-scheme: dark')
    expect(css).not.toMatch(/prefers-color-scheme|\.dark\b/)
    // The old dark palette's values must be gone.
    for (const dark of ['#1e293b', '#273449', '#94a3b8', '#334155', '#3b82f6', '#60a5fa']) {
      expect(css.toLowerCase()).not.toContain(dark)
    }
  })

  it('defines the two font stacks (D-180)', () => {
    expect(css).toMatch(/--font-sans:[^;]*Instrument Sans Variable/)
    expect(css).toMatch(/--font-serif:[^;]*Newsreader Variable/)
  })

  // WCAG 2.2 AA: 4.5:1 for text, 3:1 for UI component boundaries and focus indicators.
  const textColours = [
    'foreground',
    'muted-foreground',
    'link',
    'danger',
    'success',
    'warning',
    'star',
  ]
  const text = textColours.flatMap((fg) => GROUNDS.map((bg): [string, string] => [fg, bg]))
  it.each(text)('text %s on %s meets 4.5:1', (fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5)
  })

  it('accent-foreground on accent meets 4.5:1', () => {
    expect(contrast(token('accent-foreground'), token('accent'))).toBeGreaterThanOrEqual(4.5)
  })

  it('accent-foreground on accent-hover meets 4.5:1', () => {
    expect(contrast(token('accent-foreground'), token('accent-hover'))).toBeGreaterThanOrEqual(4.5)
  })

  const uiColours = ['ring', 'input-border']
  const ui = uiColours.flatMap((fg) => GROUNDS.map((bg): [string, string] => [fg, bg]))
  it.each(ui)('UI colour %s on %s meets 3:1', (fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(3)
  })
})
