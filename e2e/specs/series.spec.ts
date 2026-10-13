import { expect, test } from '@playwright/test'
import { expectNoA11yViolations } from '../support/a11y.js'
import { registerVerifiedMember, resetSeriesSync, withSeriesLock } from '../support/accounts.js'

// The stub Source's Middle-earth Series: The Hobbit (1) and The Fellowship of the Ring (2). Each run
// starts with the Hobbit outside the Series, as if stored before the Series existed, and the
// Fellowship, when stored, as a Book a Series sync brought in. Clicking the Fellowship in search
// reaches it (D-200), which queues a Series sync that the in-process worker runs and which adds
// the Hobbit (D-199).
test('opening a Book in a Series from search brings in the rest of the Series', async ({
  page,
}) => {
  // The three projects share the Series, so their runs take turns.
  test.setTimeout(90_000)
  await withSeriesLock(async () => {
    await resetSeriesSync('Middle-earth', 'The Hobbit', 'The Fellowship of the Ring')
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

// The Book page stays mounted from one Book to the next, so nothing from the last Book may carry
// over: the next Book's Shelf, and the Book a shelf change goes to.
test('moving to the next Book in a Series shows that Book’s Shelf', async ({ page }) => {
  test.setTimeout(90_000)
  await registerVerifiedMember(page, 'nextbook')
  await withSeriesLock(async () => {
    await resetSeriesSync('Middle-earth', 'The Hobbit', 'The Fellowship of the Ring')
    await page.goto('/search?q=fellowship')
    await page
      .getByRole('main')
      .getByRole('link', { name: /The Fellowship of the Ring/ })
      .first()
      .click()
    await expect(
      page.getByRole('heading', { level: 1, name: 'The Fellowship of the Ring' }),
    ).toBeVisible()
    const card = page.getByRole('region', { name: 'Middle-earth' })
    await expect(async () => {
      await page.reload()
      await expect(card.getByText('The Hobbit').first()).toBeVisible({ timeout: 1_000 })
    }).toPass({ timeout: 20_000 })

    const fellowshipShelf = page.getByLabel('Shelf for The Fellowship of the Ring')
    await fellowshipShelf.selectOption('reading')
    await expect(fellowshipShelf).toHaveValue('reading')
    await expect(fellowshipShelf).toBeEnabled()

    await card
      .getByRole('link', { name: /The Hobbit/ })
      .first()
      .click()
    await expect(page.getByRole('heading', { level: 1, name: 'The Hobbit' })).toBeVisible()
    const hobbitShelf = page.getByLabel('Shelf for The Hobbit')
    await expect(hobbitShelf).toHaveValue('')

    // A shelf change here goes to the Hobbit, and the Fellowship keeps its own Shelf.
    await hobbitShelf.selectOption('want_to_read')
    await expect(hobbitShelf).toHaveValue('want_to_read')
    await expect(hobbitShelf).toBeEnabled()
    await page.reload()
    await expect(page.getByLabel('Shelf for The Hobbit')).toHaveValue('want_to_read')
    await page.goBack()
    await page.reload()
    await expect(page.getByLabel('Shelf for The Fellowship of the Ring')).toHaveValue('reading')
  })
})
