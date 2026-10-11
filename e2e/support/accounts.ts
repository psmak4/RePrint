import { expect, type Page } from '@playwright/test'
import {
  createDb,
  reviewClaims,
  reviewReports,
  reviews,
  roles,
  userRoles,
  users,
} from '@reprint/db'
import { and, eq, lt } from 'drizzle-orm'
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

/** Roles come from the seed or an Admin in real life; a fresh e2e database has neither. */
async function grantRole(email: string, roleName: 'moderator' | 'admin') {
  await withDb(async (db) => {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
    const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, roleName))
    if (!user || !role) throw new Error(`Cannot grant ${roleName} to ${email}`)
    await db.insert(userRoles).values({ userId: user.id, roleId: role.id }).onConflictDoNothing()
  })
}

export const grantModerator = (email: string) => grantRole(email, 'moderator')
export const grantAdmin = (email: string) => grantRole(email, 'admin')

/** Undoes `moveReviewToQueueFront`, so an Approved review is among the newest on its Book page. */
export async function restoreReviewSubmittedAt(email: string) {
  await withDb(async (db) => {
    const [row] = await db
      .select({ id: reviews.id })
      .from(reviews)
      .innerJoin(users, eq(users.id, reviews.userId))
      .where(eq(users.email, email))
    if (!row) throw new Error(`${email} has no review`)
    await db.update(reviews).set({ submittedAt: new Date() }).where(eq(reviews.id, row.id))
  })
}

/** Arbitrary; what matters is that every queue spec takes the same key. */
const queueLockKey = 7_311_204
/** Items moved to a queue front are dated in 2000; anything that old was left there. */
const queueFrontCutoff = new Date(Date.UTC(2001, 0, 1))
let queueLockHeld = false

function assertQueueLockHeld(helper: string) {
  if (!queueLockHeld) throw new Error(`${helper} must run inside withQueueLock`)
}

/**
 * Runs `work` holding a Postgres advisory lock shared by every spec that moves items to a Moderator
 * queue front and decides them. Specs run in parallel, and after a decision the review queue opens
 * the next item, which claims it (D-126), so without the lock one spec's Moderator can claim
 * another spec's review and turn off its decision buttons. On entry it clears what earlier holders
 * or failed runs left: every review claim, and pending reviews or open reports still dated in 2000
 * go back to now (D-189). A spec must let the queue finish opening the next review before `work`
 * returns, so that claim lands before the next holder clears it.
 *
 * A failed test ends its worker process, which closes the connection and drops the lock with it.
 */
export async function withQueueLock<T>(work: () => Promise<T>): Promise<T> {
  const client = createDb(databaseUrl, { max: 1 })
  try {
    await client.sql`select pg_advisory_lock(${queueLockKey}::bigint)`
    try {
      const now = new Date()
      await client.db.delete(reviewClaims)
      await client.db
        .update(reviews)
        .set({ submittedAt: now })
        .where(and(eq(reviews.status, 'pending'), lt(reviews.submittedAt, queueFrontCutoff)))
      await client.db
        .update(reviewReports)
        .set({ createdAt: now })
        .where(and(eq(reviewReports.status, 'open'), lt(reviewReports.createdAt, queueFrontCutoff)))
      queueLockHeld = true
      return await work()
    } finally {
      queueLockHeld = false
      await client.sql`select pg_advisory_unlock(${queueLockKey}::bigint)`
    }
  } finally {
    await client.close()
  }
}

/** Moves a Member's open reports to the front of the oldest-first reports queue. Call it inside `withQueueLock`. */
export async function moveReportsToQueueFront(authorEmail: string) {
  assertQueueLockHeld('moveReportsToQueueFront')
  await withDb(async (db) => {
    const [row] = await db
      .select({ id: reviews.id })
      .from(reviews)
      .innerJoin(users, eq(users.id, reviews.userId))
      .where(eq(users.email, authorEmail))
    if (!row) throw new Error(`${authorEmail} has no review`)
    const longAgo = new Date(Date.UTC(2000, 0, 1) + Math.floor(Math.random() * 86_400_000))
    await db
      .update(reviewReports)
      .set({ createdAt: longAgo })
      .where(eq(reviewReports.reviewId, row.id))
  })
}

/**
 * Moves a Member's review to the front of the Moderator queue and returns its id. The queue is
 * oldest first and paged, so on a seeded database a fresh review would be pages away. Call it
 * inside `withQueueLock`.
 */
export async function moveReviewToQueueFront(email: string) {
  assertQueueLockHeld('moveReviewToQueueFront')
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
