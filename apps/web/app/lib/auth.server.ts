import {
  type ProblemDetails,
  problemDetailsSchema,
  type SessionResponse,
  sessionResponseSchema,
} from '@reprint/shared'
import { data } from 'react-router'
import { apiClientFor } from './api.server.js'
import { logger } from './logger.server.js'

const VISITOR: SessionResponse = { signupsOpen: false, viewer: null }

/** The viewer and signup state for this request. A down API degrades to a Visitor page. */
export async function loadSession(request: Request): Promise<SessionResponse> {
  try {
    const response = await apiClientFor(request).get('/v1/auth/session')
    if (!response.ok) return VISITOR
    return sessionResponseSchema.parse(await response.json())
  } catch (error) {
    logger.error({ err: error }, 'could not load the session')
    return VISITOR
  }
}

export type FormFailure = {
  formError?: string
  fieldErrors?: Record<string, string>
}

/** Turns a Problem Details body into messages a form can show. `body.email` becomes `email`. */
export function toFormFailure(problem: ProblemDetails | undefined, fallback: string): FormFailure {
  if (!problem) return { formError: fallback }
  const fieldErrors: Record<string, string> = {}
  for (const error of problem.errors ?? []) {
    const field = error.path.replace(/^body\./, '')
    if (field && !(field in fieldErrors)) fieldErrors[field] = error.message
  }
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors }
  return { formError: problem.detail || problem.title || fallback }
}

async function readProblem(response: Response): Promise<ProblemDetails | undefined> {
  try {
    const parsed = problemDetailsSchema.safeParse(await response.json())
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

/** Copies every Set-Cookie from an API response so the browser gets the session cookie. */
export function forwardCookies(from: Response, to: Headers): void {
  for (const cookie of from.headers.getSetCookie()) to.append('set-cookie', cookie)
}

export type ApiPostResult =
  | { ok: true; body: unknown; response: Response }
  | { ok: false; failure: FormFailure; status: number }

/**
 * Sends a request to the API on behalf of a form action. A `FormData` body goes out as multipart
 * (the runtime sets the boundary), `null` sends no body, and anything else goes out as JSON.
 */
export async function sendToApi(
  request: Request,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body: unknown,
  fallback: string,
): Promise<ApiPostResult> {
  let response: Response
  try {
    response = await apiClientFor(request).request(
      path,
      body === null
        ? { method }
        : body instanceof FormData
          ? { method, body }
          : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
    )
  } catch (error) {
    logger.error({ err: error, path }, 'API request failed')
    return { ok: false, failure: { formError: fallback }, status: 503 }
  }
  if (response.ok) {
    return { ok: true, body: await response.json().catch(() => null), response }
  }
  return {
    ok: false,
    failure: toFormFailure(await readProblem(response), fallback),
    status: response.status,
  }
}

/** POSTs JSON to the API on behalf of a form action. */
export function postToApi(
  request: Request,
  path: string,
  body: unknown,
  fallback: string,
): Promise<ApiPostResult> {
  return sendToApi(request, 'POST', path, body, fallback)
}

/** Failure result for a form action: same body the form component reads back. */
export function failed(result: Extract<ApiPostResult, { ok: false }>) {
  return data(result.failure, { status: result.status })
}
