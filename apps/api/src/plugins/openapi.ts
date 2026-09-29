import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import type { FastifyInstance } from 'fastify'
import { jsonSchemaTransform } from 'fastify-type-provider-zod'

export const OPENAPI_INFO = {
  title: 'RePrint API',
  description: 'Discover books and read moderated reviews.',
  version: '1.0.0',
} as const

/**
 * Builds the OpenAPI 3.1 document from the routes' Zod schemas (PRD §10).
 * Must be registered before the routes it describes.
 */
export async function registerOpenApi(
  app: FastifyInstance,
  options: { serveDocs: boolean },
): Promise<void> {
  await app.register(swagger, {
    openapi: { openapi: '3.1.0', info: OPENAPI_INFO },
    transform: jsonSchemaTransform,
  })
  // The interactive docs are never served in production (PRD §10).
  if (options.serveDocs) {
    await app.register(swaggerUi, { routePrefix: '/v1/docs' })
  }
}
