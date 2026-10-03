import * as Sentry from '@sentry/node'
import type { Env } from '../config/env.js'

type SentryEnv = Pick<Env, 'SENTRY_DSN' | 'SENTRY_ENVIRONMENT' | 'SENTRY_TRACES_SAMPLE_RATE'> & {
  APP_ENV: string
}

/** Starts Sentry when `SENTRY_DSN` is set. Returns whether it started; without a DSN nothing loads. */
export function initSentry(env: SentryEnv, service: 'api' | 'worker'): boolean {
  if (!env.SENTRY_DSN) return false
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.APP_ENV,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    initialScope: { tags: { service } },
  })
  return true
}

/** Reports an unexpected error. A no-op when Sentry was not started. */
export function captureError(error: unknown, requestId?: string): void {
  Sentry.captureException(error, requestId ? { tags: { request_id: requestId } } : undefined)
}

/** Alert signals the monitor job reports (PRD §11). Each is a stable Sentry tag value for alert rules. */
export const ALERT_SIGNALS = [
  'queue_stuck',
  'review_queue_stale',
  'source_breaker_open',
  'source_usage_high',
] as const
export type AlertSignal = (typeof ALERT_SIGNALS)[number]

export interface Alert {
  signal: AlertSignal
  message: string
  detail?: Record<string, unknown>
}

/** Reports an operational alert. The tag and fingerprint are the signal, so repeats group into one issue. */
export function captureAlert({ signal, message, detail }: Alert): void {
  Sentry.captureMessage(message, {
    level: 'error',
    tags: { alert: signal },
    fingerprint: [`alert:${signal}`],
    extra: detail,
  })
}
