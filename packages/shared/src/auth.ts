import { z } from 'zod'

export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 30
export const PASSWORD_MIN_LENGTH = 12
/** Upper bound so a huge body can't be used to make the server hash megabytes (Argon2 cost). */
export const PASSWORD_MAX_LENGTH = 128

/** 3 to 30 letters, numbers, or underscores (PRD §7.1). Uniqueness ignores case in the database. */
export const usernameSchema = z
  .string()
  .min(USERNAME_MIN_LENGTH, `Use at least ${USERNAME_MIN_LENGTH} characters.`)
  .max(USERNAME_MAX_LENGTH, `Use at most ${USERNAME_MAX_LENGTH} characters.`)
  .regex(/^[A-Za-z0-9_]+$/, 'Use only letters, numbers, and underscores.')

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters.`)

export const emailSchema = z.string().trim().max(254).pipe(z.email('Enter a valid email address.'))

export const registerRequestSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  password: passwordSchema,
  /** Required only while signups are closed (private beta, D-014). */
  inviteCode: z.string().trim().min(1).max(100).optional(),
})

/** The signed-in Member as the web sees it. Permission names only, never role names (PRD §4). */
export const viewerSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  displayName: z.string(),
  verified: z.boolean(),
  permissions: z.array(z.string()),
})

/** What the web needs on every page: whether signups are open, and the viewer (`null` for Visitors). */
export const sessionResponseSchema = z.object({
  signupsOpen: z.boolean(),
  viewer: viewerSchema.nullable(),
})

export const verifyEmailRequestSchema = z.object({ token: z.string().trim().min(1).max(200) })
export const verifyEmailResponseSchema = z.object({ status: z.literal('verified') })

/** Signed-in callers may omit `email`; the API then uses the session's address (D-078). */
export const resendVerificationRequestSchema = z.object({ email: emailSchema.optional() })

/** Same body whether the email was new or already registered (D-048). */
export const registerResponseSchema = z.object({ status: z.literal('check_your_email') })

export type Viewer = z.infer<typeof viewerSchema>
export type SessionResponse = z.infer<typeof sessionResponseSchema>
export type RegisterRequest = z.infer<typeof registerRequestSchema>
export type RegisterResponse = z.infer<typeof registerResponseSchema>
