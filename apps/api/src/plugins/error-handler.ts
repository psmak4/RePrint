import type { FastifyError, FastifyInstance } from 'fastify'
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod'
import { HttpProblem, problem } from '../errors.js'

const PROBLEM_CONTENT_TYPE = 'application/problem+json; charset=utf-8'

/** Every error and unknown route leaves the API as RFC 9457 Problem Details. */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    reply
      .code(404)
      .type(PROBLEM_CONTENT_TYPE)
      .send(problem(404, `No route matches ${request.method} ${request.url.split('?')[0]}.`))
  })

  app.setErrorHandler((error: FastifyError | HttpProblem, request, reply) => {
    if (error instanceof HttpProblem) {
      return reply.code(error.problem.status).type(PROBLEM_CONTENT_TYPE).send(error.problem)
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      const context = (error as FastifyError).validationContext ?? 'request'
      const errors = error.validation.map((issue) => ({
        path: [context, ...issue.instancePath.split('/').filter(Boolean)].join('.'),
        message: issue.message ?? 'Invalid value.',
      }))
      return reply
        .code(400)
        .type(PROBLEM_CONTENT_TYPE)
        .send(problem(400, 'The request did not pass validation.', { errors }))
    }

    const status = (error as FastifyError).statusCode
    if (status && status >= 400 && status < 500 && !isResponseSerializationError(error)) {
      return reply.code(status).type(PROBLEM_CONTENT_TYPE).send(problem(status, error.message))
    }

    request.log.error({ err: error }, 'unhandled error')
    return reply
      .code(500)
      .type(PROBLEM_CONTENT_TYPE)
      .send(problem(500, 'Something went wrong on our side. Please try again.'))
  })
}
