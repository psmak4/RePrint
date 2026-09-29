import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { HttpProblem } from '../../errors.js'
import { type ReadinessCheck, runReadinessChecks } from './readiness.js'

const healthResponse = z.object({ status: z.literal('ok') })
const readyResponse = z.object({
  status: z.literal('ok'),
  checks: z.record(z.string(), z.literal('ok')),
})

export interface OpsRoutesOptions {
  readinessChecks: ReadinessCheck[]
}

export const opsRoutes: FastifyPluginAsyncZod<OpsRoutesOptions> = async (app, options) => {
  app.get(
    '/health',
    { config: { rateLimit: false }, schema: { response: { 200: healthResponse } } },
    async () => ({
      status: 'ok' as const,
    }),
  )

  app.get(
    '/ready',
    { config: { rateLimit: false }, schema: { response: { 200: readyResponse } } },
    async (request) => {
      const results = await runReadinessChecks(options.readinessChecks)
      const failed = results.filter((result) => !result.ok)
      if (failed.length > 0) {
        request.log.warn({ failed: failed.map((result) => result.name) }, 'readiness check failed')
        throw new HttpProblem(
          503,
          `Not ready: ${failed.map((result) => result.name).join(', ')} unreachable.`,
        )
      }
      return {
        status: 'ok' as const,
        checks: Object.fromEntries(results.map((result) => [result.name, 'ok' as const])),
      }
    },
  )
}
