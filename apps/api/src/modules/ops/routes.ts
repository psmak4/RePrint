import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'

const healthResponse = z.object({ status: z.literal('ok') })

export const opsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/health', { schema: { response: { 200: healthResponse } } }, async () => ({
    status: 'ok' as const,
  }))
}
