import { z } from 'zod'
import { HttpProblem } from '../../errors.js'

/** Timestamps travel as Postgres text so microseconds survive the round trip through a cursor. */
const TIMESTAMPTZ_TEXT = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?[+-]\d{2}(:\d{2})?$/
const cursorPayloadSchema = z.object({
  at: z.string().regex(TIMESTAMPTZ_TEXT),
  id: z.uuid(),
})

export function encodeCursor(at: string, id: string): string {
  return Buffer.from(JSON.stringify({ at, id })).toString('base64url')
}

export function decodeCursor(cursor: string): z.infer<typeof cursorPayloadSchema> {
  try {
    return cursorPayloadSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')))
  } catch {
    throw new HttpProblem(400, 'The request did not pass validation.', {
      errors: [{ path: 'query.cursor', message: 'That cursor is not valid.' }],
    })
  }
}
