import { expect, test } from '@playwright/test'

// D-180: the web fonts are self-hosted, so no request leaves RePrint's origin for a font or stylesheet,
// and the CSP keeps `font-src 'self'` and `style-src 'self'`.
test('fonts load from our own origin and no Google domain is requested', async ({ page }) => {
  const requested: string[] = []
  page.on('request', (request) => requested.push(request.url()))
  const response = await page.goto('/')
  await page.waitForLoadState('networkidle')

  expect(requested.filter((url) => /google|gstatic/i.test(url))).toEqual([])

  const csp = response?.headers()['content-security-policy'] ?? ''
  expect(csp).toContain("font-src 'self'")
  expect(csp).toMatch(/style-src 'self'(;|$)/)

  const fontFiles = requested.filter((url) => /\.woff2(\?|$)/.test(url))
  expect(fontFiles.length).toBeGreaterThan(0)
  const origin = new URL(page.url()).origin
  for (const url of fontFiles) expect(new URL(url).origin).toBe(origin)

  // Both families are preloaded from the root route.
  const links = await page.locator('link[rel="preload"][as="font"]').all()
  const preloads = await Promise.all(links.map((link) => link.getAttribute('href')))
  expect(preloads.some((href) => /newsreader/.test(href ?? ''))).toBe(true)
  expect(preloads.some((href) => /instrument-sans/.test(href ?? ''))).toBe(true)

  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light')
})
