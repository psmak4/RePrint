import type { z } from 'zod'
import { VerifyEmail, verifyEmailProps, verifyEmailSubject } from './templates/verify-email.js'

/** Every email RePrint sends. To add one, add an entry here and a case in the `email.send` job payload. */
export const emailTemplates = {
  'verify-email': {
    props: verifyEmailProps,
    subject: () => verifyEmailSubject,
    component: VerifyEmail,
  },
} as const

export type EmailTemplateName = keyof typeof emailTemplates
export type EmailProps<Name extends EmailTemplateName> = z.infer<
  (typeof emailTemplates)[Name]['props']
>
