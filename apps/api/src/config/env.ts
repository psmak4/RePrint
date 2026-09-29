import { z } from 'zod'

const originList = z
  .string()
  .min(1)
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.url()).min(1))

const booleanFlag = z.enum(['true', 'false']).transform((value) => value === 'true')

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['local', 'preview', 'staging', 'production']).default('local'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  /** Origins allowed to send non-GET requests and to use credentialed CORS (PRD §10). */
  WEB_ORIGINS: originList,
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  TRUST_PROXY: booleanFlag.default(false),
  /** Session lifetime; it renews while the session is in use (PRD §7.1, D-027). */
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  /** Domain of the `rp_session` cookie so `www` and `api` both get it. Unset means host-only. */
  COOKIE_DOMAIN: z.string().min(1).optional(),
  /** Defaults to on everywhere except `APP_ENV=local` (plain http). */
  COOKIE_SECURE: booleanFlag.optional(),
  /** Base URL of the web app for links in emails. Defaults to the first of `WEB_ORIGINS`. */
  WEB_URL: z.url().optional(),
  /** `live` checks new passwords against the Have I Been Pwned range API; `off` skips it (D-029). */
  HIBP_MODE: z.enum(['live', 'off']).default('live'),
  /** `false` is the private beta: registration needs a code from `SIGNUP_INVITE_CODES` (D-014). */
  PUBLIC_SIGNUPS: booleanFlag.default(false),
  /** Comma-separated invite codes accepted while `PUBLIC_SIGNUPS=false`. */
  SIGNUP_INVITE_CODES: z
    .string()
    .transform((value) =>
      value
        .split(',')
        .map((code) => code.trim())
        .filter(Boolean),
    )
    .default([]),
  /** Runs the job worker inside the API process, for environments with no separate worker (D-071). */
  WORKER_IN_PROCESS: booleanFlag.default(false),
  /** Sentry is off when this is unset (PRD §11). */
  SENTRY_DSN: z.url().optional(),
  SENTRY_ENVIRONMENT: z.string().min(1).optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  /** `smtp` sends to Mailpit locally and in CI; `resend` is for preview, staging, and production (D-028). */
  EMAIL_TRANSPORT: z.enum(['smtp', 'resend']).default('smtp'),
  EMAIL_FROM: z.string().min(1).default('RePrint <no-reply@reprint.localhost>'),
  SMTP_HOST: z.string().min(1).default('localhost'),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  /** Required when `EMAIL_TRANSPORT=resend`. */
  RESEND_API_KEY: z.string().min(1).optional(),
})

type EmailSettings = Pick<z.infer<typeof baseEnvSchema>, 'EMAIL_TRANSPORT' | 'RESEND_API_KEY'>

function requireResendKey(env: EmailSettings, context: z.RefinementCtx): void {
  if (env.EMAIL_TRANSPORT === 'resend' && !env.RESEND_API_KEY) {
    context.addIssue({
      code: 'custom',
      path: ['RESEND_API_KEY'],
      message: 'is required when EMAIL_TRANSPORT=resend',
    })
  }
}

export const envSchema = baseEnvSchema.superRefine(requireResendKey)

export type Env = z.infer<typeof envSchema>

/** The worker serves no web traffic, so it needs only these variables. */
export const workerEnvSchema = baseEnvSchema
  .pick({
    NODE_ENV: true,
    APP_ENV: true,
    LOG_LEVEL: true,
    SENTRY_DSN: true,
    SENTRY_ENVIRONMENT: true,
    SENTRY_TRACES_SAMPLE_RATE: true,
    DATABASE_URL: true,
    REDIS_URL: true,
    EMAIL_TRANSPORT: true,
    EMAIL_FROM: true,
    SMTP_HOST: true,
    SMTP_PORT: true,
    RESEND_API_KEY: true,
  })
  .superRefine(requireResendKey)

export type WorkerEnv = z.infer<typeof workerEnvSchema>

export class EnvError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EnvError'
  }
}

/** Parses the environment and throws an `EnvError` that names every invalid variable. */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  return parseEnv(envSchema, source)
}

export function loadWorkerEnv(source: Record<string, string | undefined> = process.env): WorkerEnv {
  return parseEnv(workerEnvSchema, source)
}

function parseEnv<Schema extends z.ZodType>(
  schema: Schema,
  source: Record<string, string | undefined>,
): z.output<Schema> {
  // An empty value in a .env file means "unset", so defaults apply.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''))
  const result = schema.safeParse(cleaned)
  if (result.success) return result.data
  const lines = result.error.issues.map((issue) => {
    const name = issue.path.join('.') || '(environment)'
    return `  - ${name}: ${name in cleaned ? issue.message : 'is required but not set'}`
  })
  throw new EnvError(
    `Invalid environment configuration:\n${lines.join('\n')}\nSee .env.example for the expected variables.`,
  )
}
