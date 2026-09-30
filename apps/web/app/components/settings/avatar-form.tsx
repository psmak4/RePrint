import { Button, Input, Label } from '@reprint/ui'
import { useEffect, useRef, useState } from 'react'
import { useFetcher } from 'react-router'
import { copy } from '../../copy/index.js'

type UploadResult = { avatarUrl?: string; formError?: string }

/** Avatar picker with a local preview. The image is only sent when the Member presses Upload. */
export function AvatarForm({
  avatarUrl,
  displayName,
}: {
  avatarUrl: string | null
  displayName: string
}) {
  const c = copy.settings.avatar
  const fetcher = useFetcher<UploadResult>()
  const formRef = useRef<HTMLFormElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (!file) return setPreview(null)
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const uploaded = fetcher.data?.avatarUrl
  useEffect(() => {
    if (!uploaded) return
    formRef.current?.reset()
    setFile(null)
  }, [uploaded])

  const busy = fetcher.state !== 'idle'
  const shown = preview ?? avatarUrl
  const error = missing ? c.chooseFile : fetcher.data?.formError

  return (
    <section aria-labelledby="avatar-heading">
      <h2 id="avatar-heading" className="text-xl font-semibold">
        {c.title}
      </h2>
      <form
        ref={formRef}
        noValidate
        className="mt-4 flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (!file) return setMissing(true)
          const body = new FormData()
          body.set('file', file)
          fetcher.submit(body, {
            method: 'post',
            action: '/settings/avatar',
            encType: 'multipart/form-data',
          })
        }}
      >
        <div className="flex items-center gap-4">
          {shown ? (
            <img
              src={shown}
              alt={preview ? c.previewAlt : c.currentAlt}
              width={96}
              height={96}
              className="size-24 rounded-full object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex size-24 items-center justify-center rounded-full bg-surface text-3xl font-semibold"
            >
              {displayName.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="avatar-file">{c.fileLabel}</Label>
            <Input
              id="avatar-file"
              name="file"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              aria-describedby={['avatar-hint', error ? 'avatar-error' : null]
                .filter(Boolean)
                .join(' ')}
              onChange={(event) => {
                setMissing(false)
                setFile(event.currentTarget.files?.[0] ?? null)
              }}
            />
            <p id="avatar-hint" className="text-sm text-muted-foreground">
              {c.fileHint}
            </p>
          </div>
        </div>
        {error ? (
          <p id="avatar-error" role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        {uploaded && !file ? (
          <p role="status" className="text-sm">
            {c.uploaded}
          </p>
        ) : null}
        <div>
          <Button type="submit" disabled={busy}>
            {busy ? c.uploading : c.upload}
          </Button>
        </div>
      </form>
    </section>
  )
}
