import type { Logger } from 'pino'
import { z } from 'zod'

/** What a job handler can use besides its payload. Later tasks add services here (db, mailer, ...). */
export interface JobContext {
  log: Logger
}

export interface JobDefinition<Schema extends z.ZodType = z.ZodType, Result = unknown> {
  /** Validates the payload both when a job is enqueued and again before it runs. */
  payload: Schema
  handler: (payload: z.output<Schema>, context: JobContext) => Promise<Result>
  /** Runs the job on a schedule with this payload. The schedule is kept in Redis, keyed by the job name. */
  schedule?: { everyMs: number; payload: z.input<Schema> }
}

/** Keeps each definition's payload type while the registry stays a plain object. */
export function defineJob<Schema extends z.ZodType, Result>(
  definition: JobDefinition<Schema, Result>,
): JobDefinition<Schema, Result> {
  return definition
}

/** Every background job. To add one, add an entry here (see `README.md`). */
export const jobs = {
  'system.heartbeat': defineJob({
    payload: z.object({ note: z.string().max(200).optional() }),
    handler: async (payload, { log }) => {
      const at = new Date().toISOString()
      log.info({ at, note: payload.note }, 'heartbeat')
      return { at }
    },
    schedule: { everyMs: 60_000, payload: {} },
  }),
}

export type Jobs = typeof jobs
export type JobName = keyof Jobs & string
export type JobPayload<Name extends JobName> = z.input<Jobs[Name]['payload']>
export type JobResult<Name extends JobName> = Awaited<ReturnType<Jobs[Name]['handler']>>

export function isJobName(name: string): name is JobName {
  return Object.hasOwn(jobs, name)
}
