import type { z } from 'zod'
import {
  EmailAlreadyRegistered,
  emailAlreadyRegisteredProps,
  emailAlreadyRegisteredSubject,
} from './templates/email-already-registered.js'
import {
  PasswordChanged,
  passwordChangedProps,
  passwordChangedSubject,
} from './templates/password-changed.js'
import {
  PasswordReset,
  passwordResetProps,
  passwordResetSubject,
} from './templates/password-reset.js'
import { VerifyEmail, verifyEmailProps, verifyEmailSubject } from './templates/verify-email.js'

/** Every email RePrint sends. To add one, add an entry here and a case in the `email.send` job payload. */
export const emailTemplates = {
  'verify-email': {
    props: verifyEmailProps,
    subject: () => verifyEmailSubject,
    component: VerifyEmail,
  },
  'email-already-registered': {
    props: emailAlreadyRegisteredProps,
    subject: () => emailAlreadyRegisteredSubject,
    component: EmailAlreadyRegistered,
  },
  'password-reset': {
    props: passwordResetProps,
    subject: () => passwordResetSubject,
    component: PasswordReset,
  },
  'password-changed': {
    props: passwordChangedProps,
    subject: () => passwordChangedSubject,
    component: PasswordChanged,
  },
} as const

export type EmailTemplateName = keyof typeof emailTemplates
export type EmailProps<Name extends EmailTemplateName> = z.infer<
  (typeof emailTemplates)[Name]['props']
>
