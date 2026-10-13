import { expect, test } from '@playwright/test'
import { expectNoA11yViolations } from '../support/a11y.js'
import { resetAuthorBooks, withAuthorLock } from '../support/accounts.js'
import { useOwnClientIp } from '../support/identity.js'

// The stub Source lists three Books by Tolkien; The Silmarillion is reachable only through his
// bibliography. Reaching The Hobbit makes him due, and opening his page imports the rest (D-203).
test("opening an Author's page brings in the rest of their Books", async ({ page }) => {
  test.setTimeout(90_000)
  await useOwnClientIp(page)
  await withAuthorLock(async () => {
    await resetAuthorBooks('J. R. R. Tolkien', 'The Silmarillion')
    await page.goto('/search?q=hobbit')
    await page
      .getByRole('main')
      .getByRole('link', { name: /The Hobbit/ })
      .first()
      .click()
    await expect(page.getByRole('heading', { level: 1, name: 'The Hobbit' })).toBeVisible()
    await page.getByRole('main').getByRole('link', { name: 'J. R. R. Tolkien' }).first().click()
    await expect(page.getByRole('heading', { level: 1, name: 'J. R. R. Tolkien' })).toBeVisible()

    const written = page.getByRole('region', { name: 'Written' })
    await expect(async () => {
      await page.reload()
      await expect(written.getByText('The Silmarillion').first()).toBeVisible({ timeout: 1_000 })
    }).toPass({ timeout: 30_000 })
    await expectNoA11yViolations(page)
  })
})
