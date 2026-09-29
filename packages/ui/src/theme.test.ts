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

describe('theme tokens', () => {
  it('uses the brand palette', () => {
    expect(token('background')).toBe('#0f172a')
    expect(token('accent')).toBe('#3b82f6')
    expect(token('foreground')).toBe('#f8fafc')
  })

  // WCAG 2.2 AA: 4.5:1 for text, 3:1 for UI component boundaries and focus indicators.
  const text: [string, string][] = [
    ['foreground', 'background'],
    ['foreground', 'surface'],
    ['foreground', 'surface-raised'],
    ['muted-foreground', 'background'],
    ['muted-foreground', 'surface'],
    ['link', 'background'],
    ['link', 'surface'],
    ['danger', 'background'],
    ['danger', 'surface'],
    ['success', 'background'],
    ['warning', 'background'],
    ['accent-foreground', 'accent'],
  ]
  it.each(text)('text %s on %s meets 4.5:1', (fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5)
  })

  const ui: [string, string][] = [
    ['ring', 'background'],
    ['ring', 'surface'],
    ['input-border', 'background'],
    ['input-border', 'surface'],
  ]
  it.each(ui)('UI colour %s on %s meets 3:1', (fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(3)
  })
})
