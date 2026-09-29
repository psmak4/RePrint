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
})

/** Same body whether the email was new or already registered (D-048). */
export const registerResponseSchema = z.object({ status: z.literal('check_your_email') })

export type RegisterRequest = z.infer<typeof registerRequestSchema>
export type RegisterResponse = z.infer<typeof registerResponseSchema>
