import { type ForgotPasswordRequest, forgotPasswordRequestSchema } from '@reprint/shared'
import { useFetcher } from 'react-router'
import { copy } from '../../copy/index.js'
import { AuthCard } from './auth-card.js'
import { type AuthField, AuthForm } from './auth-form.js'

const fields: AuthField<ForgotPasswordRequest>[] = [
  { name: 'email', label: copy.auth.emailLabel, type: 'email', autoComplete: 'email' },
]

export function ForgotPasswordPage() {
  const fetcher = useFetcher<{ status?: string }>()
  const c = copy.auth.forgot

  if (fetcher.data?.status === 'check_your_email') {
    return <AuthCard live title={c.checkEmailTitle} lead={c.checkEmailBody} />
  }

  return (
    <AuthCard
      title={c.title}
      lead={c.lead}
      footer={
        <p>
          <a className="text-link underline" href="/login">
            {c.backToLogin}
          </a>
        </p>
      }
    >
      <AuthForm
        schema={forgotPasswordRequestSchema}
        fields={fields}
        defaultValues={{ email: '' }}
        submitLabel={c.submit}
        fetcher={fetcher}
      />
    </AuthCard>
  )
}
