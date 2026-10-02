import type { z } from 'zod'
import {
  AccountDeletionScheduled,
  accountDeletionScheduledProps,
  accountDeletionScheduledSubject,
} from './templates/account-deletion-scheduled.js'
import {
  AccountSuspended,
  accountSuspendedProps,
  accountSuspendedSubject,
} from './templates/account-suspended.js'
import {
  EmailAlreadyRegistered,
  emailAlreadyRegisteredProps,
  emailAlreadyRegisteredSubject,
} from './templates/email-already-registered.js'
import {
  EmailChangeConfirm,
  emailChangeConfirmProps,
  emailChangeConfirmSubject,
} from './templates/email-change-confirm.js'
import {
  EmailChangeRequested,
  emailChangeRequestedProps,
  emailChangeRequestedSubject,
} from './templates/email-change-requested.js'
import { EmailChanged, emailChangedProps, emailChangedSubject } from './templates/email-changed.js'
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
import {
  ReviewDecision,
  reviewDecisionProps,
  reviewDecisionSubject,
} from './templates/review-decision.js'
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
  'email-change-confirm': {
    props: emailChangeConfirmProps,
    subject: () => emailChangeConfirmSubject,
    component: EmailChangeConfirm,
  },
  'email-change-requested': {
    props: emailChangeRequestedProps,
    subject: () => emailChangeRequestedSubject,
    component: EmailChangeRequested,
  },
  'email-changed': {
    props: emailChangedProps,
    subject: () => emailChangedSubject,
    component: EmailChanged,
  },
  'account-deletion-scheduled': {
    props: accountDeletionScheduledProps,
    subject: () => accountDeletionScheduledSubject,
    component: AccountDeletionScheduled,
  },
  'account-suspended': {
    props: accountSuspendedProps,
    subject: () => accountSuspendedSubject,
    component: AccountSuspended,
  },
  'review-decision': {
    props: reviewDecisionProps,
    subject: () => reviewDecisionSubject,
    component: ReviewDecision,
  },
} as const

export type EmailTemplateName = keyof typeof emailTemplates
export type EmailProps<Name extends EmailTemplateName> = z.infer<
  (typeof emailTemplates)[Name]['props']
>
