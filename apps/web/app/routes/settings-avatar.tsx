import { uploadAvatarResponseSchema } from '@reprint/shared'
import { data } from 'react-router'
import { copy } from '../copy/index.js'
import { failed, sendToApi } from '../lib/auth.server.js'
import type { Route } from './+types/settings-avatar'

/** Resource route: forwards the chosen image to the API as multipart form data. */
export async function action({ request }: Route.ActionArgs) {
  const file = (await request.formData()).get('file')
  if (!(file instanceof File) || file.size === 0) {
    return data({ formError: copy.settings.avatar.chooseFile }, { status: 400 })
  }
  const body = new FormData()
  body.set('file', file, file.name)
  const result = await sendToApi(
    request,
    'POST',
    '/v1/me/avatar',
    body,
    copy.settings.avatar.failed,
  )
  if (!result.ok) {
    // The form has no field to hang the error on, so the API's `body.file` message becomes a form message.
    const fileError = result.failure.fieldErrors?.file
    if (fileError) return data({ formError: fileError }, { status: result.status })
    return failed(result)
  }
  return uploadAvatarResponseSchema.parse(result.body)
}
