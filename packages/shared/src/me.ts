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
  /** Absolute URL of the Member's avatar, or null when none is uploaded. */
  avatarUrl: z.string().nullable(),
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

export const changeEmailRequestSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.').max(128),
  newEmail: emailSchema,
})
/** Same shape as verification: the change waits for the link sent to the new address. */
export const changeEmailResponseSchema = z.object({ status: z.literal('check_your_email') })

export const confirmEmailChangeRequestSchema = z.object({
  token: z.string().trim().min(1).max(200),
})
export const confirmEmailChangeResponseSchema = z.object({ status: z.literal('email_changed') })

/** A deleted account is disabled at once and erased this many days later (PRD §7.1, D-043). */
export const ACCOUNT_ERASE_AFTER_DAYS = 30

export const deleteAccountRequestSchema = z.object({
  password: z.string().min(1, 'Enter your password.').max(128),
})
export const deleteAccountResponseSchema = z.object({
  status: z.literal('account_deletion_scheduled'),
})

export type Me = z.infer<typeof meSchema>
export type UpdateMeRequest = z.infer<typeof updateMeRequestSchema>
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>
export type ChangeEmailRequest = z.infer<typeof changeEmailRequestSchema>

/** One signed-in device. The token hash never leaves the server. */
export const sessionInfoSchema = z.object({
  id: z.uuid(),
  /** A readable device name such as "Firefox on macOS". */
  device: z.string(),
  ip: z.string().nullable(),
  createdAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
  /** True for the session making this request. */
  current: z.boolean(),
})
export type SessionInfo = z.infer<typeof sessionInfoSchema>

export const sessionListResponseSchema = z.object({ items: z.array(sessionInfoSchema) })
export const sessionParamsSchema = z.object({ id: z.uuid() })
export const endSessionResponseSchema = z.object({ status: z.literal('session_ended') })

export const AVATAR_SIZE = 256
export const uploadAvatarResponseSchema = z.object({ avatarUrl: z.string() })
