import { randomUUID } from 'node:crypto'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import Fastify, { type FastifyInstance } from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import type { Env } from './config/env.js'
import { opsRoutes } from './modules/ops/routes.js'
import { registerErrorHandling } from './plugins/error-handler.js'
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
  options: { logStream?: NodeJS.WritableStream } = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: env.TRUST_PROXY,
    logger: {
      level: env.LOG_LEVEL,
      ...(options.logStream ? { stream: options.logStream } : {}),
      ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
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
  await app.register(helmet)
  await app.register(cors, { origin: env.WEB_ORIGINS, credentials: true })
  registerOriginCheck(app, env.WEB_ORIGINS)

  await app.register(opsRoutes, { prefix: '/v1' })

  return app
}
