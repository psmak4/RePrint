import { type Database, roles, userRoles, users } from '@reprint/db'
import { emailSchema, passwordSchema, ROLES, usernameSchema } from '@reprint/shared'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { hashPassword } from '../auth/password.js'

const seedAdminInputSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  password: passwordSchema,
})

export type SeedAdminInput = z.input<typeof seedAdminInputSchema>

/** Raised for input the operator can fix; the message is safe to print. */
export class SeedAdminError extends Error {}

/**
 * Creates the first Admin (PRD §4): a verified account with the Member and Admin roles. It refuses
 * once any Admin exists, so it can be run once and never used to add more; later role changes
 * happen in the Admin area. The check and insert share one transaction.
 */
export async function createFirstAdmin(
  db: Database,
  input: SeedAdminInput,
): Promise<{ id: string; username: string }> {
  const parsed = seedAdminInputSchema.safeParse(input)
  if (!parsed.success) {
    throw new SeedAdminError(
      parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'),
    )
  }
  const { email, username, password } = parsed.data
  const passwordHash = await hashPassword(password)

  return db.transaction(async (tx) => {
    const roleRows = await tx.select().from(roles).where(eq(roles.name, ROLES.admin))
    const admin = roleRows[0]
    const member = (await tx.select().from(roles).where(eq(roles.name, ROLES.member)))[0]
    if (!admin || !member)
      throw new SeedAdminError('Roles are missing. Run `pnpm db:migrate` first.')

    const existing = await tx
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(eq(userRoles.roleId, admin.id))
      .limit(1)
    if (existing.length > 0)
      throw new SeedAdminError('An Admin already exists; nothing was changed.')

    const [user] = await tx
      .insert(users)
      .values({ email, username, passwordHash, displayName: username, emailVerifiedAt: new Date() })
      .onConflictDoNothing()
      .returning({ id: users.id, username: users.username })
    if (!user) throw new SeedAdminError('That email or username is already in use.')
    await tx.insert(userRoles).values([
      { userId: user.id, roleId: member.id },
      { userId: user.id, roleId: admin.id },
    ])
    return user
  })
}
