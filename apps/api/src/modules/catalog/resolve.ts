import { resolveBookRequestSchema, resolveBookResponseSchema } from '@reprint/shared'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { CandidateRefs } from '../../catalog/candidate-refs.js'
import { type InteractiveCall, resolveCandidate } from '../../catalog/resolve.js'
import { type SourceAdapter, SourceError } from '../../catalog/sources/types.js'
import { HttpProblem } from '../../errors.js'
import type { AuthRoutesOptions } from '../auth/register.js'
import { rateLimit } from '../rate-limit/plugin.js'

export interface ResolveRoutesOptions extends AuthRoutesOptions {
  /** Missing only when the spec is generated; the route then answers 503. */
  catalog:
    | { source: SourceAdapter; call: InteractiveCall; candidateRefs: CandidateRefs }
    | undefined
  /** How long the whole fetch may take (PRD §6). */
  timeoutMs: number
}

const NOT_FOUND = 'We could not find that book.'

export const resolveRoutes: FastifyPluginAsyncZod<ResolveRoutesOptions> = async (app, options) => {
  const { db, catalog, timeoutMs } = options

  app.post(
    '/books/resolve',
    {
      preHandler: rateLimit('bookResolve'),
      schema: {
        body: resolveBookRequestSchema,
        response: { 200: resolveBookResponseSchema },
      },
    },
    async (request) => {
      if (!db || !catalog) throw new Error('book resolving needs a database and a Source')
      const candidate = await catalog.candidateRefs.load(request.body.ref)
      if (!candidate) throw new HttpProblem(404, NOT_FOUND)
      try {
        const result = await resolveCandidate({
          db,
          source: catalog.source,
          candidate,
          timeoutMs,
          call: catalog.call,
        })
        if ('notFound' in result) throw new HttpProblem(404, NOT_FOUND)
        return { slug: result.slug }
      } catch (error) {
        if (error instanceof SourceError) {
          request.log.warn({ err: error }, 'could not fetch book from the Source')
          throw new HttpProblem(503, 'We couldn’t load this book right now. Try again in a moment.')
        }
        throw error
      }
    },
  )
}
