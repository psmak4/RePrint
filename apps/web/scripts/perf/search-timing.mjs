#!/usr/bin/env node
// Median API time, over 7 calls each, for suggestions and a Genre-filtered (Catalog-only) search
// over a few queries (M10-T13; docs/performance.md).
//
// Usage: node apps/web/scripts/perf/search-timing.mjs   (env: API_URL default http://localhost:3000, GENRE default
//        science-fiction; the API should trust X-Forwarded-For so the calls spread over IPs)
const api = process.env.API_URL ?? 'http://localhost:3000'
const genre = process.env.GENRE ?? 'science-fiction'
const queries = ['dune', 'tolk', 'herbert', 'le guin', 'harbor', 'almanac', 'the', 'misérables']
const median = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)]
let n = 0
async function time(path) {
  const runs = []
  for (let i = 0; i < 7; i += 1) {
    n += 1
    const started = performance.now()
    const response = await fetch(new URL(path, api), {
      headers: { 'x-forwarded-for': `10.251.${Math.floor(n / 250)}.${n % 250}` },
    })
    await response.text()
    if (!response.ok) throw new Error(`${path} → ${response.status}`)
    runs.push(performance.now() - started)
  }
  return median(runs)
}
const rows = []
for (const q of queries) {
  rows.push({
    q,
    suggestMs: +(await time(`/v1/search/suggest?q=${encodeURIComponent(q)}`)).toFixed(1),
    catalogOnlySearchMs: +(
      await time(`/v1/search?q=${encodeURIComponent(q)}&genre=${genre}`)
    ).toFixed(1),
  })
}
const avg = (key) => +(rows.reduce((s, r) => s + r[key], 0) / rows.length).toFixed(1)
console.log(
  JSON.stringify({
    rows,
    mean: { suggestMs: avg('suggestMs'), catalogOnlySearchMs: avg('catalogOnlySearchMs') },
  }),
)
