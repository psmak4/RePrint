import { type ResetPasswordRequest, resetPasswordRequestSchema } from '@reprint/shared'
import { useFetcher } from 'react-router'
import { copy } from '../../copy/index.js'
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
      <section className="mx-auto max-w-md py-8" aria-live="polite">
        <h1 className="text-3xl font-semibold">{c.doneTitle}</h1>
        <p className="mt-4 text-muted-foreground">{c.doneBody}</p>
        <p className="mt-6">
          <a className="text-link underline" href="/login">
            {c.logIn}
          </a>
        </p>
      </section>
    )
  }

  if (!token) {
    return (
      <section className="mx-auto max-w-md py-8">
        <h1 className="text-3xl font-semibold">{c.invalidTitle}</h1>
        <p role="alert" className="mt-4">
          {c.invalidBody}
        </p>
        <p className="mt-6">
          <a className="text-link underline" href="/forgot-password">
            {c.requestNew}
          </a>
        </p>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-md py-8">
      <h1 className="text-3xl font-semibold">{c.title}</h1>
      <AuthForm
        schema={resetPasswordRequestSchema}
        fields={fields}
        defaultValues={{ token, password: '' }}
        submitLabel={c.submit}
        fetcher={fetcher}
      />
      {fetcher.data?.formError ? (
        <p className="mt-6 text-sm">
          <a className="text-link underline" href="/forgot-password">
            {c.requestNew}
          </a>
        </p>
      ) : null}
    </section>
  )
}
