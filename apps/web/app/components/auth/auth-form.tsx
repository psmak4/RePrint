import { zodResolver } from '@hookform/resolvers/zod'
import { Button, Input, Label } from '@reprint/ui'
import { useEffect } from 'react'
import { type FieldValues, type Path, useForm } from 'react-hook-form'
import type { FetcherWithComponents } from 'react-router'
import type { z } from 'zod'
import { copy } from '../../copy/index.js'

export type AuthField<T> = {
  name: Path<T> & string
  label: string
  type: 'email' | 'text' | 'password'
  autoComplete: string
  hint?: string
}

/** What a form action sends back on failure (see `toFormFailure` in `lib/auth.server.ts`). */
type FailureData = { formError?: string; fieldErrors?: Record<string, string> }

function failureOf(data: unknown): FailureData {
  if (typeof data !== 'object' || data === null) return {}
  return data as FailureData
}

export type AuthFormProps<T extends FieldValues> = {
  schema: z.ZodType<T, T>
  fields: AuthField<T>[]
  defaultValues: T
  submitLabel: string
  fetcher: FetcherWithComponents<unknown>
}

/** A React Hook Form validated with a shared Zod schema. Server field errors land on the fields. */
export function AuthForm<T extends FieldValues>({
  schema,
  fields,
  defaultValues,
  submitLabel,
  fetcher,
}: AuthFormProps<T>) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<T>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues as never,
  })

  const failure = failureOf(fetcher.data)
  useEffect(() => {
    for (const [name, message] of Object.entries(failure.fieldErrors ?? {})) {
      setError(name as Path<T>, { type: 'server', message })
    }
  }, [failure.fieldErrors, setError])

  const busy = fetcher.state !== 'idle'

  return (
    <form
      noValidate
      className="mt-6 flex flex-col gap-5"
      onSubmit={handleSubmit((values) =>
        fetcher.submit(values as never, { method: 'post', encType: 'application/json' }),
      )}
    >
      {failure.formError ? (
        <p role="alert" className="rounded-md border border-danger px-3 py-2 text-sm text-danger">
          {failure.formError}
        </p>
      ) : null}
      {fields.map((field) => {
        const message = errors[field.name]?.message
        const errorId = `${field.name}-error`
        const hintId = `${field.name}-hint`
        return (
          <div key={field.name} className="flex flex-col gap-2">
            <Label htmlFor={field.name}>{field.label}</Label>
            <Input
              id={field.name}
              type={field.type}
              autoComplete={field.autoComplete}
              aria-invalid={message ? true : undefined}
              aria-describedby={
                [field.hint ? hintId : null, message ? errorId : null].filter(Boolean).join(' ') ||
                undefined
              }
              {...register(field.name)}
            />
            {field.hint ? (
              <p id={hintId} className="text-sm text-muted-foreground">
                {field.hint}
              </p>
            ) : null}
            {typeof message === 'string' ? (
              <p id={errorId} role="alert" className="text-sm text-danger">
                {message}
              </p>
            ) : null}
          </div>
        )
      })}
      <Button type="submit" disabled={busy}>
        {busy ? copy.auth.submitting : submitLabel}
      </Button>
    </form>
  )
}
