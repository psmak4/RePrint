import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'))
}

describe('@reprint/config', () => {
  it('tsconfig base turns on strict and noUncheckedIndexedAccess', () => {
    const base = readJson('../tsconfig/base.json') as {
      compilerOptions: Record<string, unknown>
    }
    expect(base.compilerOptions.strict).toBe(true)
    expect(base.compilerOptions.noUncheckedIndexedAccess).toBe(true)
  })

  it('Biome bans dangerouslySetInnerHTML', () => {
    const biome = readJson('../biome.json') as {
      linter: { rules: { security: Record<string, unknown> } }
    }
    expect(biome.linter.rules.security.noDangerouslySetInnerHtml).toBe('error')
  })
})
