import { expect, test } from '@playwright/test'
import { expectNoA11yViolations } from '../support/a11y.js'
import { openDunePage, registerVerifiedMember } from '../support/accounts.js'

test('a Member shelves a Book, changes its Shelf, and views the library and profile', async ({
  page,
}) => {
  const member = await registerVerifiedMember(page, 'shelver')

  // From the Book page.
  await openDunePage(page)
  const onBookPage = page.getByRole('combobox', { name: 'Shelf for Dune' })
  await onBookPage.selectOption('want_to_read')
  await expect(onBookPage).toHaveValue('want_to_read')
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Shelf for Dune' })).toHaveValue('want_to_read')

  // From search results, which show the same Shelf and change it.
  await page.goto('/search?q=Dune')
  const inResults = page.getByRole('main').getByRole('combobox', { name: 'Shelf for Dune' }).first()
  await expect(inResults).toHaveValue('want_to_read')
  await expectNoA11yViolations(page)
  await inResults.selectOption('reading')
  await expect(inResults).toHaveValue('reading')

  // The library lists it under the new Shelf, with counts per tab.
  await page.goto(`/u/${member.username}/library`)
  await expect(page.getByRole('heading', { level: 1, name: 'Your library' })).toBeVisible()
  const tabs = page.getByRole('navigation', { name: 'Shelves' })
  await expect(tabs.getByRole('link', { name: 'Reading (1)' })).toBeVisible()
  await expect(tabs.getByRole('link', { name: 'Want to Read (0)' })).toBeVisible()
  await expectNoA11yViolations(page)

  await tabs.getByRole('link', { name: 'Reading (1)' }).click()
  await expect(page).toHaveURL(/shelf=reading/)
  const inLibrary = page.getByRole('combobox', { name: 'Shelf for Dune' })
  await expect(inLibrary).toHaveValue('reading')
  await inLibrary.selectOption('read')
  await expect(inLibrary).toHaveValue('read')
  await page.reload()
  await expect(page.getByText('Nothing on this shelf yet.')).toBeVisible()
  await expect(tabs.getByRole('link', { name: 'Read (1)' })).toBeVisible()
  await expect(tabs.getByRole('link', { name: 'Reading (0)' })).toBeVisible()
  await expectNoA11yViolations(page)

  // The profile links to the library, which is public by default.
  await page.goto(`/u/${member.username}`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expectNoA11yViolations(page)
  await page
    .getByRole('navigation', { name: 'Profile sections' })
    .getByRole('link', { name: 'Library' })
    .click()
  await expect(page).toHaveURL(new RegExp(`/u/${member.username}/library`))
  await expect(page.getByRole('combobox', { name: 'Shelf for Dune' })).toHaveValue('read')
})

test('a private library is hidden from another signed-in Member but not its owner', async ({
  browser,
  page,
}) => {
  const owner = await registerVerifiedMember(page, 'privatelib')
  await openDunePage(page)
  await page.getByRole('combobox', { name: 'Shelf for Dune' }).selectOption('read')
  await expect(page.getByRole('combobox', { name: 'Shelf for Dune' })).toHaveValue('read')

  await page.goto('/settings/profile')
  await page.getByLabel('Show my library on my profile').uncheck()
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Your profile was saved.')).toBeVisible()

  // The owner still sees it.
  await page.goto(`/u/${owner.username}/library`)
  await expect(page.getByRole('heading', { level: 1, name: 'Your library' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Shelf for Dune' })).toHaveValue('read')

  // Another signed-in Member sees the private state, and no Library tab on the profile.
  const otherContext = await browser.newContext()
  try {
    const other = await otherContext.newPage()
    await registerVerifiedMember(other, 'curious')
    await other.goto(`/u/${owner.username}/library`)
    await expect(
      other.getByRole('heading', { level: 1, name: 'This library is private' }),
    ).toBeVisible()
    await expect(other.getByRole('combobox', { name: 'Shelf for Dune' })).toHaveCount(0)
    await expectNoA11yViolations(other)

    await other.goto(`/u/${owner.username}`)
    await expect(other.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(
      other.getByRole('navigation', { name: 'Profile sections' }).getByRole('link', {
        name: 'Library',
      }),
    ).toHaveCount(0)
  } finally {
    await otherContext.close()
  }
})
