import { expect, type Page } from '@playwright/test'
import { createDb, reviews, roles, userRoles, users } from '@reprint/db'
import { eq } from 'drizzle-orm'
import { newIdentity, testPassword, useOwnClientIp } from './identity.js'
import { linkInEmail, waitForEmail } from './mailpit.js'

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://reprint:reprint@localhost:5432/reprint'

/** Runs `work` against the e2e database (the same one the stack under test uses). */
async function withDb<T>(work: (db: ReturnType<typeof createDb>['db']) => Promise<T>) {
  const client = createDb(databaseUrl, { max: 1 })
  try {
    return await work(client.db)
  } finally {
    await client.close()
  }
}

/** Registers through the UI and confirms the email through Mailpit, leaving the browser signed in as a verified Member. */
export async function registerVerifiedMember(page: Page, prefix: string) {
  await useOwnClientIp(page)
  const identity = newIdentity(prefix)
  await page.goto('/register')
  await page.getByLabel('Email').fill(identity.email)
  await page.getByLabel('Username').fill(identity.username)
  await page.getByLabel('Password').fill(testPassword)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('region', { name: 'Email verification' })).toBeVisible()
  const message = await waitForEmail(identity.email, /confirm|verify/i)
  await page.goto(linkInEmail(message, '/verify-email'))
  await expect(page.getByRole('heading', { name: 'Email confirmed' })).toBeVisible()
  return identity
}

/** The Moderator role comes from the seed or an Admin in real life; a fresh e2e database has neither. */
export async function grantModerator(email: string) {
  await withDb(async (db) => {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
    const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, 'moderator'))
    if (!user || !role) throw new Error(`Cannot grant Moderator to ${email}`)
    await db.insert(userRoles).values({ userId: user.id, roleId: role.id }).onConflictDoNothing()
  })
}

/**
 * Moves a Member's review to the front of the Moderator queue and returns its id. The queue is
 * oldest first and paged, so on a seeded database a fresh review would be pages away.
 */
export async function moveReviewToQueueFront(email: string) {
  return withDb(async (db) => {
    const [row] = await db
      .select({ id: reviews.id })
      .from(reviews)
      .innerJoin(users, eq(users.id, reviews.userId))
      .where(eq(users.email, email))
    if (!row) throw new Error(`${email} has no review`)
    const longAgo = new Date(Date.UTC(2000, 0, 1) + Math.floor(Math.random() * 86_400_000))
    await db.update(reviews).set({ submittedAt: longAgo }).where(eq(reviews.id, row.id))
    return row.id
  })
}

/** Opens the Dune Book page, bringing it into the Catalog first when no other spec has. */
export async function openDunePage(page: Page) {
  await page.goto('/search?q=Dune')
  await page.getByRole('main').getByRole('link', { name: /Dune/ }).first().click()
  await expect(page).toHaveURL(/\/books\/[^/?]+$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Dune' })).toBeVisible()
}
