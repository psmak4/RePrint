import type { Database } from '@reprint/db'
import {
  accountDeletionScheduledProps,
  accountSuspendedProps,
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
import { SITEMAP_MAX_URLS } from '@reprint/shared'
import type { Redis } from 'ioredis'
import type { Logger } from 'pino'
import { z } from 'zod'
import { purgeSourceRecords, refreshBook } from '../catalog/refresh.js'
import type { SourceAdapter } from '../catalog/sources/types.js'
import type { Mailer } from '../email/mailer.js'
import { eraseDeletedAccounts } from '../modules/accounts/erase.js'
import { liftExpiredSuspensions } from '../modules/admin/suspensions.js'
import { clearOldIps } from '../modules/audit/retention.js'
import { rebuildDiscover } from '../modules/discover/cache.js'
import { recomputeRatings } from '../modules/reviews/aggregates.js'
import { buildSitemaps } from '../modules/sitemaps/build.js'
import type { ImageStorage } from '../storage/index.js'

/** What a job handler can use besides its payload. Later tasks add services here. */
export interface JobContext {
  log: Logger
  mailer: Mailer
  db: Database
  redis: Redis
  storage: ImageStorage
  /** The Catalog's Source; `background` runs its calls behind interactive requests (PRD §6). */
  catalog: {
    source: SourceAdapter
    background: <T>(fn: () => Promise<T>) => Promise<T>
    /** Runs Source calls at interactive priority, for refreshes an Admin asked for. */
    interactive: <T>(fn: () => Promise<T>, timeoutMs: number) => Promise<T>
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
  z.object({
    template: z.literal('account-suspended'),
    to: z.email(),
    props: accountSuspendedProps,
  }),
  z.object({ template: z.literal('review-decision'), to: z.email(), props: reviewDecisionProps }),
])

/** Each Source call of an Admin's refresh may take this long. */
const ADMIN_REFRESH_TIMEOUT_MS = 15_000

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
  'users.lift_suspensions': defineJob({
    // `now` overrides the clock so tests can lift without waiting.
    payload: z.object({ now: z.iso.datetime().optional() }),
    handler: async ({ now }, { db, log }) => {
      const result = await liftExpiredSuspensions(db, now ? new Date(now) : undefined)
      if (result.lifted > 0) log.info(result, 'suspensions lifted')
      return result
    },
    schedule: { everyMs: 5 * 60 * 1000, payload: {} },
    retry: { attempts: 3, backoffMs: 60_000 },
  }),
  'privacy.clearOldIps': defineJob({
    // `now` overrides the clock so tests can clear without waiting 90 days.
    payload: z.object({ now: z.iso.datetime().optional() }),
    handler: async ({ now }, { db, log }) => {
      const cleared = await clearOldIps(db, now ? new Date(now) : undefined)
      log.info(cleared, 'old IPs cleared')
      return cleared
    },
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
  'discover.rebuild': defineJob({
    payload: z.object({}),
    handler: async (_payload, { db, redis, log }) => {
      const rows = await rebuildDiscover(db, redis)
      const shown = Object.entries(rows).filter(([, value]) => value !== null).length
      log.info({ shown }, 'discover rebuilt')
      return { shown }
    },
    schedule: { everyMs: 10 * 60 * 1000, payload: {} },
    retry: { attempts: 3, backoffMs: 30_000 },
  }),
  'sitemaps.build': defineJob({
    // `chunkSize` lets tests split a small Catalog into several chunks.
    payload: z.object({ chunkSize: z.number().int().min(1).max(SITEMAP_MAX_URLS).optional() }),
    handler: async ({ chunkSize }, { db, redis, log }) => {
      const index = await buildSitemaps(db, redis, { chunkSize })
      const urls = index.chunks.reduce((total, chunk) => total + chunk.urlCount, 0)
      log.info({ chunks: index.chunks.length, urls }, 'sitemaps built')
      return { chunks: index.chunks.length, urls }
    },
    schedule: { everyMs: 24 * 60 * 60 * 1000, payload: {} },
    retry: { attempts: 3, backoffMs: 60_000 },
  }),
  'catalog.refresh': defineJob({
    // `interactive` marks an Admin's refresh, which goes ahead of background refreshes (PRD §6).
    payload: z.object({ bookId: z.uuid(), interactive: z.boolean().optional() }),
    handler: async ({ bookId, interactive }, { db, log, catalog }) => {
      const outcome = await refreshBook({
        db,
        source: catalog.source,
        bookId,
        call: interactive
          ? (fn) => catalog.interactive(fn, ADMIN_REFRESH_TIMEOUT_MS)
          : catalog.background,
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
