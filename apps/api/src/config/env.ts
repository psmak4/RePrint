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

export const envSchema = z.object({
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
  /** Sentry is off when this is unset (PRD §11). */
  SENTRY_DSN: z.url().optional(),
  SENTRY_ENVIRONMENT: z.string().min(1).optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
})

export type Env = z.infer<typeof envSchema>

/** The worker serves no web traffic, so it needs only these variables. */
export const workerEnvSchema = envSchema.pick({
  NODE_ENV: true,
  APP_ENV: true,
  LOG_LEVEL: true,
  SENTRY_DSN: true,
  SENTRY_ENVIRONMENT: true,
  SENTRY_TRACES_SAMPLE_RATE: true,
  DATABASE_URL: true,
  REDIS_URL: true,
})

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
