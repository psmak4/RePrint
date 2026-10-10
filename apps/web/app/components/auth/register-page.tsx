import { type RegisterRequest, registerRequestSchema } from '@reprint/shared'
import { useFetcher } from 'react-router'
import { z } from 'zod'
import { copy } from '../../copy/index.js'
import { AuthCard } from './auth-card.js'
import { type AuthField, AuthForm } from './auth-form.js'

// While signups are closed the invite code is required, so the form asks for it up front.
const inviteRequiredSchema = registerRequestSchema.extend({
  inviteCode: z.string().trim().min(1, copy.auth.inviteCodeRequired).max(100),
})

const baseFields: AuthField<RegisterRequest>[] = [
  { name: 'email', label: copy.auth.emailLabel, type: 'email', autoComplete: 'email' },
  {
    name: 'username',
    label: copy.auth.usernameLabel,
    type: 'text',
    autoComplete: 'username',
    hint: copy.auth.register.usernameHint,
  },
  {
    name: 'password',
    label: copy.auth.passwordLabel,
    type: 'password',
    autoComplete: 'new-password',
    hint: copy.auth.register.passwordHint,
  },
]

const inviteField: AuthField<RegisterRequest> = {
  name: 'inviteCode',
  label: copy.auth.inviteCodeLabel,
  type: 'text',
  autoComplete: 'off',
  hint: copy.auth.inviteCodeHint,
}

export function RegisterPage({ signupsOpen }: { signupsOpen: boolean }) {
  const fetcher = useFetcher<{ status?: string }>()
  const c = copy.auth.register

  if (fetcher.data?.status === 'check_your_email') {
    return <AuthCard live title={c.checkEmailTitle} lead={c.checkEmailBody} />
  }

  return (
    <AuthCard
      title={c.title}
      footer={
        <p>
          {c.haveAccount}{' '}
          <a className="font-semibold text-link underline" href="/login">
            {c.loginLink}
          </a>
        </p>
      }
    >
      <AuthForm
        schema={signupsOpen ? registerRequestSchema : inviteRequiredSchema}
        fields={signupsOpen ? baseFields : [...baseFields, inviteField]}
        defaultValues={
          signupsOpen
            ? { email: '', username: '', password: '' }
            : { email: '', username: '', password: '', inviteCode: '' }
        }
        submitLabel={c.submit}
        fetcher={fetcher}
      />
    </AuthCard>
  )
}
