import { toSourceMarkdown } from './open-library/record.js'
import { SOURCE_NAME as OPEN_LIBRARY } from './open-library/source-name.js'
import { createStubSource } from './stub/stub-adapter.js'
import type { SourceAdapter } from './types.js'

/**
 * How each Source's long text (a Book description, an Author bio) is read on import, by the Source
 * name its field origins carry, so text stored under older rules can be read again (D-202).
 */
export const sourceTextCleaners: Readonly<Record<string, (raw: string) => string | null>> = {
  [OPEN_LIBRARY]: toSourceMarkdown,
}

/**
 * The name readers see for each Source's data (D-204). The stub stands in for Open Library in local
 * runs and specs, so it shows the same name.
 */
export const SOURCE_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  [OPEN_LIBRARY]: 'Open Library',
  stub: 'Open Library',
}

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
