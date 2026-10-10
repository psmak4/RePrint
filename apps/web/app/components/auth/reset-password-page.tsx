import { type ResetPasswordRequest, resetPasswordRequestSchema } from '@reprint/shared'
import { useFetcher } from 'react-router'
import { copy } from '../../copy/index.js'
import { AuthCard, AuthNextLink } from './auth-card.js'
import { type AuthField, AuthForm } from './auth-form.js'

const fields: AuthField<ResetPasswordRequest>[] = [
  {
    name: 'password',
    label: copy.auth.reset.newPasswordLabel,
    type: 'password',
    autoComplete: 'new-password',
    hint: copy.auth.reset.passwordHint,
  },
]

export function ResetPasswordPage({ token }: { token: string }) {
  const fetcher = useFetcher<{ status?: string; formError?: string }>()
  const c = copy.auth.reset

  if (fetcher.data?.status === 'password_reset') {
    return (
      <AuthCard live title={c.doneTitle} lead={c.doneBody}>
        <AuthNextLink href="/login">{c.logIn}</AuthNextLink>
      </AuthCard>
    )
  }

  if (!token) {
    return (
      <AuthCard title={c.invalidTitle}>
        <p role="alert" className="mt-3 text-[15px] leading-relaxed">
          {c.invalidBody}
        </p>
        <AuthNextLink href="/forgot-password">{c.requestNew}</AuthNextLink>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title={c.title}
      footer={
        fetcher.data?.formError ? (
          <p>
            <a className="text-link underline" href="/forgot-password">
              {c.requestNew}
            </a>
          </p>
        ) : undefined
      }
    >
      <AuthForm
        schema={resetPasswordRequestSchema}
        fields={fields}
        defaultValues={{ token, password: '' }}
        submitLabel={c.submit}
        fetcher={fetcher}
      />
    </AuthCard>
  )
}
