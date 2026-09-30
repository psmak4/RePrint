import { createStubSource } from './stub/stub-adapter.js'
import type { SourceAdapter } from './types.js'

export const SOURCE_MODES = ['fixtures', 'live', 'stub'] as const
export type SourceMode = (typeof SOURCE_MODES)[number]

/** Builders for the modes that talk to (or replay) a real Source. The Open Library adapter registers here in M3-T05. */
export type SourceImplementations = Partial<Record<'fixtures' | 'live', () => SourceAdapter>>

/**
 * Picks the Source adapter for `SOURCE_MODE`: `stub` is the in-memory Source, `fixtures` replays recorded
 * responses (the local and CI default), and `live` calls the real Source.
 */
export function createSourceAdapter(
  mode: SourceMode,
  implementations: SourceImplementations = {},
): SourceAdapter {
  if (mode === 'stub') return createStubSource()
  const build = implementations[mode]
  if (!build) throw new Error(`No Source adapter is wired for SOURCE_MODE=${mode}`)
  return build()
}
