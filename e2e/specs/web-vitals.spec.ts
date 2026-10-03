import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { expect, test } from '@playwright/test'

// PRD §11 targets for the Book page: LCP 2.5 s or less on a mid-range phone over 4G, INP 200 ms or
// less, CLS 0.1 or less. docs/performance.md describes the profile and what to do when this fails.
const TARGETS = { lcp: 2500, inp: 200, cls: 0.1 }

// Slow 4G, as Lighthouse's mobile profile defines it, and a mid-range phone's CPU.
const NETWORK = {
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
}
const CPU_SLOWDOWN = 4

// The package's `exports` hide its files, so find the folder through `main`'s neighbour: the entry point.
const webVitalsScript = readFileSync(
  join(dirname(createRequire(import.meta.url).resolve('web-vitals')), 'web-vitals.iife.js'),
  'utf8',
)

interface Vitals {
  lcp?: number
  cls?: number
  inp?: number
}

test('Book page meets the Core Web Vitals targets on a throttled mobile profile', async ({
  page,
  browserName,
}, testInfo) => {
  // CDP throttling exists only in Chromium; the mobile project (Pixel 7) is the phone profile.
  test.skip(
    browserName !== 'chromium' || testInfo.project.name !== 'mobile',
    'Throttled mobile profile: runs in the mobile (Pixel 7) project only',
  )

  // Find the Book page through the ISBN search, without throttling.
  await page.goto('/search?q=9780547928227')
  await expect(page).toHaveURL(/\/books\/[^/?]+$/)
  const bookUrl = page.url()

  // The IIFE's `var` stays local to the init script, so publish it.
  await page.addInitScript(`${webVitalsScript}\n;globalThis.webVitals = webVitals;`)
  await page.addInitScript(() => {
    const vitals: Record<string, number> = {}
    const { webVitals } = globalThis as unknown as {
      webVitals: Record<
        string,
        (report: (metric: { value: number }) => void, options?: object) => void
      >
    }
    const record = (name: string) => (metric: { value: number }) => {
      vitals[name] = metric.value
    }
    webVitals.onLCP?.(record('lcp'), { reportAllChanges: true })
    webVitals.onCLS?.(record('cls'), { reportAllChanges: true })
    webVitals.onINP?.(record('inp'), { reportAllChanges: true })
    ;(globalThis as { __vitals?: unknown }).__vitals = vitals
  })

  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', { offline: false, ...NETWORK })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN })
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })

  await page.goto(bookUrl, { waitUntil: 'load' })
  await expect(page.getByRole('heading', { level: 1, name: 'The Hobbit' })).toBeVisible()
  await page.waitForLoadState('networkidle')
  // Hydration must finish before the interaction counts toward INP.
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean((globalThis as { __reactRouterDataRouter?: unknown }).__reactRouterDataRouter),
      ),
    )
    .toBe(true)

  // INP needs interactions: focus the header search box and type, which also opens suggestions.
  const search = page.getByRole('combobox', { name: 'Search books and authors' })
  await search.click()
  await search.pressSequentially('dune', { delay: 50 })
  await page.waitForTimeout(500)

  // LCP and CLS settle when the page is hidden; INP reports on every change.
  await page.evaluate(`(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })()`)
  const vitals = await page.evaluate(() => (globalThis as { __vitals?: Vitals }).__vitals ?? {})

  testInfo.annotations.push({ type: 'web-vitals', description: JSON.stringify(vitals) })
  console.log(`Book page web vitals: ${JSON.stringify(vitals)}`)

  expect(vitals.lcp, 'LCP was recorded').toBeDefined()
  expect(vitals.lcp ?? Infinity, 'LCP (ms)').toBeLessThanOrEqual(TARGETS.lcp)
  expect(vitals.cls ?? 0, 'CLS').toBeLessThanOrEqual(TARGETS.cls)
  expect(vitals.inp ?? 0, 'INP (ms)').toBeLessThanOrEqual(TARGETS.inp)
})
