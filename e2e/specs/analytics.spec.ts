import { expect, test } from '@playwright/test'

// The web server runs with VITE_ANALYTICS_DOMAIN set and the script URL pointing at this stub (D-167).

test('analytics loads under the CSP and sets no cookies', async ({ page }) => {
  const violations: string[] = []
  page.on('console', (message) => {
    if (/content security policy/i.test(message.text())) violations.push(message.text())
  })
  await page.route('**/analytics-test.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: 'globalThis.__analyticsLoaded = true' }),
  )
  const response = await page.goto('/')
  expect(response?.headers()['set-cookie']).toBeUndefined()

  const script = page.locator('script[data-domain="reprint.test"]')
  await expect(script).toHaveCount(1)
  await expect
    .poll(() =>
      page.evaluate(() => (globalThis as { __analyticsLoaded?: boolean }).__analyticsLoaded),
    )
    .toBe(true)
  expect(
    await page.evaluate(
      () => (globalThis as unknown as { document: { cookie: string } }).document.cookie,
    ),
  ).toBe('')
  expect(await page.context().cookies()).toEqual([])
  expect(violations).toEqual([])
})
