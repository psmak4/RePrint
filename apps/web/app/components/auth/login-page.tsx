import { type LoginRequest, loginRequestSchema } from '@reprint/shared'
import { useFetcher } from 'react-router'
import { copy } from '../../copy/index.js'
import { AuthCard } from './auth-card.js'
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
    <AuthCard
      title={c.title}
      footer={
        <>
          <p>
            <a className="text-link underline" href="/forgot-password">
              {c.forgotLink}
            </a>
          </p>
          <p>
            {c.noAccount}{' '}
            <a className="font-semibold text-link underline" href="/register">
              {c.registerLink}
            </a>
          </p>
        </>
      }
    >
      <AuthForm
        schema={loginRequestSchema}
        fields={fields}
        defaultValues={{ email: '', password: '' }}
        submitLabel={c.submit}
        fetcher={fetcher}
      />
    </AuthCard>
  )
}
