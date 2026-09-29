import { PassThrough } from 'node:stream'
import { createReadableStreamFromReadable } from '@react-router/node'
import * as Sentry from '@sentry/react-router'
import { isbot } from 'isbot'
import type { RenderToPipeableStreamOptions } from 'react-dom/server'
import { renderToPipeableStream } from 'react-dom/server'
import type { EntryContext, HandleErrorFunction } from 'react-router'
import { ServerRouter } from 'react-router'
import { BASELINE_SECURITY_HEADERS, buildCsp, generateNonce } from './lib/csp.server.js'
import { logger } from './lib/logger.server.js'
import { REQUEST_ID_HEADER } from './lib/request-id.server.js'
import { sentryOrigin } from './lib/sentry.js'

const sentryDsn = process.env.VITE_SENTRY_DSN
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.VITE_SENTRY_ENVIRONMENT ?? process.env.APP_ENV,
    tracesSampleRate: Number(process.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  })
}

/** Logs unexpected server errors with the request ID and reports them to Sentry (when enabled). */
export const handleError: HandleErrorFunction = (error, { request }) => {
  // Aborted requests are the browser navigating away, not a fault.
  if (request.signal.aborted) return
  logger.error({ err: error, reqId: request.headers.get(REQUEST_ID_HEADER) }, 'unhandled error')
  Sentry.captureException(error)
}

export const streamTimeout = 5_000

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
) {
  const nonce = generateNonce()
  for (const [name, value] of Object.entries(BASELINE_SECURITY_HEADERS)) {
    responseHeaders.set(name, value)
  }
  responseHeaders.set(
    'Content-Security-Policy',
    buildCsp(nonce, {
      apiOrigin: process.env.API_ORIGIN,
      sentryOrigin: sentryOrigin(sentryDsn),
      dev: process.env.NODE_ENV === 'development',
    }),
  )

  // https://httpwg.org/specs/rfc9110.html#HEAD
  if (request.method.toUpperCase() === 'HEAD') {
    return new Response(null, {
      status: responseStatusCode,
      headers: responseHeaders,
    })
  }

  return new Promise((resolve, reject) => {
    let shellRendered = false
    const userAgent = request.headers.get('user-agent')

    // Ensure requests from bots and SPA Mode renders wait for all content to load before responding
    // https://react.dev/reference/react-dom/server/renderToPipeableStream#waiting-for-all-content-to-load-for-crawlers-and-static-generation
    const readyOption: keyof RenderToPipeableStreamOptions =
      (userAgent && isbot(userAgent)) || routerContext.isSpaMode ? 'onAllReady' : 'onShellReady'

    // Abort the rendering stream after the `streamTimeout` so it has time to
    // flush down the rejected boundaries
    let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(
      () => abort(),
      streamTimeout + 1000,
    )

    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} nonce={nonce} />,
      {
        nonce,
        [readyOption]() {
          shellRendered = true
          const body = new PassThrough({
            final(callback) {
              // Clear the timeout to prevent retaining the closure and memory leak
              clearTimeout(timeoutId)
              timeoutId = undefined
              callback()
            },
          })
          const stream = createReadableStreamFromReadable(body)

          responseHeaders.set('Content-Type', 'text/html')

          pipe(body)

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          )
        },
        onShellError(error: unknown) {
          reject(error)
        },
        onError(error: unknown) {
          responseStatusCode = 500
          // Log streaming rendering errors from inside the shell.  Don't log
          // errors encountered during initial shell rendering since they'll
          // reject and get logged in handleDocumentRequest.
          if (shellRendered) {
            console.error(error)
          }
        },
      },
    )
  })
}
