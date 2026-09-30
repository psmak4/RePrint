import { Input, Label } from '@reprint/ui'
import type { UseFormRegisterReturn } from 'react-hook-form'

/** A labelled input with its error message, wired for screen readers. */
export function TextField({
  id,
  label,
  type = 'text',
  autoComplete,
  hint,
  error,
  registration,
}: {
  id: string
  label: string
  type?: string
  autoComplete?: string
  hint?: string
  error?: string
  registration: UseFormRegisterReturn
}) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(' ')
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...registration}
      />
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
