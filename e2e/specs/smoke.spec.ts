import { expect, test } from '@playwright/test'
import { expectNoA11yViolations } from '../support/a11y.js'

test('home page renders and has no serious accessibility issues', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('main')).toBeVisible()
  await expectNoA11yViolations(page)
})

test('sends a nonce-based CSP and still hydrates', async ({ page }) => {
  const violations: string[] = []
  page.on('console', (message) => {
    if (/content security policy/i.test(message.text())) violations.push(message.text())
  })
  const response = await page.goto('/')
  const csp = response?.headers()['content-security-policy'] ?? ''
  expect(csp).toMatch(/script-src 'nonce-[^']+' 'strict-dynamic'/)
  expect(response?.headers()['strict-transport-security']).toContain('preload')
  // Hydration ran if React Router created its client-side router.
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean((globalThis as { __reactRouterDataRouter?: unknown }).__reactRouterDataRouter),
      ),
    )
    .toBe(true)
  await page.waitForLoadState('networkidle')
  expect(violations).toEqual([])
})
