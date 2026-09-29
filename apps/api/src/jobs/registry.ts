import { emailAlreadyRegisteredProps, renderEmail, verifyEmailProps } from '@reprint/email'
import type { Logger } from 'pino'
import { z } from 'zod'
import type { Mailer } from '../email/mailer.js'

/** What a job handler can use besides its payload. Later tasks add services here (db, ...). */
export interface JobContext {
  log: Logger
  mailer: Mailer
}

export interface JobDefinition<Schema extends z.ZodType = z.ZodType, Result = unknown> {
  /** Validates the payload both when a job is enqueued and again before it runs. */
  payload: Schema
  handler: (payload: z.output<Schema>, context: JobContext) => Promise<Result>
  /** Runs the job on a schedule with this payload. The schedule is kept in Redis, keyed by the job name. */
  schedule?: { everyMs: number; payload: z.input<Schema> }
  /** Retries a failed job with exponential backoff. Without it a failure is final. */
  retry?: { attempts: number; backoffMs: number }
}

/** Keeps each definition's payload type while the registry stays a plain object. */
export function defineJob<Schema extends z.ZodType, Result>(
  definition: JobDefinition<Schema, Result>,
): JobDefinition<Schema, Result> {
  return definition
}

/** One case per email template; `props` is checked against the template's own schema. */
const emailSendPayload = z.discriminatedUnion('template', [
  z.object({ template: z.literal('verify-email'), to: z.email(), props: verifyEmailProps }),
  z.object({
    template: z.literal('email-already-registered'),
    to: z.email(),
    props: emailAlreadyRegisteredProps,
  }),
])

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
  'email.send': defineJob({
    payload: emailSendPayload,
    handler: async (payload, { log, mailer }) => {
      const email = await renderEmail(payload.template, payload.props)
      await mailer.send({ to: payload.to, ...email })
      // The address is personal data, so only the template is logged.
      log.info({ template: payload.template }, 'email sent')
    },
    retry: { attempts: 5, backoffMs: 10_000 },
  }),
}

export type Jobs = typeof jobs
export type JobName = keyof Jobs & string
export type JobPayload<Name extends JobName> = z.input<Jobs[Name]['payload']>
export type JobResult<Name extends JobName> = Awaited<ReturnType<Jobs[Name]['handler']>>

export function isJobName(name: string): name is JobName {
  return Object.hasOwn(jobs, name)
}
