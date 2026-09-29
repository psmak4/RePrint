import { type LoginRequest, loginRequestSchema } from '@reprint/shared'
import { useFetcher } from 'react-router'
import { copy } from '../../copy/index.js'
import { type AuthField, AuthForm } from './auth-form.js'

const fields: AuthField<LoginRequest>[] = [
  { name: 'email', label: copy.auth.emailLabel, type: 'email', autoComplete: 'email' },
  {
    name: 'password',
    label: copy.auth.passwordLabel,
    type: 'password',
    autoComplete: 'current-password',
  },
]

export function LoginPage() {
  const fetcher = useFetcher()
  const c = copy.auth.login
  return (
    <section className="mx-auto max-w-md py-8">
      <h1 className="text-3xl font-semibold">{c.title}</h1>
      <AuthForm
        schema={loginRequestSchema}
        fields={fields}
        defaultValues={{ email: '', password: '' }}
        submitLabel={c.submit}
        fetcher={fetcher}
      />
      <p className="mt-6 text-sm">
        <a className="text-link underline" href="/forgot-password">
          {c.forgotLink}
        </a>
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        {c.noAccount}{' '}
        <a className="text-link underline" href="/register">
          {c.registerLink}
        </a>
      </p>
    </section>
  )
}
