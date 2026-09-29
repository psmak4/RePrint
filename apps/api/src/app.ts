import { randomUUID } from 'node:crypto'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import type { Database } from '@reprint/db'
import Fastify, { type FastifyInstance } from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import type { Redis } from 'ioredis'
import type { Env } from './config/env.js'
import type { JobQueue } from './jobs/queue.js'
import { loginRoutes } from './modules/auth/login.js'
import { passwordResetRoutes } from './modules/auth/password-reset.js'
import { authRoutes } from './modules/auth/register.js'
import { registerSessions } from './modules/auth/session-plugin.js'
import { verificationRoutes } from './modules/auth/verification.js'
import { meRoutes } from './modules/me/routes.js'
import type { ReadinessCheck } from './modules/ops/readiness.js'
import { opsRoutes } from './modules/ops/routes.js'
import { registerRateLimits } from './modules/rate-limit/plugin.js'
import { baseLoggerOptions } from './observability/logging.js'
import { registerErrorHandling } from './plugins/error-handler.js'
import { registerOpenApi } from './plugins/openapi.js'
import { registerOriginCheck } from './plugins/origin-check.js'

const REQUEST_ID_HEADER = 'x-request-id'
// Only accept sane caller-supplied IDs so they can't inject into logs.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/

function requestIdFrom(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header
  return value && SAFE_REQUEST_ID.test(value) ? value : randomUUID()
}

export async function buildApp(
  env: Env,
  options: {
    logStream?: NodeJS.WritableStream
    readinessChecks?: ReadinessCheck[]
    /** Enables session authentication; omitted only by tools that never authenticate (spec generation). */
    database?: Database
    /** Enables rate limiting (PRD §11); omitted only by tools that never serve requests. */
    redis?: Redis
    /** Enqueues background jobs (emails); needed to serve the auth routes. */
    jobs?: Pick<JobQueue, 'enqueue'>
  } = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: env.TRUST_PROXY,
    logger: {
      ...baseLoggerOptions(env),
      ...(options.logStream ? { stream: options.logStream } : {}),
    },
    requestIdHeader: false,
    genReqId: (request) => requestIdFrom(request.headers[REQUEST_ID_HEADER]),
  })

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.addHook('onRequest', async (request, reply) => {
    reply.header(REQUEST_ID_HEADER, request.id)
  })

  registerErrorHandling(app)
  await app.register(helmet, {
    // HSTS with preload needs a max-age of at least a year and includeSubDomains (PRD §11).
    strictTransportSecurity: { maxAge: 63_072_000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    // The API only returns JSON, so nothing may load or embed from its responses.
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
  })
  await app.register(cors, { origin: env.WEB_ORIGINS, credentials: true })
  registerOriginCheck(app, env.WEB_ORIGINS)
  await app.register(cookie)
  registerSessions(app, env, options.database)
  registerRateLimits(app, options.redis)

  await registerOpenApi(app, { serveDocs: env.NODE_ENV !== 'production' })

  await app.register(opsRoutes, {
    prefix: '/v1',
    readinessChecks: options.readinessChecks ?? [],
  })

  await app.register(authRoutes, {
    prefix: '/v1',
    env,
    db: options.database,
    jobs: options.jobs,
  })
  await app.register(verificationRoutes, {
    prefix: '/v1',
    env,
    db: options.database,
    jobs: options.jobs,
  })
  await app.register(loginRoutes, {
    prefix: '/v1',
    env,
    db: options.database,
    jobs: options.jobs,
  })
  await app.register(passwordResetRoutes, {
    prefix: '/v1',
    env,
    db: options.database,
    jobs: options.jobs,
  })
  await app.register(meRoutes, {
    prefix: '/v1',
    env,
    db: options.database,
    jobs: options.jobs,
  })

  return app
}
