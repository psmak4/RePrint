import { zodResolver } from '@hookform/resolvers/zod'
import { BIO_MAX_LENGTH, type Me, updateMeRequestSchema } from '@reprint/shared'
import { Button, Checkbox, Input, Label, Textarea } from '@reprint/ui'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useFetcher } from 'react-router'
import type { z } from 'zod'
import { copy } from '../../copy/index.js'

type FormInput = z.input<typeof updateMeRequestSchema>
type FormOutput = z.output<typeof updateMeRequestSchema>
type Result = { saved?: boolean; formError?: string; fieldErrors?: Record<string, string> }

/** Display name, bio, library privacy, and review-decision emails, validated with the shared schema. */
export function ProfileForm({ me }: { me: Me }) {
  const c = copy.settings.profile
  const fetcher = useFetcher<Result>()
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(updateMeRequestSchema),
    defaultValues: {
      displayName: me.displayName,
      bio: me.bio ?? '',
      libraryPublic: me.libraryPublic,
      emailReviewDecisions: me.emailReviewDecisions,
    },
  })

  const serverFields = fetcher.data?.fieldErrors
  useEffect(() => {
    for (const [name, message] of Object.entries(serverFields ?? {})) {
      if (name in me) setError(name as keyof FormInput, { type: 'server', message })
    }
  }, [serverFields, setError, me])

  const bioLength = (watch('bio') ?? '').length
  const busy = fetcher.state !== 'idle'
  const nameError = errors.displayName?.message
  const bioError = errors.bio?.message

  return (
    <section aria-labelledby="profile-heading">
      <h2 id="profile-heading" className="text-xl font-semibold">
        {c.title}
      </h2>
      <p className="mt-1 text-muted-foreground">{c.lead}</p>
      <form
        noValidate
        className="mt-4 flex flex-col gap-5"
        onSubmit={handleSubmit((values) =>
          fetcher.submit(values as never, { method: 'post', encType: 'application/json' }),
        )}
      >
        {fetcher.data?.formError ? (
          <p role="alert" className="rounded-md border border-danger px-3 py-2 text-sm text-danger">
            {fetcher.data.formError}
          </p>
        ) : null}
        <div className="flex flex-col gap-2">
          <Label htmlFor="displayName">{c.displayNameLabel}</Label>
          <Input
            id="displayName"
            autoComplete="nickname"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? 'displayName-error' : undefined}
            {...register('displayName')}
          />
          {nameError ? (
            <p id="displayName-error" role="alert" className="text-sm text-danger">
              {nameError}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="bio">{c.bioLabel}</Label>
          <Textarea
            id="bio"
            rows={4}
            aria-invalid={bioError ? true : undefined}
            aria-describedby={['bio-counter', bioError ? 'bio-error' : null]
              .filter(Boolean)
              .join(' ')}
            {...register('bio')}
          />
          <p
            id="bio-counter"
            className={`text-sm ${bioLength > BIO_MAX_LENGTH ? 'text-danger' : 'text-muted-foreground'}`}
          >
            {c.bioCounter(bioLength, BIO_MAX_LENGTH)}
          </p>
          {bioError ? (
            <p id="bio-error" role="alert" className="text-sm text-danger">
              {bioError}
            </p>
          ) : null}
        </div>
        <div className="flex items-start gap-3">
          <Checkbox
            id="libraryPublic"
            aria-describedby="libraryPublic-hint"
            {...register('libraryPublic')}
          />
          <div>
            <Label htmlFor="libraryPublic">{c.libraryPublicLabel}</Label>
            <p id="libraryPublic-hint" className="text-sm text-muted-foreground">
              {c.libraryPublicHint}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Checkbox
            id="emailReviewDecisions"
            aria-describedby="emailReviewDecisions-hint"
            {...register('emailReviewDecisions')}
          />
          <div>
            <Label htmlFor="emailReviewDecisions">{c.emailDecisionsLabel}</Label>
            <p id="emailReviewDecisions-hint" className="text-sm text-muted-foreground">
              {c.emailDecisionsHint}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Button type="submit" disabled={busy}>
            {busy ? c.saving : c.save}
          </Button>
          {fetcher.data?.saved && !busy ? (
            <p role="status" className="text-sm">
              {c.saved}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  )
}
