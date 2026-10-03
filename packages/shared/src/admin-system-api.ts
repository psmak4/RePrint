import { z } from 'zod'

/** `GET /admin/system`: Source usage, search cache, and queue health for the Admin dashboard (PRD §6, §11). */
export const adminSystemSchema = z.object({
  /** When the numbers were read (ISO 8601, UTC). */
  generatedAt: z.iso.datetime(),
  source: z.object({
    /** Average Source requests per second over the last minute. */
    requestsPerSecond: z.number().nonnegative(),
    /** The configured limit, in requests per second. */
    limitPerSecond: z.number().positive(),
    breakerOpen: z.boolean(),
  }),
  searchCache: z.object({
    hits: z.number().int().nonnegative(),
    misses: z.number().int().nonnegative(),
    /** Hits as a fraction of all lookups; null before the first lookup. */
    hitRate: z.number().min(0).max(1).nullable(),
  }),
  queue: z.object({
    waiting: z.number().int().nonnegative(),
    active: z.number().int().nonnegative(),
    delayed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    /** Age of the oldest waiting job; null when nothing waits. */
    oldestWaitingSeconds: z.number().int().nonnegative().nullable(),
  }),
})
export type AdminSystem = z.infer<typeof adminSystemSchema>
