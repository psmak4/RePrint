import type { DbClient } from '@reprint/db'
import type { Redis } from 'ioredis'

export interface ReadinessCheck {
  /** Shown in the response and logs, for example `postgres`. */
  name: string
  /** Resolves when the dependency is reachable; rejects otherwise. */
  check: () => Promise<unknown>
}

export interface ReadinessResult {
  name: string
  ok: boolean
}

/** A dependency that doesn't answer in this long counts as unreachable. */
export const READINESS_TIMEOUT_MS = 2000

export function postgresCheck(client: Pick<DbClient, 'sql'>): ReadinessCheck {
  return { name: 'postgres', check: () => client.sql`select 1` }
}

export function redisCheck(redis: Pick<Redis, 'ping'>): ReadinessCheck {
  return { name: 'redis', check: () => redis.ping() }
}

async function withTimeout(work: Promise<unknown>, ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timed out')), ms)
  })
  try {
    await Promise.race([work, timeout])
  } finally {
    clearTimeout(timer)
  }
}

/** Runs every check in parallel; a throw or a timeout marks that dependency not ok. */
export async function runReadinessChecks(
  checks: ReadinessCheck[],
  timeoutMs = READINESS_TIMEOUT_MS,
): Promise<ReadinessResult[]> {
  return Promise.all(
    checks.map(async ({ name, check }) => {
      try {
        await withTimeout(Promise.resolve().then(check), timeoutMs)
        return { name, ok: true }
      } catch {
        return { name, ok: false }
      }
    }),
  )
}
