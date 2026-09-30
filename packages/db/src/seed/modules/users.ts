import { inArray } from 'drizzle-orm'
import { roles, userRoles, users } from '../../schema/index.js'
import type { SeedModule } from '../registry.js'

/** Every seeded account signs in with this password (local development only, see docs/local-dev.md). */
export const DEV_PASSWORD = 'reprint-dev-password'

/**
 * Argon2id hash of `DEV_PASSWORD` with the API's parameters (19 MiB, 2 iterations, parallelism 1).
 * Precomputed so seeding stays deterministic and `packages/db` needs no hashing dependency; the
 * API has a test that the hash verifies against `DEV_PASSWORD`.
 */
export const DEV_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$3jOCNJ4qb6EZ5UEIoB7QLQ$/qBKXXBg6wqnFUhUmRhm7SNq/OZKR/wzc2/XdL49O+o'

export const SEED_USER_COUNT = 50

type Kind = 'admin' | 'moderator' | 'member' | 'unverified' | 'suspended' | 'deleted'

/** The mix of the 50 accounts, in the order they are created. */
const KINDS: readonly (readonly [Kind, number])[] = [
  ['admin', 2],
  ['moderator', 3],
  ['member', 34],
  ['unverified', 5],
  ['suspended', 3],
  ['deleted', 3],
]

const FIRST = ['ada', 'ben', 'cleo', 'dev', 'edie', 'finn', 'gia', 'hugo', 'iris', 'jude'] as const
const LAST = ['reader', 'shelf', 'page', 'spine', 'folio', 'quill', 'verso'] as const

export const usersSeed: SeedModule = {
  name: 'users',
  async run({ db, random }) {
    const roleRows = await db
      .select({ id: roles.id, name: roles.name })
      .from(roles)
      .where(inArray(roles.name, ['member', 'moderator', 'admin']))
    const roleId = (name: string) => {
      const row = roleRows.find((r) => r.name === name)
      if (!row) throw new Error(`role "${name}" is missing; run migrations first`)
      return row.id
    }

    const accounts: (typeof users.$inferInsert)[] = []
    const grants: (typeof userRoles.$inferInsert)[] = []
    for (const [kind, count] of KINDS) {
      for (let i = 1; i <= count; i++) {
        const id = random.id()
        // Named accounts (`admin1`, `moderator1`, ...) are easy to remember; the rest get a pen name.
        const named = kind === 'member' ? i <= 2 : true
        const username = named
          ? `${kind}${i}`
          : `${random.pick(FIRST)}_${random.pick(LAST)}_${accounts.length}`
        const createdAt = new Date(random.now().getTime() - random.int(1, 400) * 86_400_000)
        accounts.push({
          id,
          email: `${username}@example.test`,
          username,
          passwordHash: DEV_PASSWORD_HASH,
          displayName: `${username.replaceAll('_', ' ')}`,
          emailVerifiedAt: kind === 'unverified' ? null : createdAt,
          status: kind === 'suspended' ? 'suspended' : kind === 'deleted' ? 'deleted' : 'active',
          deletedAt: kind === 'deleted' ? random.now() : null,
          libraryPublic: random.int(0, 4) > 0,
          createdAt,
          updatedAt: createdAt,
        })
        grants.push({ userId: id, roleId: roleId('member') })
        if (kind === 'moderator' || kind === 'admin') {
          grants.push({ userId: id, roleId: roleId(kind) })
        }
      }
    }
    await db.insert(users).values(accounts)
    await db.insert(userRoles).values(grants)
  },
}
