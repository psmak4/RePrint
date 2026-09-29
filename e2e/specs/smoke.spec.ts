import { expect, test } from '@playwright/test'
import { expectNoA11yViolations } from '../support/a11y.js'

test('home page renders and has no serious accessibility issues', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('main')).toBeVisible()
  await expectNoA11yViolations(page)
})
