import type { Database } from '@reprint/db'
import {
  accountDeletionScheduledProps,
  emailAlreadyRegisteredProps,
  emailChangeConfirmProps,
  emailChangedProps,
  emailChangeRequestedProps,
  passwordChangedProps,
  passwordResetProps,
  renderEmail,
  reviewDecisionProps,
  verifyEmailProps,
} from '@reprint/email'
import type { Logger } from 'pino'
import { z } from 'zod'
import { purgeSourceRecords, refreshBook } from '../catalog/refresh.js'
import type { SourceAdapter } from '../catalog/sources/types.js'
import type { Mailer } from '../email/mailer.js'
import { eraseDeletedAccounts } from '../modules/accounts/erase.js'
import { recomputeRatings } from '../modules/reviews/aggregates.js'
import type { ImageStorage } from '../storage/index.js'

/** What a job handler can use besides its payload. Later tasks add services here. */
export interface JobContext {
  log: Logger
  mailer: Mailer
  db: Database
  storage: ImageStorage
  /** The Catalog's Source; `background` runs its calls behind interactive requests (PRD §6). */
  catalog: {
    source: SourceAdapter
    background: <T>(fn: () => Promise<T>) => Promise<T>
  }
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
export const emailSendPayload = z.discriminatedUnion('template', [
  z.object({ template: z.literal('verify-email'), to: z.email(), props: verifyEmailProps }),
  z.object({
    template: z.literal('email-already-registered'),
    to: z.email(),
    props: emailAlreadyRegisteredProps,
  }),
  z.object({ template: z.literal('password-reset'), to: z.email(), props: passwordResetProps }),
  z.object({
    template: z.literal('password-changed'),
    to: z.email(),
    props: passwordChangedProps,
  }),
  z.object({
    template: z.literal('email-change-confirm'),
    to: z.email(),
    props: emailChangeConfirmProps,
  }),
  z.object({
    template: z.literal('email-change-requested'),
    to: z.email(),
    props: emailChangeRequestedProps,
  }),
  z.object({ template: z.literal('email-changed'), to: z.email(), props: emailChangedProps }),
  z.object({
    template: z.literal('account-deletion-scheduled'),
    to: z.email(),
    props: accountDeletionScheduledProps,
  }),
  z.object({ template: z.literal('review-decision'), to: z.email(), props: reviewDecisionProps }),
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
  'accounts.erase': defineJob({
    // `now` overrides the clock so tests can erase without waiting 30 days.
    payload: z.object({ now: z.iso.datetime().optional() }),
    handler: async ({ now }, { log, db, storage }) =>
      eraseDeletedAccounts({ db, storage, log, now: now ? new Date(now) : undefined }),
    schedule: { everyMs: 24 * 60 * 60 * 1000, payload: {} },
    retry: { attempts: 3, backoffMs: 60_000 },
  }),
  'ratings.recompute': defineJob({
    payload: z.object({}),
    handler: async (_payload, { db, log }) => {
      const { checked, mismatches } = await recomputeRatings({ db, log })
      log.info({ checked, mismatches: mismatches.length }, 'ratings recomputed')
      return { checked, mismatches: mismatches.length }
    },
    schedule: { everyMs: 24 * 60 * 60 * 1000, payload: {} },
    retry: { attempts: 3, backoffMs: 60_000 },
  }),
  'catalog.refresh': defineJob({
    payload: z.object({ bookId: z.uuid() }),
    handler: async ({ bookId }, { db, log, catalog }) => {
      const outcome = await refreshBook({
        db,
        source: catalog.source,
        bookId,
        call: catalog.background,
      })
      log.info({ bookId, outcome }, 'book refreshed')
      return { outcome }
    },
    retry: { attempts: 3, backoffMs: 60_000 },
  }),
  'catalog.purgeSourceRecords': defineJob({
    // `now` overrides the clock so tests can purge without waiting 30 days.
    payload: z.object({ now: z.iso.datetime().optional() }),
    handler: async ({ now }, { db, log }) => {
      const deleted = await purgeSourceRecords(db, now ? new Date(now) : undefined)
      log.info({ deleted }, 'source records purged')
      return { deleted }
    },
    schedule: { everyMs: 24 * 60 * 60 * 1000, payload: {} },
    retry: { attempts: 3, backoffMs: 60_000 },
  }),
}

export type Jobs = typeof jobs
export type JobName = keyof Jobs & string
export type JobPayload<Name extends JobName> = z.input<Jobs[Name]['payload']>
export type JobResult<Name extends JobName> = Awaited<ReturnType<Jobs[Name]['handler']>>

export function isJobName(name: string): name is JobName {
  return Object.hasOwn(jobs, name)
}
