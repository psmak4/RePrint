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
  TRUST_PROXY: booleanFlag.default(false),
})

export type Env = z.infer<typeof envSchema>

export class EnvError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EnvError'
  }
}

/** Parses the environment and throws an `EnvError` that names every invalid variable. */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  // An empty value in a .env file means "unset", so defaults apply.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''))
  const result = envSchema.safeParse(cleaned)
  if (result.success) return result.data
  const lines = result.error.issues.map((issue) => {
    const name = issue.path.join('.') || '(environment)'
    return `  - ${name}: ${name in cleaned ? issue.message : 'is required but not set'}`
  })
  throw new EnvError(
    `Invalid environment configuration:\n${lines.join('\n')}\nSee .env.example for the expected variables.`,
  )
}
