import { LOG_REDACT_CENSOR, LOG_REDACT_PATHS } from '@reprint/shared'
import { type Logger, pino } from 'pino'

export function createLogger(
  options: { level?: string; development?: boolean; stream?: NodeJS.WritableStream } = {},
): Logger {
  const config = {
    level: options.level ?? 'info',
    base: { service: 'web' },
    redact: { paths: [...LOG_REDACT_PATHS], censor: LOG_REDACT_CENSOR },
  }
  if (options.stream) return pino(config, options.stream)
  return pino({
    ...config,
    ...(options.development ? { transport: { target: 'pino-pretty' } } : {}),
  })
}

export const logger = createLogger({
  level: process.env.LOG_LEVEL,
  development: process.env.NODE_ENV === 'development',
})
