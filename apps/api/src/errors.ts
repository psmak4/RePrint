import type { ProblemDetails, ProblemDetailsError } from '@reprint/shared'

const PROBLEM_BASE = 'https://reprint.com/problems'

const TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
}

export function problem(
  status: number,
  detail: string,
  options: { errors?: ProblemDetailsError[]; title?: string } = {},
): ProblemDetails {
  const title = options.title ?? TITLES[status] ?? 'Error'
  return {
    type: `${PROBLEM_BASE}/${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    title,
    status,
    detail,
    ...(options.errors ? { errors: options.errors } : {}),
  }
}

/** Throw from a route or preHandler to send a Problem Details response. */
export class HttpProblem extends Error {
  readonly problem: ProblemDetails

  constructor(
    status: number,
    detail: string,
    options: { errors?: ProblemDetailsError[]; title?: string } = {},
  ) {
    super(detail)
    this.name = 'HttpProblem'
    this.problem = problem(status, detail, options)
  }
}
