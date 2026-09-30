import { zodResolver } from '@hookform/resolvers/zod'
import {
  changeEmailRequestSchema,
  changePasswordRequestSchema,
  deleteAccountRequestSchema,
  type Me,
} from '@reprint/shared'
import { Button } from '@reprint/ui'
import { useEffect } from 'react'
import { type FieldValues, type Resolver, useForm } from 'react-hook-form'
import { useFetcher } from 'react-router'
import type { z } from 'zod'
import { copy } from '../../copy/index.js'
import { TextField } from './text-field.js'

type Result = {
  changed?: boolean
  pendingEmail?: string
  formError?: string
  fieldErrors?: Record<string, string>
}

/** Shared wiring: a shared Zod schema, one fetcher posting `{ intent, ...values }` as JSON. */
function useSecurityForm<T extends FieldValues>(schema: z.ZodType<T, T>, intent: string) {
  const fetcher = useFetcher<Result>()
  const form = useForm<T>({ resolver: zodResolver(schema) as Resolver<T> })
  const { setError, reset } = form
  const serverFields = fetcher.data?.fieldErrors
  useEffect(() => {
    for (const [name, message] of Object.entries(serverFields ?? {})) {
      setError(name as never, { type: 'server', message })
    }
  }, [serverFields, setError])
  const succeeded = Boolean(fetcher.data?.changed || fetcher.data?.pendingEmail)
  useEffect(() => {
    if (succeeded) reset()
  }, [succeeded, reset])
  const submit = form.handleSubmit((values) =>
    fetcher.submit({ intent, ...values } as never, { method: 'post', encType: 'application/json' }),
  )
  return { fetcher, form, submit, busy: fetcher.state !== 'idle' }
}

function FormError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-md border border-danger px-3 py-2 text-sm text-danger">
      {message}
    </p>
  )
}

/** Asks for the current password and a new address; the change waits for the emailed link. */
export function ChangeEmailForm({ me }: { me: Me }) {
  const c = copy.settings.security
  const { fetcher, form, submit, busy } = useSecurityForm(changeEmailRequestSchema, 'change-email')
  const { register, formState } = form
  const pending = fetcher.data?.pendingEmail
  return (
    <section aria-labelledby="email-heading">
      <h2 id="email-heading" className="text-xl font-semibold">
        {c.email.title}
      </h2>
      <p className="mt-1 text-muted-foreground">{c.email.lead(me.email)}</p>
      {pending ? (
        <div role="status" className="mt-4 rounded-md border border-border px-3 py-2">
          <p className="font-semibold">{c.email.pendingTitle}</p>
          <p className="text-sm">{c.email.pendingBody(pending)}</p>
        </div>
      ) : null}
      <form noValidate className="mt-4 flex flex-col gap-5" onSubmit={submit}>
        <FormError message={fetcher.data?.formError} />
        <TextField
          id="newEmail"
          label={c.email.newEmailLabel}
          type="email"
          autoComplete="email"
          error={formState.errors.newEmail?.message}
          registration={register('newEmail')}
        />
        <TextField
          id="email-currentPassword"
          label={c.currentPasswordLabel}
          type="password"
          autoComplete="current-password"
          error={formState.errors.currentPassword?.message}
          registration={register('currentPassword')}
        />
        <div>
          <Button type="submit" disabled={busy}>
            {busy ? c.email.submitting : c.email.submit}
          </Button>
        </div>
      </form>
    </section>
  )
}

export function ChangePasswordForm() {
  const c = copy.settings.security
  const { fetcher, form, submit, busy } = useSecurityForm(
    changePasswordRequestSchema,
    'change-password',
  )
  const { register, formState } = form
  return (
    <section aria-labelledby="password-heading">
      <h2 id="password-heading" className="text-xl font-semibold">
        {c.password.title}
      </h2>
      <p className="mt-1 text-muted-foreground">{c.password.lead}</p>
      <form noValidate className="mt-4 flex flex-col gap-5" onSubmit={submit}>
        <FormError message={fetcher.data?.formError} />
        <TextField
          id="password-currentPassword"
          label={c.currentPasswordLabel}
          type="password"
          autoComplete="current-password"
          error={formState.errors.currentPassword?.message}
          registration={register('currentPassword')}
        />
        <TextField
          id="newPassword"
          label={c.password.newPasswordLabel}
          type="password"
          autoComplete="new-password"
          hint={c.password.newPasswordHint}
          error={formState.errors.newPassword?.message}
          registration={register('newPassword')}
        />
        <div className="flex items-center gap-4">
          <Button type="submit" disabled={busy}>
            {busy ? c.password.submitting : c.password.submit}
          </Button>
          {fetcher.data?.changed && !busy ? (
            <p role="status" className="text-sm">
              {c.password.done}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  )
}

/** Asks for the password again and spells out the 30-day erase before anything is sent. */
export function DeleteAccountForm() {
  const c = copy.settings.security.delete
  const { fetcher, form, submit, busy } = useSecurityForm(
    deleteAccountRequestSchema,
    'delete-account',
  )
  const { register, formState } = form
  return (
    <section aria-labelledby="delete-heading">
      <h2 id="delete-heading" className="text-xl font-semibold text-danger">
        {c.title}
      </h2>
      <p className="mt-1 text-muted-foreground">{c.lead}</p>
      <p className="mt-2">{c.erase}</p>
      <form noValidate className="mt-4 flex flex-col gap-5" onSubmit={submit}>
        <FormError message={fetcher.data?.formError} />
        <TextField
          id="delete-password"
          label={c.passwordLabel}
          type="password"
          autoComplete="current-password"
          error={formState.errors.password?.message}
          registration={register('password')}
        />
        <div>
          <Button
            type="submit"
            variant="outline"
            className="border-danger text-danger"
            disabled={busy}
          >
            {busy ? c.submitting : c.submit}
          </Button>
        </div>
      </form>
    </section>
  )
}
