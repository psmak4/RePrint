import { describe, expect, it } from 'vitest'

// Every copy module in this folder (split by area in M10-T07), so a new one is checked too.
const modules = import.meta.glob<Record<string, unknown>>(['./*.ts', '!./*.test.ts'], {
  eager: true,
})

// RePrint is not a store (PRD §1, M9 criterion 9): no price, cart, or buy language in any string.
const FORBIDDEN =
  /\b(price|prices|pricing|cart|buy|buying|purchase|checkout|add to basket)\b|[$€£]\s?\d/i

function collect(value: unknown, path: string, out: Array<[string, string]>): void {
  if (typeof value === 'string') out.push([path, value])
  else if (typeof value === 'function') {
    // Template functions: probe with a sample argument to see the rendered text.
    try {
      const result = (value as (...args: unknown[]) => unknown)('Sample', 2, 3)
      collect(result, `${path}()`, out)
    } catch {
      // Not a string template; nothing to check.
    }
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) collect(child, `${path}.${key}`, out)
  }
}

describe('copy guard', () => {
  it('checks every copy module', () => {
    expect(Object.keys(modules).sort()).toEqual([
      './admin.ts',
      './index.ts',
      './legal.ts',
      './settings.ts',
    ])
  })

  it('has no price, cart, or buy language anywhere in the copy files', () => {
    const strings: Array<[string, string]> = []
    for (const [file, exports] of Object.entries(modules)) collect(exports, file, strings)
    expect(strings.length).toBeGreaterThan(100)
    const offenders = strings.filter(([, text]) => FORBIDDEN.test(text)).map(([path]) => path)
    expect(offenders).toEqual([])
  })
})
