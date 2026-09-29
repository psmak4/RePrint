import { v7 as uuidv7 } from 'uuid'

/** mulberry32: a small, fast, seedable PRNG. Same seed, same sequence, on every machine. */
export function createPrng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fixed clock for seeded rows and IDs (2026-01-01T00:00:00Z), so re-seeding gives identical values. */
export const SEED_EPOCH_MS = Date.UTC(2026, 0, 1)

export interface SeedRandom {
  /** A float in [0, 1). */
  next: () => number
  /** An integer in [min, max], inclusive. */
  int: (min: number, max: number) => number
  /** One element of a non-empty list. */
  pick: <T>(items: readonly [T, ...T[]]) => T
  /** A deterministic UUIDv7. Each call advances the seeded clock by one millisecond. */
  id: () => string
  /** The fixed seed clock, in UTC. */
  now: () => Date
}

export function createSeedRandom(seed: number): SeedRandom {
  const next = createPrng(seed)
  let tick = 0
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)] as (typeof items)[number],
    id: () => {
      const random = Uint8Array.from({ length: 16 }, () => Math.floor(next() * 256))
      return uuidv7({ msecs: SEED_EPOCH_MS + tick++, seq: 0, random })
    },
    now: () => new Date(SEED_EPOCH_MS),
  }
}
