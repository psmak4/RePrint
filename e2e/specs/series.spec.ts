import { expect, test } from '@playwright/test'
import { expectNoA11yViolations } from '../support/a11y.js'
import { resetSeriesSync, withSeriesLock } from '../support/accounts.js'

// The stub Source's Middle-earth Series: The Hobbit (1) and The Fellowship of the Ring (2). Each run
// starts with the Hobbit outside the Series, as if stored before the Series existed; viewing the
// Fellowship queues a Series sync, which the in-process worker runs and which adds it (D-199).
test('viewing a Book in a Series brings in the rest of the Series', async ({ page }) => {
  // The three projects share the Series, so their runs take turns.
  test.setTimeout(90_000)
  await withSeriesLock(async () => {
    await resetSeriesSync('Middle-earth', 'The Hobbit')
    await page.goto('/search?q=fellowship')
    await page
      .getByRole('main')
      .getByRole('link', { name: /The Fellowship of the Ring/ })
      .first()
      .click()
    await expect(
      page.getByRole('heading', { level: 1, name: 'The Fellowship of the Ring' }),
    ).toBeVisible()

    // Once the sync has run, the card lists the Hobbit and the pill knows the Series' size.
    const card = page.getByRole('region', { name: 'Middle-earth' })
    await expect(async () => {
      await page.reload()
      // `first()`: a Book without a Cover shows its title on the generated Cover too.
      await expect(card.getByText('The Hobbit').first()).toBeVisible({ timeout: 1_000 })
    }).toPass({ timeout: 20_000 })
    const pill = page.getByRole('link', { name: 'Middle-earth · Book 2 of 2' })
    await expect(pill).toBeVisible()
    await expectNoA11yViolations(page)

    await pill.click()
    await expect(page.getByRole('heading', { level: 1, name: 'Middle-earth' })).toBeVisible()
    await expect(page.getByRole('main').getByText('The Hobbit').first()).toBeVisible()
    await expectNoA11yViolations(page)
  })
})
