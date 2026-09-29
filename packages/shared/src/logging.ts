const SENSITIVE_FIELDS = ['cookie', 'authorization', 'password', 'token'] as const

/**
 * pino `redact` paths shared by the API, worker, and web server (PRD §11). Each sensitive field is
 * covered at the top level, one level down (`err`, `body`, ...), and inside request headers.
 */
export const LOG_REDACT_PATHS: readonly string[] = [
  ...SENSITIVE_FIELDS,
  ...SENSITIVE_FIELDS.map((field) => `*.${field}`),
  ...SENSITIVE_FIELDS.map((field) => `*.headers.${field}`),
  '*.headers["set-cookie"]',
  'headers["set-cookie"]',
]

export const LOG_REDACT_CENSOR = '[Redacted]'
