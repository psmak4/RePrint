import type { Redis } from 'ioredis'
import type { Env, WorkerEnv } from '../config/env.js'
import { createSourceGateway } from './gateway/gateway.js'
import { createSourceAdapter } from './sources/index.js'
import { openLibraryImplementations } from './sources/open-library/index.js'
import type { SourceAdapter } from './sources/types.js'

type SourceSettings = Pick<
  Env & WorkerEnv,
  'SOURCE_MODE' | 'SOURCE_RATE_LIMIT_RPS' | 'SOURCE_TIMEOUT_MS' | 'SOURCE_CONTACT_EMAIL'
>

/** The Source adapter behind the shared gateway, and a way to run its calls as background requests. */
export function createCatalogRuntime(env: SourceSettings, redis: Redis) {
  const gateway = createSourceGateway({
    redis,
    rps: env.SOURCE_RATE_LIMIT_RPS,
    timeoutMs: env.SOURCE_TIMEOUT_MS,
    version: process.env.npm_package_version ?? '0.0.0',
    contactEmail: env.SOURCE_CONTACT_EMAIL,
  })
  const source: SourceAdapter = createSourceAdapter(
    env.SOURCE_MODE,
    openLibraryImplementations({ fetch: gateway.fetch }),
  )
  return {
    source,
    gateway,
    interactive: <T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> =>
      gateway.run({ priority: 'interactive', timeoutMs }, fn),
    background: <T>(fn: () => Promise<T>): Promise<T> =>
      gateway.run({ priority: 'background' }, fn),
  }
}
