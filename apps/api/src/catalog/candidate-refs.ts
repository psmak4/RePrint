import { randomBytes } from 'node:crypto'
import { type BookCandidate, bookCandidateSchema } from '@reprint/shared'
import type { Redis } from 'ioredis'

/** A reference stays valid this long (D-033). */
export const CANDIDATE_REF_TTL_SECONDS = 24 * 60 * 60

const keyOf = (ref: string) => `catalog:candidate:${ref}`

/**
 * Hands out opaque references for Book candidates that are not yet on RePrint. The candidate, with its
 * Source link, stays in Redis, so no Source ID ever reaches a URL or an API response (PRD §5.4, D-033).
 */
export function createCandidateRefs(redis: Redis) {
  return {
    /** Stores `candidate` and returns a new random reference for it. */
    async issue(candidate: BookCandidate): Promise<string> {
      const ref = randomBytes(18).toString('base64url')
      await redis.set(keyOf(ref), JSON.stringify(candidate), 'EX', CANDIDATE_REF_TTL_SECONDS)
      return ref
    },
    /** The candidate behind `ref`, or `null` when the reference is unknown or has expired. */
    async load(ref: string): Promise<BookCandidate | null> {
      const raw = await redis.get(keyOf(ref))
      if (raw === null) return null
      const parsed = bookCandidateSchema.safeParse(JSON.parse(raw))
      return parsed.success ? parsed.data : null
    },
  }
}

export type CandidateRefs = ReturnType<typeof createCandidateRefs>
