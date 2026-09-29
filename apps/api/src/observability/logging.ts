import { LOG_REDACT_CENSOR, LOG_REDACT_PATHS } from '@reprint/shared'
import type { LoggerOptions } from 'pino'

/** pino options shared by the API and the worker. */
export function baseLoggerOptions(env: { LOG_LEVEL: string; NODE_ENV: string }): LoggerOptions {
  return {
    level: env.LOG_LEVEL,
    redact: { paths: [...LOG_REDACT_PATHS], censor: LOG_REDACT_CENSOR },
    ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
  }
}
