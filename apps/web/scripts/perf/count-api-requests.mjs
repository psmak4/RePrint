#!/usr/bin/env node
// A pass-through proxy that counts the API requests a web server makes (M10-T13;
// docs/performance.md). Start it, point the web server's API_INTERNAL_URL at it, load a page, then
// read and reset the counts at /__counts.
//
// Usage: node apps/web/scripts/perf/count-api-requests.mjs   (env: PORT default 3999, API_URL default http://localhost:3000)
import http from 'node:http'

const port = Number(process.env.PORT ?? 3999)
const api = new URL(process.env.API_URL ?? 'http://localhost:3000')
const counts = new Map()

http
  .createServer((request, response) => {
    const path = (request.url ?? '/').split('?')[0]
    if (path === '/__counts') {
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify(Object.fromEntries(counts)))
      counts.clear()
      return
    }
    counts.set(path, (counts.get(path) ?? 0) + 1)
    const upstream = http.request(
      {
        host: api.hostname,
        port: api.port,
        path: request.url,
        method: request.method,
        headers: request.headers,
      },
      (answer) => {
        response.writeHead(answer.statusCode ?? 502, answer.headers)
        answer.pipe(response)
      },
    )
    upstream.on('error', () => {
      response.writeHead(502)
      response.end()
    })
    request.pipe(upstream)
  })
  .listen(port, () => console.log(`counting API requests on :${port} → ${api.origin}`))
