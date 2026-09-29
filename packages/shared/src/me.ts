import { z } from 'zod'
import { emailSchema, passwordSchema, usernameSchema } from './auth.js'

export const DISPLAY_NAME_MAX_LENGTH = 50
export const BIO_MAX_LENGTH = 280

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a display name.')
  .max(DISPLAY_NAME_MAX_LENGTH, `Use at most ${DISPLAY_NAME_MAX_LENGTH} characters.`)

/** An empty bio is stored as no bio. */
export const bioSchema = z
  .string()
  .trim()
  .max(BIO_MAX_LENGTH, `Use at most ${BIO_MAX_LENGTH} characters.`)
  .transform((bio) => (bio === '' ? null : bio))
  .nullable()

/** The signed-in Member's own account, including the private fields the viewer omits. */
export const meSchema = z.object({
  id: z.uuid(),
  email: emailSchema,
  username: usernameSchema,
  displayName: z.string(),
  bio: z.string().nullable(),
  verified: z.boolean(),
  libraryPublic: z.boolean(),
  emailReviewDecisions: z.boolean(),
})

/** Only the fields sent are changed; an empty update is refused. */
export const updateMeRequestSchema = z
  .strictObject({
    displayName: displayNameSchema,
    bio: bioSchema,
    libraryPublic: z.boolean(),
    emailReviewDecisions: z.boolean(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Send at least one field to change.')

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.').max(128),
  newPassword: passwordSchema,
})
export const changePasswordResponseSchema = z.object({ status: z.literal('password_changed') })

export type Me = z.infer<typeof meSchema>
export type UpdateMeRequest = z.infer<typeof updateMeRequestSchema>
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>
