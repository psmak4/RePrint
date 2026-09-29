import { type ForgotPasswordRequest, forgotPasswordRequestSchema } from '@reprint/shared'
import { useFetcher } from 'react-router'
import { copy } from '../../copy/index.js'
import { type AuthField, AuthForm } from './auth-form.js'

const fields: AuthField<ForgotPasswordRequest>[] = [
  { name: 'email', label: copy.auth.emailLabel, type: 'email', autoComplete: 'email' },
]

export function ForgotPasswordPage() {
  const fetcher = useFetcher<{ status?: string }>()
  const c = copy.auth.forgot

  if (fetcher.data?.status === 'check_your_email') {
    return (
      <section className="mx-auto max-w-md py-8" aria-live="polite">
        <h1 className="text-3xl font-semibold">{c.checkEmailTitle}</h1>
        <p className="mt-4 text-muted-foreground">{c.checkEmailBody}</p>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-md py-8">
      <h1 className="text-3xl font-semibold">{c.title}</h1>
      <p className="mt-4 text-muted-foreground">{c.lead}</p>
      <AuthForm
        schema={forgotPasswordRequestSchema}
        fields={fields}
        defaultValues={{ email: '' }}
        submitLabel={c.submit}
        fetcher={fetcher}
      />
      <p className="mt-6 text-sm">
        <a className="text-link underline" href="/login">
          {c.backToLogin}
        </a>
      </p>
    </section>
  )
}
