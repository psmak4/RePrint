import { expect, test } from '@playwright/test'
import { expectNoA11yViolations } from '../support/a11y.js'
import { useOwnClientIp } from '../support/identity.js'

// The stub Source rates The Hobbit 4.29 from 500 readers; the Book page shows it apart (D-204).
test('a Book page shows Open Library readers’ rating apart from RePrint’s', async ({ page }) => {
  await useOwnClientIp(page)
  await page.goto('/search?q=hobbit')
  await page
    .getByRole('main')
    .getByRole('link', { name: /The Hobbit/ })
    .first()
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'The Hobbit' })).toBeVisible()
  const panel = page.getByRole('region', { name: 'Ratings elsewhere' })
  await expect(panel).toContainText('Open Library readers')
  await expect(panel).toContainText('500 ratings')
  await panel.getByRole('button', { name: 'Show breakdown' }).click()
  await expect(
    panel.getByRole('list', { name: 'Open Library readers’ ratings by stars' }),
  ).toBeVisible()
  await expectNoA11yViolations(page)
})
